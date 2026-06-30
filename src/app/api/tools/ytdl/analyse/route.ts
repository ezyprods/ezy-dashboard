import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import https from 'https';

export const maxDuration = 60;

const YTDLP_URL = os.platform() === 'win32' 
  ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
  : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';

const downloadFile = (url: string, dest: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const follow = (targetUrl: string, depth = 0) => {
      if (depth > 5) return reject(new Error('Too many redirects'));
      https.get(targetUrl, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          follow(response.headers.location!, depth + 1);
        } else {
          response.pipe(file);
          file.on('finish', () => { file.close(); resolve(); });
        }
      }).on('error', (err) => { fs.unlink(dest, () => reject(err)); });
    };
    follow(url);
  });
};

const ensureYtDlp = async () => {
  const tmpDir = os.tmpdir();
  const isWin = os.platform() === 'win32';
  const ytdlpPath = `${tmpDir}/${isWin ? 'yt-dlp-new.exe' : 'yt-dlp-new'}`;

  if (!fs.existsSync(ytdlpPath)) {
    console.log('Downloading yt-dlp for analysis...');
    await downloadFile(YTDLP_URL, ytdlpPath);
    if (!isWin) fs.chmodSync(ytdlpPath, '755');
  }
  return ytdlpPath;
};

const fetchUrl = (url: string, headers = {}): Promise<string> => {
  return new Promise((resolve, reject) => {
    const follow = (targetUrl: string, depth = 0) => {
      if (depth > 5) return reject(new Error('Too many redirects'));
      const parsedUrl = new URL(targetUrl);
      https.get(targetUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', ...headers }
      }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let redirect = res.headers.location;
          if (redirect.startsWith('/')) redirect = `${parsedUrl.protocol}//${parsedUrl.host}${redirect}`;
          return follow(redirect, depth + 1);
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    };
    follow(url);
  });
};

function cleanTitle(metadata: any) {
  let title = metadata.title || 'Untitled';
  let artist = metadata.uploader || '';

  if (metadata.artist && metadata.track) {
      return `${metadata.artist} - ${metadata.track}`;
  }

  const junkPatterns = [
      /\(Official Video\)/gi, /\[Official Video\]/gi, 
      /\(Video Oficial\)/gi, /\[Video Oficial\]/gi,
      /\(Official Audio\)/gi, /\[Official Audio\]/gi,
      /\(Audio Oficial\)/gi, /\[Audio Oficial\]/gi,
      /\(Official Visualizer\)/gi, /\[Official Visualizer\]/gi,
      /\(Visualizer\)/gi, /\[Visualizer\]/gi,
      /\(Lyrics Video\)/gi, /\(Lyrics\)/gi, /\[Lyrics\]/gi,
      /\(Full Mixtape\)/gi, /\[Full Mixtape\]/gi,
      /\(4K\)/gi, /\(HD\)/gi, /\(1080p\)/gi,
      /\[4K\]/gi, /\[HD\]/gi, /\[1080p\]/gi,
      /\| VEVO/gi, /\| Official/gi,
      /\(Music Video\)/gi, /\[Music Video\]/gi,
      // Producción y Dirección
      /prod\.?\s+by\s+[^()\[\]\-]+/gi,
      /prod\.?\s+[^()\[\]\-]+/gi,
      /\(prod\.?\s+[^()\[\]]+\)/gi,
      /\[prod\.?\s+[^()\[\]]+\]/gi,
      /dir\.?\s+by\s+[^()\[\]\-]+/gi,
      /\(dir\.?\s+[^()\[\]]+\)/gi
  ];

  let clean = title;
  
  junkPatterns.forEach(p => {
      clean = clean.replace(p, '');
  });

  // Normalizar guiones
  clean = clean.replace(/–/g, '-');
  
  if (!clean.includes('-') && clean.includes(':')) {
      clean = clean.replace(':', ' - ');
  }

  if (clean.includes('-')) {
      let parts = clean.split('-').map((p: string) => p.trim());
      clean = parts.filter((p: string) => p.length > 0).join(' - ');
  } else if (artist && !clean.toLowerCase().includes(artist.toLowerCase()) && !artist.toLowerCase().includes('topic')) {
      // Evitar que añada canales autogenerados como "Artista - Topic"
      clean = `${artist} - ${clean}`;
  }

  // Eliminar espacios múltiples y emojis sueltos raros al final (opcional, por ahora solo espacios)
  return clean.replace(/\s+/g, ' ').trim();
}

