import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import https from 'https';
import { ensureYtDlp } from '../binaries';
import { buildCookieArgs } from '../cookies';

export const maxDuration = 60;


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

function getYouTubeVideoId(urlStr: string): string | null {
  try {
    const parsed = new URL(urlStr);
    if (parsed.hostname.includes('youtube.com')) {
      return parsed.searchParams.get('v') || null;
    }
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.replace(/^\//, '').split('?')[0] || null;
    }
  } catch (e) {
    const match = urlStr.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    if (match) return match[1];
  }
  return null;
}

async function getYouTubeOEmbed(videoId: string) {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const data = await fetchUrl(oembedUrl);
    const json = JSON.parse(data);
    return {
      title: json.title as string,
      author: json.author_name as string,
      thumbnail: json.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
    };
  } catch (e) {
    return null;
  }
}

async function runYtDlp(ytdlpPath: string, args: string[], cookieArgs: string[] = []): Promise<any[]> {
  const commonArgs = [
    '--no-warnings',
    ...cookieArgs,
    '--extractor-args', 'youtube:player_client=android,ios,mweb',
    '--user-agent', 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
  ];

  const execute = (cmdArgs: string[]) => new Promise<any[]>((resolve, reject) => {
    const proc = spawn(ytdlpPath, cmdArgs);
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
      
      if (results.length === 0) reject(new Error(stderr || 'No results found'));
      else resolve(results);
    });
    proc.on('error', reject);
  });

  try {
    return await execute([...commonArgs, ...args]);
  } catch (err: any) {
    console.warn('YTDLP primary client failed, trying fallback client args...', err?.message || err);
    const fallbackArgs = [
      '--no-warnings',
      ...cookieArgs,
      '--extractor-args', 'youtube:player_client=android_vr,tv_downgraded',
      '--user-agent', 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
      ...args
    ];
    try {
      return await execute(fallbackArgs);
    } catch (fallbackErr: any) {
      console.warn('YTDLP fallback client failed, trying web_creator client args...', fallbackErr?.message || fallbackErr);
      const webCreatorArgs = [
        '--no-warnings',
        ...cookieArgs,
        '--extractor-args', 'youtube:player_client=android,mweb,web_creator',
        '--user-agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
        ...args
      ];
      return await execute(webCreatorArgs);
    }
  }
}

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: 'URL requerida' }, { status: 400 });

    const ytdlpPath = await ensureYtDlp();
    const cookieArgs = await buildCookieArgs();

    const videoId = getYouTubeVideoId(url);
    let targetUrl = url;
    let title, thumbnail, duration, platform;

    if (url.includes('spotify.com')) {
      platform = 'spotify';
      const spotMeta = await getSpotifyMetadata(url);
      
      const query = spotMeta.artist && spotMeta.track 
        ? `${spotMeta.artist.split(',')[0].trim()} ${spotMeta.track}` 
        : `${spotMeta.fullTitle.replace(/[-|,]/g, ' ')} audio`;

      const results = await runYtDlp(ytdlpPath, ['--dump-json', `ytsearch5:${query}`], cookieArgs);
      const entry = results[0];
      targetUrl = entry.webpage_url || entry.url;
      title = spotMeta.fullTitle;
      thumbnail = spotMeta.thumbnail || entry.thumbnail;
      duration = entry.duration;

    } else if (videoId) {
      platform = 'youtube';
      const oembedMeta = await getYouTubeOEmbed(videoId);
      
      if (oembedMeta) {
        return NextResponse.json({
          title: cleanTitle({ title: oembedMeta.title, uploader: oembedMeta.author }),
          thumbnail: oembedMeta.thumbnail,
          duration: null,
          platform: 'youtube',
          resolvedUrl: `https://www.youtube.com/watch?v=${videoId}`,
          isPlaylist: false
        });
      }

      let results: any[] = [];
      try {
        results = await runYtDlp(ytdlpPath, ['--dump-json', `https://www.youtube.com/watch?v=${videoId}`], cookieArgs);
      } catch (err) {
        results = await runYtDlp(ytdlpPath, ['--dump-json', `ytsearch1:${videoId}`], cookieArgs);
      }

      const entry = results[0] || {};
      targetUrl = `https://www.youtube.com/watch?v=${videoId}`;
      title = cleanTitle(entry);
      thumbnail = entry.thumbnail;
      duration = entry.duration;

    } else if (!url.startsWith('http')) {
      platform = 'search';
      const results = await runYtDlp(ytdlpPath, ['--dump-json', `ytsearch1:${url}`], cookieArgs);
      const entry = results[0];
      targetUrl = entry.webpage_url || entry.url;
      title = cleanTitle(entry);
      thumbnail = entry.thumbnail;
      duration = entry.duration;

    } else {
      platform = targetUrl.includes('soundcloud.com') ? 'soundcloud' : 'youtube';
      const results = await runYtDlp(ytdlpPath, ['--dump-json', '--flat-playlist', targetUrl], cookieArgs);
      
      if (results.length > 1) {
        return NextResponse.json({
          isPlaylist: true,
          count: results.length,
          title: results[0].playlist_title || 'Lista de reproduccion',
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
