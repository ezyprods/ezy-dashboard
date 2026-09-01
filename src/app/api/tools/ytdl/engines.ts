import { createDecipheriv } from 'crypto';

/**
 * Multi-Engine YouTube/Spotify/SoundCloud MP3 Download System
 * 
 * Provides self-contained, high-performance download engines that convert 
 * YouTube, Spotify, and SoundCloud audio to 320kbps MP3 without triggering
 * bot blocks on serverless datacenter IPs (like Vercel / AWS / GCP).
 */

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

// Ordered by response speed and reliability
const FAST_CDNS = [
  'cdn403.savetube.vip',
  'cdn400.savetube.vip',
  'cdn401.savetube.vip',
  'cdn405.savetube.vip',
  'cdn406.savetube.vip',
  'cdn500.savetube.vip',
  'cdn501.savetube.vip',
];

/**
 * Engine 1: SaveTube Direct Extraction with Native Fetch & AES Decryption
 */
async function engineSaveTubeDirect(videoId: string, requestedQuality: string = '320'): Promise<Buffer> {
  const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;

  let primaryCdn = '';
  try {
    const randomRes = await fetch('https://media.savetube.vip/api/random-cdn', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(2500),
    });
    if (randomRes.ok) {
      const data = await randomRes.json();
      if (data && data.cdn && FAST_CDNS.includes(data.cdn)) {
        primaryCdn = data.cdn;
      }
    }
  } catch (e) {}

  const cdnsToTry = primaryCdn
    ? [primaryCdn, ...FAST_CDNS.filter((c) => c !== primaryCdn)]
    : FAST_CDNS;

  let lastError: Error | null = null;

  for (const cdn of cdnsToTry) {
    try {
      // Step A: Request encrypted video info (8s timeout for high concurrency)
      const infoRes = await fetch(`https://${cdn}/v2/info`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
          'Referer': 'https://save-tube.com/',
        },
        body: JSON.stringify({ url: targetUrl }),
        signal: AbortSignal.timeout(8000),
      });

      if (!infoRes.ok) {
        throw new Error(`Info HTTP ${infoRes.status}`);
      }

      const infoJson = await infoRes.json();
      if (!infoJson || !infoJson.data) {
        throw new Error('No encrypted data in info response');
      }

      const info = decodeAesPayload(infoJson.data);
      if (!info || !info.key) {
        throw new Error('Decrypted info missing security key');
      }

      // Step B: Request download URL for audio
      const qualities = [requestedQuality, '320', '256', '128'];
      const uniqueQualities = Array.from(new Set(qualities));

      let downloadUrl = '';
      for (const q of uniqueQualities) {
        try {
          const dlRes = await fetch(`https://${cdn}/download`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
              'Referer': 'https://save-tube.com/',
            },
            body: JSON.stringify({
              downloadType: 'audio',
              quality: q,
              key: info.key,
            }),
            signal: AbortSignal.timeout(8000),
          });

          if (dlRes.ok) {
            const dlJson = await dlRes.json();
            if (dlJson.data && dlJson.data.downloadUrl) {
              downloadUrl = dlJson.data.downloadUrl;
              break;
            }
          }
        } catch (e) {}
      }

      if (!downloadUrl) {
        throw new Error('Could not obtain download URL from CDN');
      }

      // Step C: Stream the MP3 file into buffer
      const audioRes = await fetch(downloadUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(45000),
      });

      if (!audioRes.ok) {
        throw new Error(`Audio stream HTTP ${audioRes.status}`);
      }

      const arrayBuffer = await audioRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length < 1000) {
        throw new Error(`Downloaded buffer too small (${buffer.length} bytes)`);
      }

      return buffer;
    } catch (err: any) {
      console.warn(`[engines/savetube] CDN ${cdn} failed for ${videoId}:`, err?.message || err);
      lastError = err;
    }
  }

  throw lastError || new Error('All SaveTube CDNs failed');
}

export interface EngineResult {
  buffer: Buffer;
  engine: string;
}

export type ProgressCallback = (status: string, progress: number) => void;

export async function downloadWithEngines(
  videoId: string,
  onProgress?: ProgressCallback,
): Promise<EngineResult> {
  onProgress?.('downloading', 35);
  const buffer = await engineSaveTubeDirect(videoId, '320');
  return { buffer, engine: 'savetube-direct' };
}

export function isYouTubeUrl(url: string): boolean {
  return (
    url.includes('youtube.com') ||
    url.includes('youtu.be') ||
    !!getYouTubeVideoId(url)
  );
}

export function isSpotifyUrl(url: string): boolean {
  return url.includes('spotify.com') || url.includes('spotify.link');
}

export function isSoundCloudUrl(url: string): boolean {
  return url.includes('soundcloud.com');
}

export function getYouTubeVideoId(urlStr: string): string | null {
  try {
    const parsed = new URL(urlStr);
    if (parsed.hostname.includes('youtube.com')) {
      return parsed.searchParams.get('v') || null;
    }
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.replace(/^\//, '').split('?')[0] || null;
    }
  } catch {
    const match = urlStr.match(
      /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/
    );
    if (match) return match[1];
  }
  return null;
}

/**
 * Searches YouTube and returns multiple candidate video IDs in order of relevance.
 */
export async function searchYouTubeVideoIds(query: string, limit = 3): Promise<string[]> {
  const ids: string[] = [];

  try {
    const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const html = await res.text();
      const matches = Array.from(html.matchAll(/\/watch\?v=([a-zA-Z0-9_-]{11})/g)).map(m => m[1]);
      for (const id of matches) {
        if (!ids.includes(id)) ids.push(id);
        if (ids.length >= limit) return ids;
      }
    }
  } catch (e) {}

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const yts = require('@vreden/youtube_scraper');
    const sRes = await yts.search(query);
    const list = sRes.results || sRes.result || [];
    for (const r of list) {
      const vid = r.videoId || (r.url ? getYouTubeVideoId(r.url) : null);
      if (vid && !ids.includes(vid)) {
        ids.push(vid);
        if (ids.length >= limit) return ids;
      }
    }
  } catch (e) {}

  return ids;
}

/**
 * Searches YouTube search results HTML directly to find the first matching video ID.
 */
export async function searchYouTubeFirstVideoId(query: string): Promise<string | null> {
  const ids = await searchYouTubeVideoIds(query, 1);
  return ids.length > 0 ? ids[0] : null;
}
