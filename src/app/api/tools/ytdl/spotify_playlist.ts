/**
 * Spotify Playlist & Album Resolution Engine
 *
 * Spotify cerró todos los endpoints anónimos desde servidor en 2024.
 * El embed ahora usa JavaScript del lado del cliente para cargar los tracks,
 * por lo que el HTML inicial no contiene tokens ni datos de tracks.
 *
 * Estrategias:
 *  1. Spotify Web API (Client Credentials) → FULL pagination, ilimitado.
 *     Requiere SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET en .env.local
 *     Credenciales gratuitas en: https://developer.spotify.com/dashboard
 *  2. Embed __NEXT_DATA__ fallback → limitado a ~100 tracks (depende de Spotify).
 */

export interface SpotifyPlaylistTrack {
  videoId: string;
  title: string;
  artist?: string;
  trackName?: string;
  thumbnail: string;
  url: string;
  duration?: string;
}

export interface SpotifyPlaylistInfo {
  id: string;
  title: string;
  thumbnail: string;
  trackCount: number;
  tracks: SpotifyPlaylistTrack[];
  platform: 'spotify';
  isTruncated?: boolean; // true si hay más tracks que los devueltos
  totalCount?: number;   // total real según Spotify
}

export function isSpotifyPlaylistOrAlbum(urlStr: string): boolean {
  return (
    (urlStr.includes('spotify.com') || urlStr.includes('spotify.link')) &&
    (urlStr.includes('/playlist/') || urlStr.includes('/album/'))
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function buildTrackFromAPI(
  item: any,
  fallbackThumb: string,
  fallbackUrl: string
): SpotifyPlaylistTrack | null {
  const track = item.track ?? item; // playlists wrap in .track; albums are direct
  if (!track || !track.name) return null;

  const artists: string = Array.isArray(track.artists)
    ? track.artists.map((a: any) => a.name).join(', ')
    : '';
  const songName: string = track.name;
  const fullTitle = artists ? `${artists} - ${songName}` : songName;
  const trackId: string = track.id || '';
  const thumb: string =
    track.album?.images?.[0]?.url ||
    (Array.isArray(track.images) ? track.images[0]?.url : '') ||
    fallbackThumb;

  return {
    videoId: '',
    title: fullTitle,
    artist: artists,
    trackName: songName,
    thumbnail: thumb,
    url: trackId ? `https://open.spotify.com/track/${trackId}` : fallbackUrl,
    duration: track.duration_ms ? formatDuration(track.duration_ms) : undefined,
  };
}

function buildTrackFromEmbed(
  t: any,
  fallbackThumb: string,
  fallbackUrl: string,
  idx: number
): SpotifyPlaylistTrack {
  const artist = t.subtitle || '';
  const songName = t.title || `Pista ${idx + 1}`;
  const fullTitle =
    artist && !songName.toLowerCase().includes(artist.toLowerCase())
      ? `${artist} - ${songName}`
      : songName;
  const trackId = t.uri ? t.uri.replace('spotify:track:', '') : '';
  return {
    videoId: '',
    title: fullTitle,
    artist,
    trackName: songName,
    thumbnail: fallbackThumb,
    url: trackId ? `https://open.spotify.com/track/${trackId}` : fallbackUrl,
    duration: t.duration ? formatDuration(t.duration) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Strategy 1: Official Spotify Web API — Client Credentials
// ---------------------------------------------------------------------------

let cachedClientToken: { token: string; expiresAt: number } | null = null;

async function getClientCredentialsToken(): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;

  if (cachedClientToken && Date.now() < cachedClientToken.expiresAt - 30_000) {
    return cachedClientToken.token;
  }

  try {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(`[spotify_playlist] Client credentials auth failed: ${res.status}`);
      return null;
    }
    const data = await res.json();
    if (!data.access_token) return null;
    cachedClientToken = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    return data.access_token;
  } catch (e) {
    console.error('[spotify_playlist] getClientCredentialsToken error:', e);
    return null;
  }
}

async function fetchAllTracksWithToken(
  type: string,
  id: string,
  token: string,
  fallbackThumb: string,
  fallbackUrl: string
): Promise<SpotifyPlaylistTrack[] | null> {
  const LIMIT = 100;
  const allTracks: SpotifyPlaylistTrack[] = [];

  const baseEndpoint =
    type === 'album'
      ? `https://api.spotify.com/v1/albums/${id}/tracks`
      : `https://api.spotify.com/v1/playlists/${id}/tracks`;

  const fields =
    type === 'playlist'
      ? 'items(track(id,name,duration_ms,artists(name),album(images(url)))),next,total'
      : 'items(id,name,duration_ms,artists(name)),next,total';

  let nextUrl: string | null =
    `${baseEndpoint}?limit=${LIMIT}&offset=0&fields=${encodeURIComponent(fields)}`;

  let pageCount = 0;
  const MAX_PAGES = 50; // 50 × 100 = 5000 tracks max

  while (nextUrl && pageCount < MAX_PAGES) {
    pageCount++;
    let pageRes: Response;
    try {
      pageRes = await fetch(nextUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(15000),
      });
    } catch (e) {
      console.error(`[spotify_playlist] Page ${pageCount} fetch error:`, e);
      break;
    }

    if (!pageRes.ok) {
      console.error(`[spotify_playlist] API ${pageRes.status} on page ${pageCount}`);
      if (pageRes.status === 401 || pageRes.status === 403) return null;
      break;
    }

    const page: any = await pageRes.json();
    const items: any[] = page.items ?? [];

    for (const item of items) {
      const track = buildTrackFromAPI(item, fallbackThumb, fallbackUrl);
      if (track) allTracks.push(track);
    }

    nextUrl = page.next ?? null;
  }

  console.log(`[spotify_playlist] API pagination: ${allTracks.length} tracks in ${pageCount} pages`);
  return allTracks.length > 0 ? allTracks : null;
}

// ---------------------------------------------------------------------------
// Strategy 2: Embed __NEXT_DATA__ scraping (legacy, capped ~100 tracks)
// ---------------------------------------------------------------------------

async function fetchViaEmbed(
  type: string,
  id: string,
  urlStr: string
): Promise<{
  tracks: SpotifyPlaylistTrack[];
  title: string;
  thumbnail: string;
  totalCount: number;
  accessible: boolean;
} | null> {
  try {
    const embedUrl = `https://open.spotify.com/embed/${type}/${id}`;
    const res = await fetch(embedUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      return res.status === 404 || res.status === 403
        ? { tracks: [], title: '', thumbnail: '', totalCount: 0, accessible: false }
        : null;
    }

    const html = await res.text();

    const nextMatch = html.match(
      /<script id="__NEXT_DATA__" type="application\/json">([\s\S]+?)<\/script>/
    );
    if (!nextMatch) return { tracks: [], title: '', thumbnail: '', totalCount: 0, accessible: true };

    const data = JSON.parse(nextMatch[1]);
    const entity = data.props?.pageProps?.state?.data?.entity;

    // Spotify's new embed may not include entity data in the HTML (loaded via JS)
    if (!entity) {
      return { tracks: [], title: '', thumbnail: '', totalCount: 0, accessible: true };
    }

    const rawTitle = entity.name || entity.title || 'Lista de Spotify';
    const playlistTitle = rawTitle.replace(/^\/+|\/+$/g, '').trim() || rawTitle;
    const thumbnail: string =
      entity.visualIdentity?.image?.[0]?.url ||
      entity.coverArt?.sources?.[0]?.url ||
      '';

    const totalCount: number =
      entity.totalCount ??
      entity.trackCount ??
      (Array.isArray(entity.trackList) ? entity.trackList.length : 0);

    const tracks: SpotifyPlaylistTrack[] = Array.isArray(entity.trackList)
      ? entity.trackList.map((t: any, idx: number) =>
          buildTrackFromEmbed(t, thumbnail, urlStr, idx)
        )
      : [];

    return { tracks, title: playlistTitle, thumbnail, totalCount, accessible: true };
  } catch (e) {
    console.error('[spotify_playlist] fetchViaEmbed error:', e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function fetchSpotifyPlaylist(urlStr: string): Promise<{
  playlist?: SpotifyPlaylistInfo;
  error?: string;
}> {
  try {
    const parsed = new URL(urlStr);
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    const typeIndex = pathParts.findIndex((p) => p === 'playlist' || p === 'album');
    const type = typeIndex !== -1 ? pathParts[typeIndex] : 'playlist';
    const id = (
      typeIndex !== -1 ? pathParts[typeIndex + 1] : pathParts[0]
    )?.split('?')[0];

    if (!id) return { error: 'ID de lista de Spotify no válido' };

    console.log(`[spotify_playlist] Fetching ${type}/${id}`);

    // -------------------------------------------------------------------------
    // STRATEGY 1: Official Web API (Client Credentials) — unlimited pagination
    // -------------------------------------------------------------------------
    const clientToken = await getClientCredentialsToken();
    if (clientToken) {
      console.log('[spotify_playlist] Strategy 1: Web API (Client Credentials)');
      try {
        const metaRes = await fetch(
          `https://api.spotify.com/v1/${type}s/${id}?fields=name,images,tracks.total`,
          {
            headers: { Authorization: `Bearer ${clientToken}` },
            signal: AbortSignal.timeout(8000),
          }
        );

        if (metaRes.status === 404) {
          return {
            error:
              'Esta lista de Spotify no existe o es privada. Ábrela en Spotify > (...) > "Hacer pública".',
          };
        }

        if (metaRes.ok) {
          const meta = await metaRes.json();
          const title: string = meta.name || 'Lista de Spotify';
          const thumbnail: string = meta.images?.[0]?.url || '';
          const allTracks = await fetchAllTracksWithToken(
            type,
            id,
            clientToken,
            thumbnail,
            urlStr
          );
          if (allTracks && allTracks.length > 0) {
            console.log(`[spotify_playlist] ✓ Strategy 1 success: ${allTracks.length} tracks`);
            return {
              playlist: {
                id,
                title,
                thumbnail,
                trackCount: allTracks.length,
                tracks: allTracks,
                platform: 'spotify',
              },
            };
          }
        }
      } catch (e) {
        console.error('[spotify_playlist] Strategy 1 failed:', e);
      }
    } else {
      console.log(
        '[spotify_playlist] Strategy 1 skipped: SPOTIFY_CLIENT_ID/SECRET not configured'
      );
    }

    // -------------------------------------------------------------------------
    // STRATEGY 2: Embed scraping (legacy, capped ~100 tracks)
    // -------------------------------------------------------------------------
    console.log('[spotify_playlist] Strategy 2: Embed scraping (may be capped at ~100)');
    const embedResult = await fetchViaEmbed(type, id, urlStr);

    if (!embedResult) {
      return { error: 'Error de conexión con Spotify. Inténtalo de nuevo.' };
    }

    if (!embedResult.accessible) {
      return {
        error:
          'Esta lista de Spotify es privada o no existe. Ábrela en Spotify > pulsa (...) > "Hacer pública" o "Añadir a mi perfil".',
      };
    }

    if (embedResult.tracks.length > 0) {
      const isTruncated = embedResult.totalCount > embedResult.tracks.length;
      console.log(
        `[spotify_playlist] Strategy 2: ${embedResult.tracks.length}/${embedResult.totalCount} tracks (truncated: ${isTruncated})`
      );
      return {
        playlist: {
          id,
          title: embedResult.title,
          thumbnail: embedResult.thumbnail,
          trackCount: embedResult.tracks.length,
          tracks: embedResult.tracks,
          platform: 'spotify',
          isTruncated,
          totalCount: embedResult.totalCount,
        },
      };
    }

    // Embed gave us nothing — Spotify now loads tracks via JS (no SSR data)
    // We need Client Credentials to get the full list
    return {
      error:
        `⚠️ Esta playlist tiene ${embedResult.totalCount || 'más de 100'} canciones y Spotify ya no permite obtenerlas sin credenciales de API.\n\n` +
        `Para descargarlas todas, configura SPOTIFY_CLIENT_ID y SPOTIFY_CLIENT_SECRET en Ajustes.\n` +
        `Obtén credenciales gratuitas en: https://developer.spotify.com/dashboard`,
    };
  } catch (e: any) {
    console.error('[spotify_playlist] Uncaught error:', e);
    return { error: e.message || 'Error al procesar la lista de Spotify' };
  }
}
