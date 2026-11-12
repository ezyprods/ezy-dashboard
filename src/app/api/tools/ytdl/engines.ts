import { createDecipheriv } from 'crypto';
import { ensureBinaries } from './binaries';
import { assertCompleteAudio, getYouTubeDurationSeconds, IncompleteAudioError } from './verify';

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
async function engineSaveTubeDirect(
  videoId: string,
  requestedQuality: string = '320',
): Promise<{ buffer: Buffer; expectedSeconds: number | null; decodedSeconds: number }> {
  const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const startedAt = Date.now();

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

      // Step C: fetch the MP3 and make sure it is the WHOLE song.
      //
      // SaveTube hands out the file while it is still converting, and its
      // Cloudflare CDN caches that partial copy for 30 days — the root cause
      // of songs stopping halfway. So: decode every copy and compare it with
      // the video length; if it's short, bypass the CDN cache with a unique
      // query string and wait for the origin to finish converting.
      const expected = Number(info.duration) > 0
        ? Number(info.duration)
        : await getYouTubeDurationSeconds(videoId);
      const { ffmpegPath } = await ensureBinaries();

      for (let attempt = 0; ; attempt++) {
        const url = attempt === 0
          ? downloadUrl
          : `${downloadUrl}${downloadUrl.includes('?') ? '&' : '?'}ezy=${Date.now()}${attempt}`;
        const buffer = await fetchAudio(url);
        try {
          const m = await assertCompleteAudio(ffmpegPath, buffer, expected);
          if (!expected) {
            // No reference length: only trust a copy the origin no longer grows.
            await new Promise((r) => setTimeout(r, 3000));
            const again = await fetchAudio(`${downloadUrl}${downloadUrl.includes('?') ? '&' : '?'}ezy=${Date.now()}s`);
            if (again.length !== buffer.length) throw new IncompleteAudioError(m.decodedSeconds, 0);
          }
          if (attempt > 0) console.log(`[engines/savetube] ${videoId}: complete copy after ${attempt} retries`);
          return { buffer, expectedSeconds: expected, decodedSeconds: m.decodedSeconds };
        } catch (e: any) {
          if (!(e instanceof IncompleteAudioError)) throw e;
          console.warn(`[engines/savetube] ${videoId}: ${e.message} (intento ${attempt + 1})`);
          if (Date.now() - startedAt > SAVETUBE_COMPLETE_DEADLINE_MS) {
            throw new FatalSaveTubeError(`SaveTube solo entrega un audio incompleto (${e.message})`);
          }
          // First retry right away (most cuts are just a stale CDN copy),
          // then give the origin time to finish converting.
          if (attempt > 0) await new Promise((r) => setTimeout(r, 5000));
        }
      }
    } catch (err: any) {
      console.warn(`[engines/savetube] CDN ${cdn} failed for ${videoId}:`, err?.message || err);
      lastError = err;
      // Another CDN host serves the same broken file; don't burn minutes on it.
      if (err instanceof FatalSaveTubeError) break;
    }
  }

  throw lastError || new Error('All SaveTube CDNs failed');
}

/** Max time spent waiting for SaveTube to produce a complete file. */
const SAVETUBE_COMPLETE_DEADLINE_MS = 75_000;

class FatalSaveTubeError extends Error {}

async function fetchAudio(url: string): Promise<Buffer> {
  const audioRes = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(60000),
  });
  if (!audioRes.ok) {
    throw new Error(`Audio stream HTTP ${audioRes.status}`);
  }
  const buffer = Buffer.from(await audioRes.arrayBuffer());
  const declared = Number(audioRes.headers.get('content-length') || 0);
  if (declared && buffer.length !== declared) {
    throw new Error(`Descarga cortada (${buffer.length} de ${declared} bytes)`);
  }
  if (buffer.length < 1000) {
    throw new Error(`Downloaded buffer too small (${buffer.length} bytes)`);
  }
  return buffer;
}

export interface EngineResult {
  buffer: Buffer;
  engine: string;
  /** Length of the source video (null if unknown). */
  expectedSeconds: number | null;
  /** Verified decoded length of `buffer`. */
  decodedSeconds: number;
}

export type ProgressCallback = (status: string, progress: number) => void;

/** Returns only files whose full length has been verified (see verify.ts). */
export async function downloadWithEngines(
  videoId: string,
  onProgress?: ProgressCallback,
): Promise<EngineResult> {
  onProgress?.('downloading', 35);
  const r = await engineSaveTubeDirect(videoId, '320');
  return { ...r, engine: 'savetube-direct' };
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

// ─── Spotify → YouTube matching ────────────────────────────────────────────
//
// Root cause of "descarga audios incorrectos" from Spotify links: every call
// site used to take the FIRST raw video ID scraped from a YouTube search
// results page with zero verification that it actually matched the requested
// song. YouTube's search HTML also contains watch-URL links that aren't the
// visually-first organic result (ads, "mix"/related-video carousels), and a
// query built from the track title alone (no artist — which is all Spotify's
// oEmbed endpoint gives you) is often ambiguous enough to match a completely
// different song, a cover, a reaction video, etc.
//
// The fix: fetch several candidates, pull lightweight metadata (title +
// channel) for each via YouTube's oEmbed endpoint, and score them against the
// expected artist/track before picking one. Falls back to the previous
// "first candidate" behavior only when nothing scores as a plausible match,
// so this can't make things worse than before, only better.

interface YouTubeOEmbedLite {
  title: string;
  author: string;
  thumbnail: string;
}

export async function getYouTubeOEmbedLite(videoId: string): Promise<YouTubeOEmbedLite | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return null;
    const json = await res.json();
    return {
      title: json.title || '',
      author: json.author_name || '',
      thumbnail: json.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    };
  } catch {
    return null;
  }
}

