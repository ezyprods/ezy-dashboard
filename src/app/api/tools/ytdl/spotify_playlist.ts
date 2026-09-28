/**
 * Spotify Playlist & Album Resolution Engine
 *
 * Strategy (in order of preference):
 *  1. Spotify Web API via Client Credentials (env SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET)
 *     → paginated, no user login, supports playlists of any size.
 *  2. Spotify anonymous access token extracted from the embed page
 *     → paginated via the internal partner API, supports playlists of any size.
 *  3. Embed __NEXT_DATA__ fallback (legacy, capped at ~100 tracks).
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

function buildTrack(
  item: any,
  fallbackThumb: string,
  fallbackUrl: string
): SpotifyPlaylistTrack {
  const track = item.track ?? item; // works for both playlist items and album tracks
  if (!track || !track.name) return null as any;

  const artists: string = Array.isArray(track.artists)
    ? track.artists.map((a: any) => a.name).join(', ')
    : '';
  const songName: string = track.name;
  const fullTitle = artists ? `${artists} - ${songName}` : songName;

  const trackId: string = track.id || '';
  const thumb: string =
    track.album?.images?.[0]?.url ||
    (Array.isArray(track.images) ? track.images[0]?.url : undefined) ||
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

// ---------------------------------------------------------------------------
// Strategy 1: Spotify Web API (Client Credentials)
// ---------------------------------------------------------------------------

let cachedClientToken: { token: string; expiresAt: number } | null = null;

async function getClientCredentialsToken(): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
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
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.access_token) return null;
    cachedClientToken = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    return data.access_token;
  } catch {
    return null;
  }
}

async function fetchAllViaWebAPI(
  type: string,
  id: string,
  token: string
): Promise<{ tracks: SpotifyPlaylistTrack[]; title: string; thumbnail: string } | null> {
  try {
    // Fetch playlist/album metadata first
    const metaRes = await fetch(`https://api.spotify.com/v1/${type}s/${id}?fields=name,images,tracks.total`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!metaRes.ok) return null;
    const meta = await metaRes.json();

    const playlistTitle: string = meta.name || 'Lista de Spotify';
    const thumbnail: string = meta.images?.[0]?.url || '';
    const totalTracks: number = meta.tracks?.total ?? 0;

    const allTracks: SpotifyPlaylistTrack[] = [];
    const LIMIT = 100;
    const totalPages = Math.ceil(totalTracks / LIMIT);

    console.log(`[spotify_playlist] Web API: fetching ${totalTracks} tracks in ${totalPages} page(s)`);

    // For albums the endpoint is /albums/:id/tracks, for playlists /playlists/:id/tracks
    const tracksEndpoint =
      type === 'album'
        ? `https://api.spotify.com/v1/albums/${id}/tracks`
        : `https://api.spotify.com/v1/playlists/${id}/tracks`;

    const fields =
      type === 'playlist'
        ? 'items(track(id,name,duration_ms,artists(name),album(images))),next'
        : 'items(id,name,duration_ms,artists(name)),next';

    let nextUrl: string | null =
      `${tracksEndpoint}?limit=${LIMIT}&offset=0&fields=${encodeURIComponent(fields)}`;

    while (nextUrl) {
      const pageRes: Response = await fetch(nextUrl, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15000),
      });
      if (!pageRes.ok) break;
      const page: any = await (pageRes as Response).json();

      const items: any[] = page.items ?? [];
      for (const item of items) {
        const track = buildTrack(item, thumbnail, `https://open.spotify.com/track/${item?.track?.id || item?.id || ''}`);
        if (track) allTracks.push(track);
      }

      nextUrl = page.next ?? null;
    }

    return { tracks: allTracks, title: playlistTitle, thumbnail };
  } catch (e) {
    console.error('[spotify_playlist] Web API error:', e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Strategy 2: Anonymous token from embed + internal partner API (no creds needed)
// ---------------------------------------------------------------------------

let cachedAnonToken: { token: string; expiresAt: number } | null = null;

async function getAnonSpotifyToken(): Promise<string | null> {
  if (cachedAnonToken && Date.now() < cachedAnonToken.expiresAt - 30_000) {
    return cachedAnonToken.token;
  }

  try {
    // Spotify's embed page exposes an anonymous access token in the page JS
    const res = await fetch('https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Token is embedded as: "accessToken":"BQA..."
    const tokenMatch = html.match(/"accessToken"\s*:\s*"([^"]+)"/);
    if (!tokenMatch) return null;

    // Expiry is embedded as: "accessTokenExpirationTimestampMs":1234567890123
    const expMatch = html.match(/"accessTokenExpirationTimestampMs"\s*:\s*(\d+)/);
    const expiresAt = expMatch ? parseInt(expMatch[1], 10) : Date.now() + 3600_000;

    cachedAnonToken = { token: tokenMatch[1], expiresAt };
    return tokenMatch[1];
  } catch {
    return null;
  }
}

async function fetchAllViaAnonAPI(
  type: string,
  id: string,
  token: string
): Promise<{ tracks: SpotifyPlaylistTrack[]; title: string; thumbnail: string } | null> {
  // Use the same Web API endpoint as Strategy 1 but with the anon token
  return fetchAllViaWebAPI(type, id, token);
}

// ---------------------------------------------------------------------------
// Strategy 3: Embed __NEXT_DATA__ fallback (legacy, ~100 track cap)
// ---------------------------------------------------------------------------

async function fetchViaEmbed(
  type: string,
  id: string,
  urlStr: string
): Promise<{ tracks: SpotifyPlaylistTrack[]; title: string; thumbnail: string; error?: string } | null> {
  try {
    const embedUrl = `https://open.spotify.com/embed/${type}/${id}`;
    const res = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return null;
    const html = await res.text();

    const nextMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]+?)<\/script>/);
    if (!nextMatch) return null;

    const data = JSON.parse(nextMatch[1]);
    const entity = data.props?.pageProps?.state?.data?.entity;
    if (!entity || !Array.isArray(entity.trackList) || entity.trackList.length === 0) return null;

    const rawTitle = entity.name || entity.title || 'Lista de Spotify';
    const playlistTitle = rawTitle.replace(/^\/+|\/+$/g, '').trim() || rawTitle;
    const thumbnail =
      entity.visualIdentity?.image?.[0]?.url ||
      entity.coverArt?.sources?.[0]?.url ||
      '';

    const tracks: SpotifyPlaylistTrack[] = entity.trackList.map((t: any, idx: number) => {
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
        thumbnail,
        url: trackId ? `https://open.spotify.com/track/${trackId}` : urlStr,
        duration: t.duration
          ? formatDuration(t.duration)
          : undefined,
      };
    });

    return { tracks, title: playlistTitle, thumbnail };
  } catch {
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
    const id = typeIndex !== -1 ? pathParts[typeIndex + 1]?.split('?')[0] : pathParts[0]?.split('?')[0];

    if (!id) return { error: 'ID de lista de Spotify no válido' };

    // ---- Try Strategy 1: Official Web API (client credentials) ----
    const clientToken = await getClientCredentialsToken();
    if (clientToken) {
      console.log('[spotify_playlist] Using Web API (client credentials)');
      const result = await fetchAllViaWebAPI(type, id, clientToken);
      if (result && result.tracks.length > 0) {
        return {
          playlist: {
            id,
            title: result.title,
            thumbnail: result.thumbnail,
            trackCount: result.tracks.length,
            tracks: result.tracks,
            platform: 'spotify',
          },
        };
      }
    }

    // ---- Try Strategy 2: Anonymous token from embed ----
    console.log('[spotify_playlist] Trying anonymous token strategy...');
    const anonToken = await getAnonSpotifyToken();
    if (anonToken) {
      console.log('[spotify_playlist] Got anonymous token, fetching full playlist');
      const result = await fetchAllViaAnonAPI(type, id, anonToken);
      if (result && result.tracks.length > 0) {
        return {
          playlist: {
            id,
            title: result.title,
            thumbnail: result.thumbnail,
            trackCount: result.tracks.length,
            tracks: result.tracks,
            platform: 'spotify',
          },
        };
      }
    }

    // ---- Fallback Strategy 3: Embed scraping (capped ~100 tracks) ----
    console.log('[spotify_playlist] Falling back to embed scraping (may be capped at ~100 tracks)');

    // Check accessibility first
    const probeRes = await fetch(`https://open.spotify.com/embed/${type}/${id}`, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(5000),
    }).catch(() => null);

    if (probeRes && (probeRes.status === 404 || probeRes.status === 403)) {
      return {
        error:
          'Esta lista de Spotify es privada o no existe. Para descargarla, ábrela en Spotify > pulsa (...) > "Hacer pública" o "Añadir a mi perfil".',
      };
    }

    const embedResult = await fetchViaEmbed(type, id, urlStr);
    if (embedResult && embedResult.tracks.length > 0) {
      return {
        playlist: {
          id,
          title: embedResult.title,
          thumbnail: embedResult.thumbnail,
          trackCount: embedResult.tracks.length,
          tracks: embedResult.tracks,
          platform: 'spotify',
        },
      };
    }

    return {
      error:
        'Esta lista de Spotify es privada o está vacía. Para descargarla, ábrela en Spotify > pulsa (...) > "Hacer pública".',
    };
  } catch (e: any) {
    console.error('[spotify_playlist] Failed to fetch playlist:', e);
    return { error: e.message || 'Error al procesar la lista de Spotify' };
  }
}
