import { createDecipheriv } from 'crypto';

/**
 * Multi-Engine YouTube MP3 Download System
 * 
 * Provides self-contained, high-performance download engines that convert 
 * YouTube videos to 320kbps MP3 without triggering bot blocks on serverless
 * datacenter IPs (like Vercel / AWS / GCP).
 */

const AES_KEY_HEX = 'C5D58EF67A7584E4A29F6C35BBC4EB12';

function decodeAesPayload(encBase64: string): any {
  const data = Buffer.from(encBase64, 'base64');
  const iv = data.subarray(0, 16);
  const content = data.subarray(16);
  const key = Buffer.from(AES_KEY_HEX, 'hex');

  const decipher = createDecipheriv('aes-128-cbc', key, iv);
  const decrypted = Buffer.concat([decipher.update(content), decipher.final()]);
  return JSON.parse(decrypted.toString('utf-8'));
}

// Known active SaveTube CDNs
const FALLBACK_CDNS = [
  'cdn400.savetube.vip',
  'cdn401.savetube.vip',
  'cdn402.savetube.vip',
  'cdn403.savetube.vip',
  'cdn404.savetube.vip',
  'cdn405.savetube.vip',
  'cdn406.savetube.vip',
];

/**
 * Engine 1: SaveTube Direct Extraction with Native Fetch & AES Decryption
 * Direct communication with SaveTube CDNs (bypassing any local YouTube scraping).
 */
async function engineSaveTubeDirect(videoId: string, requestedQuality: string = '320'): Promise<Buffer> {
  const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;

  // 1. Get primary CDN from randomizer endpoint or fallback to known CDNs
  let primaryCdn = '';
  try {
    const randomRes = await fetch('https://media.savetube.vip/api/random-cdn', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(4000),
    });
    if (randomRes.ok) {
      const data = await randomRes.json();
      if (data && data.cdn) {
        primaryCdn = data.cdn;
      }
    }
  } catch (e) {
    // Silently proceed to fallback CDNs
  }

  const cdnsToTry = primaryCdn
    ? [primaryCdn, ...FALLBACK_CDNS.filter((c) => c !== primaryCdn)]
    : FALLBACK_CDNS;

  let lastError: Error | null = null;

  for (const cdn of cdnsToTry) {
    try {
      // Step A: Request encrypted video info
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

      // Step B: Request download URL for audio (try requested quality, then fallback)
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
        } catch (e) {
          // Try next quality
        }
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
      console.warn(`[engines/savetube] CDN ${cdn} failed:`, err?.message || err);
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
  const engines: Array<{
    name: string;
    fn: (videoId: string) => Promise<Buffer>;
  }> = [
    { name: 'savetube-direct-320', fn: (id) => engineSaveTubeDirect(id, '320') },
    { name: 'savetube-direct-256', fn: (id) => engineSaveTubeDirect(id, '256') },
    { name: 'savetube-direct-128', fn: (id) => engineSaveTubeDirect(id, '128') },
  ];

  const errors: string[] = [];

  for (let i = 0; i < engines.length; i++) {
    const engine = engines[i];
    try {
      console.log(`[engines] Executing "${engine.name}" for videoId=${videoId}`);
      onProgress?.('downloading', 25 + (i * 20));

      const buffer = await engine.fn(videoId);

      console.log(`[engines] Engine "${engine.name}" succeeded! Buffer size: ${buffer.length} bytes`);
      return { buffer, engine: engine.name };
    } catch (err: any) {
      const msg = (err?.message || String(err)).slice(0, 300);
      console.warn(`[engines] Engine "${engine.name}" failed: ${msg}`);
      errors.push(`${engine.name}: ${msg}`);
    }
  }

  throw new Error(
    `Todos los motores de descarga fallaron para este video.\n` +
    errors.map((e, idx) => `  ${idx + 1}. ${e}`).join('\n')
  );
}

export function isYouTubeUrl(url: string): boolean {
  return (
    url.includes('youtube.com') ||
    url.includes('youtu.be') ||
    !!getYouTubeVideoId(url)
  );
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