async function getSpotifyMetadata(url: string) {
  try {
      const html = await fetchUrl(url);
      const titleMatch = html.match(/<title>(.*?)<\/title>/);
      if (titleMatch) {
          const titleText = titleMatch[1];
          const spMatch = titleText.match(/^(.+?)\s*[-–]\s*(?:song.*?by|canción.*?de|música y letra de)\s*(.+?)\s*\|/i);
          if (spMatch) {
              return { track: spMatch[1].trim(), artist: spMatch[2].trim(), fullTitle: `${spMatch[2].trim()} - ${spMatch[1].trim()}` };
          }
          const simpleMatch = titleText.match(/^(.+?)\s*\|/);
          if (simpleMatch) {
              return { track: simpleMatch[1].trim(), artist: '', fullTitle: simpleMatch[1].trim() };
          }
      }
  } catch (e) { }

  try {
      const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
      const data = await fetchUrl(oembedUrl);
      const json = JSON.parse(data);
      return { track: json.title, artist: '', fullTitle: json.title, thumbnail: json.thumbnail_url };
  } catch (e) { }

  throw new Error('No se pudo leer la información de Spotify');
}

async function runYtDlp(ytdlpPath: string, args: string[]): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ytdlpPath, args);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', code => {
      if (code !== 0 && !stdout) return reject(new Error(stderr || `Error ${code}`));
      
      const lines = stdout.split('\n').filter(l => l.trim());
      const results = [];
      for (const line of lines) {
        try { results.push(JSON.parse(line)); } catch (e) { }
      }
      
      if (results.length === 0) reject(new Error('No results found'));
      else resolve(results);
    });
    proc.on('error', reject);
  });
}

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: 'URL requerida' }, { status: 400 });

    const ytdlpPath = await ensureYtDlp();

    let targetUrl = url;
    let title, thumbnail, duration, platform;

    if (url.includes('spotify.com')) {
      platform = 'spotify';
      const spotMeta = await getSpotifyMetadata(url);
      
      const query = spotMeta.artist && spotMeta.track 
        ? `${spotMeta.artist.split(',')[0].trim()} ${spotMeta.track}` 
        : `${spotMeta.fullTitle.replace(/[-|,]/g, ' ')} audio`;

      const results = await runYtDlp(ytdlpPath, ['--dump-json', '--no-warnings', `ytsearch5:${query}`]);
      const entry = results[0];
      targetUrl = entry.webpage_url || entry.url;
      title = spotMeta.fullTitle;
      thumbnail = spotMeta.thumbnail || entry.thumbnail;
      duration = entry.duration;

    } else if (!url.startsWith('http')) {
      platform = 'search';
      const results = await runYtDlp(ytdlpPath, ['--dump-json', '--no-warnings', `ytsearch1:${url}`]);
      const entry = results[0];
      targetUrl = entry.webpage_url || entry.url;
      title = cleanTitle(entry);
      thumbnail = entry.thumbnail;
      duration = entry.duration;

    } else {
      platform = url.includes('soundcloud.com') ? 'soundcloud' : 'youtube';
      const results = await runYtDlp(ytdlpPath, ['--dump-json', '--flat-playlist', '--no-warnings', targetUrl]);
      
      if (results.length > 1) {
        return NextResponse.json({
          isPlaylist: true,
          count: results.length,
          title: results[0].playlist_title || 'Lista de reproducción',
          thumbnail: results[0].thumbnail,
          platform,
          resolvedUrl: targetUrl
        });
      }

      const metadata = results[0];
      title = cleanTitle(metadata);
      thumbnail = metadata.thumbnail;
      duration = metadata.duration;
    }

    return NextResponse.json({ 
      title, 
      thumbnail, 
      duration, 
      platform, 
      resolvedUrl: targetUrl, 
      isPlaylist: false 
    });

  } catch (error: any) {
    console.error('YTDLP Analyse Error:', error);
    return NextResponse.json({ error: error.message || 'Error analizando' }, { status: 500 });
  }
}
