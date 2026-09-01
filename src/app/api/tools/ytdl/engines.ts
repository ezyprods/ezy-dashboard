/**
 * Multi-Engine YouTube MP3 Download System
 * 
 * Provides multiple independent download engines that each use different 
 * third-party APIs to convert YouTube videos to MP3. Each engine is self-contained
 * and can work from any IP (including Vercel datacenter IPs) because the actual 
 * YouTube interaction happens on the third-party server, not on our server.
 * 
 * The engines are tried in priority order. If one fails, the next is tried.
 */

// ============================================================================
// Engine 1: @vreden/youtube_scraper (SaveTube)
// ============================================================================
async function engineVreden(videoId: string): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const yts = require('@vreden/youtube_scraper');
  const target = `https://www.youtube.com/watch?v=${videoId}`;
  const resData = await yts.ytmp3(target, '320');

  if (!resData?.status || !resData?.download?.url) {
    throw new Error('vreden: No download URL returned');
  }

  const downloadUrl: string = resData.download.url;
  const fetchRes = await fetch(downloadUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    },
  });

  if (!fetchRes.ok) {
    throw new Error(`vreden: HTTP ${fetchRes.status} downloading stream`);
  }

  const arrayBuffer = await fetchRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.length < 1000) {
    throw new Error(`vreden: Buffer too small (${buffer.length} bytes)`);
  }

  return buffer;
}

// ============================================================================
// Engine 2: cobalt.tools public API (open-source media downloader)
// ============================================================================
async function engineCobalt(videoId: string): Promise<Buffer> {
  const COBALT_APIS = [
    'https://api.cobalt.tools',
    'https://cobalt-api.kwiatekmiki.com',
    'https://cobalt.api.timelessnesses.me',
  ];

  let lastError: Error | null = null;

  for (const apiBase of COBALT_APIS) {
    try {
      const response = await fetch(`${apiBase}/`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: `https://www.youtube.com/watch?v=${videoId}`,
          downloadMode: 'audio',
          audioFormat: 'mp3',
          audioBitrate: '320',
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`cobalt(${apiBase}): HTTP ${response.status} - ${text.slice(0, 200)}`);
      }

      const data = await response.json();

      if (data.status === 'error') {
        throw new Error(`cobalt(${apiBase}): ${data.error?.code || data.text || 'Unknown error'}`);
      }

      // Cobalt returns a URL to download
      const downloadUrl = data.url || data.audio;
      if (!downloadUrl) {
        throw new Error(`cobalt(${apiBase}): No download URL in response`);
      }

      const audioRes = await fetch(downloadUrl);
      if (!audioRes.ok) {
        throw new Error(`cobalt(${apiBase}): HTTP ${audioRes.status} downloading audio`);
      }

      const arrayBuffer = await audioRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length < 1000) {
        throw new Error(`cobalt(${apiBase}): Buffer too small (${buffer.length} bytes)`);
      }

      return buffer;
    } catch (err: any) {
      lastError = err;
      console.warn(`[engines/cobalt] ${apiBase} failed:`, err?.message || err);
    }
  }

  throw lastError || new Error('cobalt: All instances failed');
}

// ============================================================================
// Engine 3: Direct YouTube audio extraction via fetch + ffmpeg conversion
// Uses YouTube's internal API (via @vreden/youtube_scraper metadata) to get info,
// then downloads via alternative CDN endpoints
// ============================================================================
async function engineDirectCdn(videoId: string): Promise<Buffer> {
  // Try multiple alternative download services
  const services = [
    {
      name: 'y2mate-style',
      getUrl: async () => {
        const apiUrl = `https://api.vevioz.com/api/button/mp3/${videoId}`;
        const res = await fetch(apiUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        // Extract download link from HTML response
        const match = html.match(/href="(https?:\/\/[^"]+\.mp3[^"]*)"/i) 
                   || html.match(/href="(https?:\/\/[^"]+download[^"]*)"/i);
        if (!match) throw new Error('No download link found');
        return match[1];
      },
    },
    {
      name: 'loader-to',
      getUrl: async () => {
        const apiUrl = `https://ab.cococococ.com/ajax/download/post`;
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          body: `url=https://www.youtube.com/watch?v=${videoId}&type=mp3&quality=320`,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!data.url) throw new Error('No URL returned');
        return data.url;
      },
    },
  ];

  let lastError: Error | null = null;

  for (const service of services) {
    try {
      const downloadUrl = await service.getUrl();
      const audioRes = await fetch(downloadUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      if (!audioRes.ok) throw new Error(`HTTP ${audioRes.status} downloading`);

      const arrayBuffer = await audioRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length < 1000) throw new Error(`Buffer too small (${buffer.length})`);
      return buffer;
    } catch (err: any) {
      lastError = err;
      console.warn(`[engines/directCdn] ${service.name} failed:`, err?.message);
    }
  }

  throw lastError || new Error('directCdn: All services failed');
}

// ============================================================================
// Main orchestrator: tries each engine in order
// ============================================================================
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
    { name: 'vreden', fn: engineVreden },
    { name: 'cobalt', fn: engineCobalt },
    { name: 'directCdn', fn: engineDirectCdn },
  ];

  const errors: string[] = [];

  for (let i = 0; i < engines.length; i++) {
    const engine = engines[i];
    try {
      console.log(`[engines] Trying engine "${engine.name}" (${i + 1}/${engines.length}) for videoId=${videoId}`);
      onProgress?.('downloading', 10 + (i * 20));

      const buffer = await engine.fn(videoId);

      console.log(`[engines] Success with engine "${engine.name}", size=${buffer.length}`);
      return { buffer, engine: engine.name };
    } catch (err: any) {
      const msg = (err?.message || String(err)).slice(0, 300);
      console.warn(`[engines] Engine "${engine.name}" failed: ${msg}`);
      errors.push(`${engine.name}: ${msg}`);
    }
  }

  throw new Error(
    `Todos los motores de descarga fallaron para este video.\n` +
    errors.map((e, i) => `  ${i + 1}. ${e}`).join('\n')
  );
}

/**
 * Non-YouTube download: just use yt-dlp binary as before.
 * This is a passthrough that signals the caller should use the yt-dlp binary approach.
 */
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
