import { NextResponse } from 'next/server';
import https from 'https';
import { createDecipheriv } from 'crypto';

export const maxDuration = 60;

const AES_KEY_HEX = 'C5D58EF67A7584E4A29F6C35BBC4EB12';

function decodeAesPayload(encBase64: string): any {
  try {
    const data = Buffer.from(encBase64, 'base64');
    const iv = data.subarray(0, 16);
    const content = data.subarray(16);
    const key = Buffer.from(AES_KEY_HEX, 'hex');

    const decipher = createDecipheriv('aes-128-cbc', key, iv);
    const decrypted = Buffer.concat([decipher.update(content), decipher.final()]);
    return JSON.parse(decrypted.toString('utf-8'));
  } catch (e) {
    return null;
  }
}

const fetchUrl = (url: string, headers = {}): Promise<string> => {
  return new Promise((resolve, reject) => {
    const follow = (targetUrl: string, depth = 0) => {
      if (depth > 5) return reject(new Error('Too many redirects'));
      const parsedUrl = new URL(targetUrl);
      https.get(targetUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36', ...headers }
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
  let artist = metadata.uploader || metadata.author || '';

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

  clean = clean.replace(/–/g, '-');
  
  if (!clean.includes('-') && clean.includes(':')) {
      clean = clean.replace(':', ' - ');
  }

  if (clean.includes('-')) {
      let parts = clean.split('-').map((p: string) => p.trim());
      clean = parts.filter((p: string) => p.length > 0).join(' - ');
  } else if (artist && !clean.toLowerCase().includes(artist.toLowerCase()) && !artist.toLowerCase().includes('topic')) {
      clean = `${artist} - ${clean}`;
  }

  return clean.replace(/\s+/g, ' ').trim();
}

async function searchYouTubeFirstVideoId(query: string): Promise<string | null> {
  // Method 1: Direct YouTube search page HTML parse
  try {
    const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const html = await res.text();
      const matches = Array.from(html.matchAll(/\/watch\?v=([a-zA-Z0-9_-]{11})/g)).map(m => m[1]);
      const uniqueIds = Array.from(new Set(matches));
      if (uniqueIds.length > 0) {
        return uniqueIds[0];
      }
    }
  } catch (e) {}

  // Method 2: yts fallback
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const yts = require('@vreden/youtube_scraper');
    const sRes = await yts.search(query);
    const list = sRes.results || sRes.result || [];
    const first = list.find((r: any) => (r.type === 'video' || r.videoId) && (r.url || r.videoId));
    if (first) {
      return first.videoId || (first.url ? getYouTubeVideoId(first.url) : null);
    }
  } catch (e) {}

  return null;
}

async function getSpotifyMetadata(url: string) {
  let title = '';
  let artist = '';
  let thumbnail = '';

  // 1. Fetch Spotify oEmbed
  try {
    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
    const data = await fetchUrl(oembedUrl);
    const json = JSON.parse(data);
    if (json.title) title = json.title;
    if (json.thumbnail_url) thumbnail = json.thumbnail_url;
  } catch (e) {}

  // 2. Fetch page title for complete artist & track info
  try {
    const html = await fetchUrl(url);
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    if (titleMatch) {
      const titleText = titleMatch[1];
      const spMatch = titleText.match(/^(.+?)\s*[-–]\s*(?:song.*?by|canción.*?de|música y letra de)\s*(.+?)\s*\|/i);
      if (spMatch) {
        return {
          track: spMatch[1].trim(),
          artist: spMatch[2].trim(),
          fullTitle: `${spMatch[2].trim()} - ${spMatch[1].trim()}`,
          thumbnail: thumbnail || ''
        };
      }
      const simpleMatch = titleText.match(/^(.+?)\s*\|/);
      if (simpleMatch && !title) {
        title = simpleMatch[1].trim();
      }
    }
  } catch (e) {}

  if (title) {
    return { track: title, artist, fullTitle: artist ? `${artist} - ${title}` : title, thumbnail };
  }

  throw new Error('No se pudo leer la información de Spotify');
}

async function getSoundCloudMetadata(url: string) {
  try {
    const oembedUrl = `https://soundcloud.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const data = await fetchUrl(oembedUrl);
    const json = JSON.parse(data);
    let title = (json.title || '').replace(/by.*$/i, '').trim();
    const author = json.author_name || '';
    if (author && !title.toLowerCase().includes(author.toLowerCase())) {
      title = `${author} - ${title}`;
    }
    return {
      title,
      author,
      thumbnail: json.thumbnail_url || ''
    };
  } catch (e) {
    throw new Error('No se pudo leer la información de SoundCloud');
  }
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

async function getSaveTubeInfo(videoId: string) {
  try {
    const cdns = ['cdn403.savetube.vip', 'cdn400.savetube.vip', 'cdn401.savetube.vip'];
    for (const cdn of cdns) {
      try {
        const res = await fetch(`https://${cdn}/v2/info`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://save-tube.com/',
          },
          body: JSON.stringify({ url: `https://www.youtube.com/watch?v=${videoId}` }),
          signal: AbortSignal.timeout(3500),
        });
        if (res.ok) {
          const json = await res.json();
          if (json && json.data) {
            const decoded = decodeAesPayload(json.data);
            if (decoded && decoded.title) {
              return {
                title: decoded.title,
                duration: decoded.duration || null,
                thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
              };
            }
          }
        }
      } catch (e) {}
    }
  } catch (e) {}
  return null;
}

