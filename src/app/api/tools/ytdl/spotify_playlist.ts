/**
 * Spotify Playlist, Album, Liked Songs & bulk-track resolution engine.
 *
 * Spotify's February 2026 Web API changes decide what is possible:
 *  - Albums and single tracks: readable with the app token (Client Credentials).
 *  - Playlist contents: ONLY with a user token (OAuth), and only for playlists
 *    that user owns or collaborates on. Liked Songs also need the user token.
 *  - Anything else: the public embed, which Spotify caps at the first 100 tracks.
 *
 * Strategies, in order:
 *  1. Playlist/Liked Songs → user token (`/playlists/{id}/items`, `/me/tracks`),
 *     full pagination with no limit.
 *  2. Album → app or user token (`/albums/{id}/tracks`), full pagination.
 *  3. Playlist that can't be read in full → embed (first 100) + a flag telling
 *     the UI why it's truncated and how to get the rest.
 *  4. Bulk paste of track links (Spotify desktop: Ctrl+A → Ctrl+C in any
 *     playlist) → works for ANY playlist; each track is resolved lazily by
 *     /process when it's downloaded (see buildPastedSpotifyTracks).
 */

import { getSpotifyAppToken, spotifyGet, type SpotifyUser } from '@/lib/spotify';

export interface SpotifyPlaylistTrack {
  videoId: string;
  title: string;
  artist?: string;
  trackName?: string;
  thumbnail: string;
  url: string;
  duration?: string;
}

/**
 * Why only part of a playlist could be read:
 *  - 'connect'   → Spotify isn't connected; connecting may unlock the full list.
 *  - 'not_owner' → connected, but the playlist belongs to someone else.
 */
export type SpotifyLimitReason = 'connect' | 'not_owner';

export interface SpotifyPlaylistInfo {
  id: string;
  title: string;
  thumbnail: string;
  trackCount: number;
  tracks: SpotifyPlaylistTrack[];
  platform: 'spotify';
  isTruncated?: boolean;
  totalCount?: number | null;
  limitReason?: SpotifyLimitReason;
}

const EMBED_CAP = 100;
const PAGE_SIZE = 50;
const MAX_TRACKS = 10_000;
const UNRESOLVED_PREFIX = 'Pista de Spotify ';

export function isSpotifyPlaylistOrAlbum(urlStr: string): boolean {
  return (
    (urlStr.includes('spotify.com') || urlStr.includes('spotify.link')) &&
    (urlStr.includes('/playlist/') || urlStr.includes('/album/') || urlStr.includes('/collection/tracks'))
  );
}

/**
 * All distinct Spotify track IDs in a blob of text, in order. Handles links
 * pasted into a single-line input (the browser strips the newlines, gluing
 * the URLs together) since track IDs are always 22 base-62 characters.
 */
export function extractSpotifyTrackIds(input: string): string[] {
  const ids = Array.from(
    input.matchAll(/(?:open\.spotify\.com\/(?:intl-[a-z]{2}\/)?track\/|spotify:track:)([A-Za-z0-9]{22})/g),
    (m) => m[1]
  );
  return Array.from(new Set(ids));
}

/** Tracks the bulk resolver ran out of time for — /process resolves them itself. */
export function isUnresolvedSpotifyTitle(title: string): boolean {
  return title.startsWith(UNRESOLVED_PREFIX);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  return `${Math.floor(totalSec / 60)}:${(totalSec % 60).toString().padStart(2, '0')}`;
}

function buildTrackFromAPI(track: any, fallbackThumb: string, fallbackUrl: string): SpotifyPlaylistTrack | null {
  if (!track?.name) return null;
  if (track.type && track.type !== 'track') return null; // skip podcast episodes

  const artists: string = Array.isArray(track.artists) ? track.artists.map((a: any) => a.name).join(', ') : '';
  return {
    videoId: '',
    title: artists ? `${artists} - ${track.name}` : track.name,
    artist: artists,
    trackName: track.name,
    thumbnail: track.album?.images?.[0]?.url || fallbackThumb,
    url: track.id ? `https://open.spotify.com/track/${track.id}` : fallbackUrl,
    duration: track.duration_ms ? formatDuration(track.duration_ms) : undefined,
  };
}

async function runPool<T>(count: number, concurrency: number, worker: (i: number) => Promise<T>): Promise<T[]> {
  const results = new Array<T>(count);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, count) }, async () => {
      while (next < count) {
        const i = next++;
        results[i] = await worker(i);
      }
    })
  );
  return results;
}

type PageResult = { status: 'ok'; items: any[]; total: number } | { status: 'forbidden' | 'error'; code: number };

/**
 * Reads every page of a paginated collection. The first page reveals the
 * total; the remaining pages are fetched in parallel. `pick` extracts the
 * track object from each item (playlists/liked wrap it, albums don't).
 */
