/**
 * Spotify Playlist & Album Resolution Engine
 * 
 * Extracts full track listings and cover art from public Spotify playlists and albums
 * via Spotify's embed metadata without requiring user authentication.
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

export async function fetchSpotifyPlaylist(urlStr: string): Promise<SpotifyPlaylistInfo | null> {
  try {
    const parsed = new URL(urlStr);
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    const typeIndex = pathParts.findIndex((p) => p === 'playlist' || p === 'album');
    const type = typeIndex !== -1 ? pathParts[typeIndex] : 'playlist';
    const id = typeIndex !== -1 ? pathParts[typeIndex + 1] : pathParts[0];

    if (!id) return null;

    const embedUrl = `https://open.spotify.com/embed/${type}/${id}`;
    const res = await fetch(embedUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;
    const html = await res.text();
    const nextMatch = html.match(
      /<script id="__NEXT_DATA__" type="application\/json">([\s\S]+?)<\/script>/
    );
    if (!nextMatch) return null;

    const data = JSON.parse(nextMatch[1]);
    const entity = data.props?.pageProps?.state?.data?.entity;
    if (!entity || !Array.isArray(entity.trackList)) return null;

    const playlistTitle = entity.name || entity.title || 'Lista de Spotify';
    const thumbnail =
      entity.visualIdentity?.image?.[0]?.url ||
      entity.coverArt?.sources?.[0]?.url ||
      '';

    const tracks: SpotifyPlaylistTrack[] = entity.trackList.map(
      (t: any, idx: number) => {
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
          thumbnail: thumbnail,
          url: trackId ? `https://open.spotify.com/track/${trackId}` : urlStr,
          duration: t.duration
            ? `${Math.floor(t.duration / 60000)}:${Math.floor(
                (t.duration % 60000) / 1000
              )
                .toString()
                .padStart(2, '0')}`
            : undefined,
        };
      }
    );

    if (tracks.length === 0) return null;

    return {
      id,
      title: playlistTitle,
      thumbnail,
      trackCount: tracks.length,
      tracks,
      platform: 'spotify',
    };
  } catch (e) {
    console.error('[spotify_playlist] Failed to fetch playlist:', e);
    return null;
  }
}