function normalizeForMatch(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Heuristic relevance score of a YouTube candidate against the expected artist/track. */
function scoreYouTubeCandidate(candidateTitle: string, candidateAuthor: string, expectedArtist: string, expectedTrack: string): number {
  const title = normalizeForMatch(candidateTitle);
  const author = normalizeForMatch(candidateAuthor);
  const eTrack = normalizeForMatch(expectedTrack);
  // Multiple artists are often comma/&-separated on Spotify — matching the
  // first one is enough to disambiguate most cases.
  const eArtist = normalizeForMatch((expectedArtist || '').split(/[,&]/)[0]);

  let score = 0;

  if (eTrack) {
    if (title.includes(eTrack)) {
      score += 3;
    } else {
      const trackWords = eTrack.split(' ').filter(w => w.length > 2);
      if (trackWords.length > 0) {
        const matched = trackWords.filter(w => title.includes(w)).length;
        score += 2 * (matched / trackWords.length);
      }
    }
  }

  if (eArtist) {
    if (title.includes(eArtist) || author.includes(eArtist)) {
      score += 2;
    } else {
      const firstWord = eArtist.split(' ')[0];
      if (firstWord.length > 2 && (title.includes(firstWord) || author.includes(firstWord))) {
        score += 1;
      }
    }
  }

  // Content that's clearly not the plain track (reaction videos, sped-up/nightcore
  // edits, karaoke instrumentals) shouldn't outrank a real match just because the
  // title happens to contain the song name too.
  if (/\breaction\b|\bkaraoke\b|nightcore|sped up|speed up|8d audio|\bcover\b/i.test(candidateTitle)) {
    score -= 2;
  }

  return score;
}

/**
 * Finds the best-matching YouTube video for a track, verifying candidates
 * against the expected artist/track instead of blindly trusting the first
 * search result. Always returns a candidate if the search itself found any
 * (falling back to the first one when none score as a confident match), so
 * this never reduces the success rate of resolving a video at all — it just
 * makes the resolved video the right one far more often.
 */
export async function pickBestYouTubeMatch(
  query: string,
  expectedArtist: string,
  expectedTrack: string,
  limit = 5
): Promise<{ videoId: string; title: string; author: string; thumbnail: string } | null> {
  const candidateIds = await searchYouTubeVideoIds(query, limit);
  if (candidateIds.length === 0) return null;

  const withMeta = await Promise.all(
    candidateIds.map(async (id) => ({ id, meta: await getYouTubeOEmbedLite(id) }))
  );

  let best = withMeta[0];
  let bestScore = -Infinity;
  for (const candidate of withMeta) {
    const score = candidate.meta
      ? scoreYouTubeCandidate(candidate.meta.title, candidate.meta.author, expectedArtist, expectedTrack)
      : -1; // no metadata at all → least preferred, but still a valid last resort
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return {
    videoId: best.id,
    title: best.meta?.title || '',
    author: best.meta?.author || '',
    thumbnail: best.meta?.thumbnail || `https://i.ytimg.com/vi/${best.id}/hqdefault.jpg`,
  };
}

export interface SpotifyTrackMetadata {
  track: string;
  artist: string;
  fullTitle: string;
  thumbnail: string;
}

/**
 * Extracts { artist, track } for a single Spotify track from the same
 * __NEXT_DATA__ embed JSON Spotify serves for playlists/albums — far more
 * reliable than scraping the page's <title> tag (which silently drops the
 * artist whenever Spotify's locale/copy format doesn't match the expected
 * pattern), and much better than the oEmbed endpoint, which only ever
 * returns the track name with no artist at all.
 */
export async function getSpotifyTrackMetadata(url: string): Promise<SpotifyTrackMetadata> {
  const idMatch = url.match(/track\/([a-zA-Z0-9]+)/);
  const trackId = idMatch ? idMatch[1] : null;

  if (trackId) {
    try {
      // The embed throttles bursts with 429 + `retry-after: 0` (e.g. when a
      // whole pasted playlist is downloading) — back off briefly and retry.
      let res: Response | null = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt));
        res = await fetch(`https://open.spotify.com/embed/track/${trackId}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
          },
          signal: AbortSignal.timeout(8000),
        });
        if (res.status !== 429) break;
      }
      if (res?.ok) {
        const html = await res.text();
        const nextMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]+?)<\/script>/);
        if (nextMatch) {
          const data = JSON.parse(nextMatch[1]);
          const entity = data.props?.pageProps?.state?.data?.entity;
          if (entity) {
            const track: string = entity.title || entity.name || '';
            const artist: string =
              entity.subtitle ||
              (Array.isArray(entity.artists) ? entity.artists.map((a: any) => a.name).join(', ') : '') ||
              '';
            const thumbnail: string = entity.visualIdentity?.image?.[0]?.url || entity.coverArt?.sources?.[0]?.url || '';
            if (track) {
              return {
                track,
                artist,
                fullTitle: artist && !track.toLowerCase().includes(artist.toLowerCase()) ? `${artist} - ${track}` : track,
                thumbnail,
              };
            }
          }
        }
      }
    } catch (e) {}
  }

  // Fallback: oEmbed gives at least the track title (never the artist)
  try {
    const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const json = await res.json();
      if (json.title) {
        return { track: json.title, artist: '', fullTitle: json.title, thumbnail: json.thumbnail_url || '' };
      }
    }
  } catch (e) {}

  throw new Error('Esta pista de Spotify es privada o no se pudo acceder. Asegúrate de que sea pública.');
}