async function fetchAllPages(
  endpoint: string,
  token: string,
  pick: (item: any) => any
): Promise<{ ok: true; tracks: any[]; total: number } | { ok: false; code: number }> {
  const sep = endpoint.includes('?') ? '&' : '?';
  const getPage = async (offset: number): Promise<PageResult> => {
    const res = await spotifyGet(`${endpoint}${sep}limit=${PAGE_SIZE}&offset=${offset}`, token);
    if (!res.ok) {
      console.error(`[spotify_playlist] ${endpoint} offset=${offset} → ${res.status}`);
      return { status: res.status === 401 || res.status === 403 ? 'forbidden' : 'error', code: res.status };
    }
    const page = await res.json();
    return { status: 'ok', items: page.items ?? [], total: page.total ?? 0 };
  };

  const first = await getPage(0);
  if (first.status !== 'ok') return { ok: false, code: first.code };

  const total = Math.min(first.total, MAX_TRACKS);
  const offsets: number[] = [];
  for (let o = PAGE_SIZE; o < total; o += PAGE_SIZE) offsets.push(o);

  const rest = await runPool(offsets.length, 5, (i) => getPage(offsets[i]));
  const tracks = first.items.map(pick);
  for (const page of rest) {
    if (page.status !== 'ok') return { ok: false, code: page.code };
    tracks.push(...page.items.map(pick));
  }
  return { ok: true, tracks, total: first.total };
}

// ---------------------------------------------------------------------------
// Embed fallback (public, capped at the first ~100 tracks)
// ---------------------------------------------------------------------------