export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: 'URL requerida' }, { status: 400 });

    const videoId = getYouTubeVideoId(url);
    let targetUrl = url;
    let title, thumbnail, duration, platform;

    // =========================================================================
    // 1. SPOTIFY TRACKS
    // =========================================================================
    if (url.includes('spotify.com') || url.includes('spotify.link')) {
      platform = 'spotify';
      const spotMeta = await getSpotifyMetadata(url);
      
      const query = spotMeta.artist && spotMeta.track 
        ? `${spotMeta.artist.split(',')[0].trim()} ${spotMeta.track}` 
        : `${spotMeta.fullTitle.replace(/[-|,]/g, ' ')} audio`;

      const matchedVideoId = await searchYouTubeFirstVideoId(query);
      if (matchedVideoId) {
        return NextResponse.json({
          title: spotMeta.fullTitle,
          thumbnail: spotMeta.thumbnail || `https://i.ytimg.com/vi/${matchedVideoId}/hqdefault.jpg`,
          duration: null,
          platform: 'spotify',
          resolvedUrl: `https://www.youtube.com/watch?v=${matchedVideoId}`,
          isPlaylist: false
        });
      }

      return NextResponse.json({
        title: spotMeta.fullTitle,
        thumbnail: spotMeta.thumbnail,
        duration: null,
        platform: 'spotify',
        resolvedUrl: url,
        isPlaylist: false
      });

    // =========================================================================
    // 2. SOUNDCLOUD TRACKS
    // =========================================================================
    } else if (url.includes('soundcloud.com')) {
      platform = 'soundcloud';
      const scMeta = await getSoundCloudMetadata(url);

      const matchedVideoId = await searchYouTubeFirstVideoId(scMeta.title);
      if (matchedVideoId) {
        return NextResponse.json({
          title: scMeta.title,
          thumbnail: scMeta.thumbnail || `https://i.ytimg.com/vi/${matchedVideoId}/hqdefault.jpg`,
          duration: null,
          platform: 'soundcloud',
          resolvedUrl: `https://www.youtube.com/watch?v=${matchedVideoId}`,
          isPlaylist: false
        });
      }

      return NextResponse.json({
        title: scMeta.title,
        thumbnail: scMeta.thumbnail,
        duration: null,
        platform: 'soundcloud',
        resolvedUrl: url,
        isPlaylist: false
      });

    // =========================================================================
    // 3. YOUTUBE VIDEOS (Standard, Shorts, with Playlist params)
    // =========================================================================
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

      const saveMeta = await getSaveTubeInfo(videoId);
      if (saveMeta) {
        return NextResponse.json({
          title: cleanTitle({ title: saveMeta.title }),
          thumbnail: saveMeta.thumbnail,
          duration: saveMeta.duration,
          platform: 'youtube',
          resolvedUrl: `https://www.youtube.com/watch?v=${videoId}`,
          isPlaylist: false
        });
      }

      return NextResponse.json({
        title: `YouTube Audio (${videoId})`,
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        duration: null,
        platform: 'youtube',
        resolvedUrl: `https://www.youtube.com/watch?v=${videoId}`,
        isPlaylist: false
      });

    // =========================================================================
    // 4. SEARCH QUERY (Plain song name or artist)
    // =========================================================================
    } else if (!url.startsWith('http')) {
      platform = 'search';

      const matchedVideoId = await searchYouTubeFirstVideoId(url);
      if (matchedVideoId) {
        const oembedMeta = await getYouTubeOEmbed(matchedVideoId);
        return NextResponse.json({
          title: oembedMeta ? cleanTitle({ title: oembedMeta.title, uploader: oembedMeta.author }) : url,
          thumbnail: oembedMeta?.thumbnail || `https://i.ytimg.com/vi/${matchedVideoId}/hqdefault.jpg`,
          duration: null,
          platform: 'youtube',
          resolvedUrl: `https://www.youtube.com/watch?v=${matchedVideoId}`,
          isPlaylist: false
        });
      }

      title = url;
      targetUrl = url;

    // =========================================================================
    // 5. OTHER DIRECT AUDIO URLS
    // =========================================================================
    } else {
      platform = 'other';
      title = 'Audio';
      targetUrl = url;
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
    console.error('Analyse Error:', error);
    return NextResponse.json({ error: error.message || 'Error analizando' }, { status: 500 });
  }
}