async function fetchViaEmbed(type: string, id: string, urlStr: string) {
  try {
    // The embed answers bursts with 429 + `retry-after: 0`; back off and retry.
    let res: Response | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 2000 * attempt));
      res = await fetch(`https://open.spotify.com/embed/${type}/${id}`, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(12000),
      });
      if (res.status !== 429) break;
    }
    if (!res) return null;
    if (res.status === 429) return 'rate_limited';
    if (!res.ok) return res.status === 404 || res.status === 403 ? 'not_found' : null;

    const html = await res.text();
    const nextMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]+?)<\/script>/);
    const entity = nextMatch ? JSON.parse(nextMatch[1]).props?.pageProps?.state?.data?.entity : null;
    if (!entity) return null;

    const rawTitle: string = entity.name || entity.title || 'Lista de Spotify';
    const thumbnail: string = entity.visualIdentity?.image?.[0]?.url || entity.coverArt?.sources?.[0]?.url || '';
    const tracks: SpotifyPlaylistTrack[] = (Array.isArray(entity.trackList) ? entity.trackList : []).map(
      (t: any, idx: number) => {
        const artist: string = t.subtitle || '';
        const songName: string = t.title || `Pista ${idx + 1}`;
        const trackId = t.uri ? t.uri.replace('spotify:track:', '') : '';
        return {
          videoId: '',
          title: artist && !songName.toLowerCase().includes(artist.toLowerCase()) ? `${artist} - ${songName}` : songName,
          artist,
          trackName: songName,
          thumbnail,
          url: trackId ? `https://open.spotify.com/track/${trackId}` : urlStr,
          duration: t.duration ? formatDuration(t.duration) : undefined,
        };
      }
    );
    return { title: rawTitle.replace(/^\/+|\/+$/g, '').trim() || rawTitle, thumbnail, tracks };
  } catch (e) {
    console.error('[spotify_playlist] embed error:', e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function parseSpotifyUrl(urlStr: string): { type: 'playlist' | 'album' | 'liked'; id: string } | null {
  if (urlStr.includes('/collection/tracks')) return { type: 'liked', id: 'liked' };
  const parts = new URL(urlStr).pathname.split('/').filter(Boolean);
  const idx = parts.findIndex((p) => p === 'playlist' || p === 'album');
  if (idx === -1 || !parts[idx + 1]) return null;
  return { type: parts[idx] as 'playlist' | 'album', id: parts[idx + 1] };
}

export async function fetchSpotifyPlaylist(
  urlStr: string,
  user: SpotifyUser | null
): Promise<{ playlist?: SpotifyPlaylistInfo; error?: string }> {
  try {
    const target = parseSpotifyUrl(urlStr);
    if (!target) return { error: 'Enlace de Spotify no válido' };
    const { type, id } = target;
    console.log(`[spotify_playlist] ${type}/${id} (user: ${user ? user.displayName : 'none'})`);

    const done = (title: string, thumbnail: string, tracks: SpotifyPlaylistTrack[], extra: Partial<SpotifyPlaylistInfo> = {}) => ({
      playlist: { id, title, thumbnail, trackCount: tracks.length, tracks, platform: 'spotify' as const, ...extra },
    });

    // ── Liked Songs ─────────────────────────────────────────────────────────
    if (type === 'liked') {
      if (!user) return { error: 'Conecta tu cuenta de Spotify para descargar tus canciones favoritas.' };
      const all = await fetchAllPages('/me/tracks', user.accessToken, (it) => it.track);
      if (!all.ok) return { error: `Spotify no devolvió tus canciones favoritas (${all.code}).` };
      const tracks = all.tracks.map((t) => buildTrackFromAPI(t, '', urlStr)).filter(Boolean) as SpotifyPlaylistTrack[];
      return done('Canciones que te gustan', '', tracks);
    }

    // ── Albums (app token is enough) ────────────────────────────────────────
    if (type === 'album') {
      const token = user?.accessToken || (await getSpotifyAppToken());
      if (token) {
        const metaRes = await spotifyGet(`/albums/${id}`, token);
        if (metaRes.ok) {
          const meta = await metaRes.json();
          const thumb: string = meta.images?.[0]?.url || '';
          const all = await fetchAllPages(`/albums/${id}/tracks`, token, (it) => it);
          if (all.ok) {
            const tracks = all.tracks
              .map((t) => buildTrackFromAPI({ ...t, album: { images: meta.images } }, thumb, urlStr))
              .filter(Boolean) as SpotifyPlaylistTrack[];
            return done(meta.name || 'Álbum de Spotify', thumb, tracks);
          }
        } else if (metaRes.status === 404) {
          return { error: 'Este álbum de Spotify no existe.' };
        }
      }
      // fall through to the embed below
    }

    // ── Playlists with a user token (owned / collaborative → full list) ─────
    let limitReason: SpotifyLimitReason | undefined = user ? undefined : 'connect';
    if (type === 'playlist' && user) {
      const metaRes = await spotifyGet(
        `/playlists/${id}?fields=${encodeURIComponent('name,images,owner(id)')}`,
        user.accessToken
      );
      if (metaRes.ok) {
        const meta = await metaRes.json();
        const thumb: string = meta.images?.[0]?.url || '';
        const all = await fetchAllPages(
          `/playlists/${id}/items?additional_types=track`,
          user.accessToken,
          (it) => it.item ?? it.track
        );
        if (all.ok) {
          const tracks = all.tracks.map((t) => buildTrackFromAPI(t, thumb, urlStr)).filter(Boolean) as SpotifyPlaylistTrack[];
          console.log(`[spotify_playlist] ✓ full playlist via user token: ${tracks.length}/${all.total}`);
          return done(meta.name || 'Lista de Spotify', thumb, tracks);
        }
        limitReason = 'not_owner';
      } else if (metaRes.status === 404) {
        return { error: 'Esta lista de Spotify no existe o es privada de otra persona.' };
      }
    }

    // ── Embed fallback (first ~100 tracks) ──────────────────────────────────
    const embed = await fetchViaEmbed(type, id, urlStr);
    if (embed === 'not_found') {
      return {
        error: 'Esta lista de Spotify es privada o no existe. Ábrela en Spotify > (...) > "Hacer pública", o conecta tu cuenta si es tuya.',
      };
    }
    if (embed === 'rate_limited') {
      return { error: 'Spotify está limitando las peticiones ahora mismo. Espera un minuto y vuelve a intentarlo.' };
    }
    if (!embed || embed.tracks.length === 0) {
      return { error: 'Error de conexión con Spotify. Inténtalo de nuevo.' };
    }

    const isTruncated = type === 'playlist' && embed.tracks.length >= EMBED_CAP;
    return done(embed.title, embed.thumbnail, embed.tracks, {
      isTruncated,
      totalCount: null,
      limitReason: isTruncated ? limitReason ?? 'connect' : undefined,
    });
  } catch (e: any) {
    console.error('[spotify_playlist] Uncaught error:', e);
    return { error: e.message || 'Error al procesar la lista de Spotify' };
  }
}

/**
 * Turns pasted track IDs into download entries WITHOUT resolving them here.
 * Resolving hundreds of tracks up front trips Spotify's limits whichever
 * source is used (the Web API's /tracks has a small daily quota in
 * Development Mode; the embed throttles bursts), so each entry carries a
 * placeholder title and /process resolves "Artist - Track" right before
 * downloading it — naturally paced by the download queue.
 */
export function buildPastedSpotifyTracks(ids: string[]): SpotifyPlaylistTrack[] {
  return ids.map((id, i) => ({
    videoId: '',
    title: `${UNRESOLVED_PREFIX}${i + 1}`,
    thumbnail: '',
    url: `https://open.spotify.com/track/${id}`,
  }));
}
