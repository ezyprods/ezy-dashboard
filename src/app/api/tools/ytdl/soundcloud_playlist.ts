/**
 * SoundCloud Playlist & Set Resolution Engine
 * 
 * Extracts complete track listings, artwork, and metadata from public SoundCloud sets,
 * albums, and playlists.
 */

export interface SoundCloudPlaylistTrack {
  videoId: string;
  title: string;
  artist?: string;
  trackName?: string;
  thumbnail: string;
  url: string;
  duration?: string;
}

export interface SoundCloudPlaylistInfo {
  id: string;
  title: string;
  thumbnail: string;
  trackCount: number;
  tracks: SoundCloudPlaylistTrack[];
  platform: 'soundcloud';
}

const FALLBACK_CLIENT_IDS = [
  'Pb72ranhoyt6gw7hM7TkzUItXlMWSNSo',
  'b7B362zQvUe4rC6b16s9d435hY2d159a',
  'a3e059563d7fd3372b49b37f00a00bcf',
  '2t9loNfhTwxMqqxmsoaCdCQxduiIC1nx',
];

export function isSoundCloudPlaylist(urlStr: string): boolean {
  if (!urlStr.includes('soundcloud.com') && !urlStr.includes('on.soundcloud.com')) {
    return false;
  }
  return urlStr.includes('/sets/') || urlStr.includes('/albums/');
}

let cachedClientId = '';
let cachedClientIdTime = 0;

async function getSoundCloudClientId(): Promise<string> {
  const now = Date.now();
  if (cachedClientId && now - cachedClientIdTime < 30 * 60 * 1000) {
    return cachedClientId;
  }

  try {
    const res = await fetch('https://soundcloud.com', {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(4000),
    });

    if (res.ok) {
      const html = await res.text();
      const match =
        html.match(/"apiClient",\s*"data":\s*\{\s*"id":\s*"([^"]+)"/) ||
        html.match(/client_id[:=]\s*["']([a-zA-Z0-9_-]{32})["']/);
      if (match && match[1]) {
        cachedClientId = match[1];
        cachedClientIdTime = now;
        return cachedClientId;
      }
    }
  } catch (e) {}

  return FALLBACK_CLIENT_IDS[0];
}

export async function fetchSoundCloudPlaylist(
  urlStr: string
): Promise<SoundCloudPlaylistInfo | null> {
  try {
    const clientId = await getSoundCloudClientId();
    const resolveUrl = `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(
      urlStr
    )}&client_id=${clientId}`;

    const res = await fetch(resolveUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;
    const data = await res.json();

    if (!data || (!data.tracks && data.kind !== 'playlist')) {
      return null;
    }

    const playlistTitle = data.title || 'Lista de SoundCloud';
    const thumbnail =
      data.artwork_url ||
      data.user?.avatar_url ||
      'https://a1.sndcdn.com/images/default_avatar_large.png';

    const rawTracks: any[] = Array.isArray(data.tracks) ? data.tracks : [];
    if (rawTracks.length === 0) return null;

    const tracks: SoundCloudPlaylistTrack[] = rawTracks
      .filter((t: any) => t && (t.title || t.permalink_url))
      .map((t: any, idx: number) => {
        const author = t.user?.username || data.user?.username || '';
        const songName = t.title || `Pista ${idx + 1}`;
        const fullTitle =
          author && !songName.toLowerCase().includes(author.toLowerCase())
            ? `${author} - ${songName}`
            : songName;

        const trackUrl = t.permalink_url
          ? (t.permalink_url.startsWith('http')
              ? t.permalink_url
              : `https://soundcloud.com/${t.permalink_url.replace(/^\//, '')}`)
          : urlStr;

        return {
          videoId: '',
          title: fullTitle,
          artist: author,
          trackName: songName,
          thumbnail: t.artwork_url || thumbnail,
          url: trackUrl,
          duration: t.duration
            ? `${Math.floor(t.duration / 60000)}:${Math.floor(
                (t.duration % 60000) / 1000
              )
                .toString()
                .padStart(2, '0')}`
            : undefined,
        };
      });

    if (tracks.length === 0) return null;

    return {
      id: String(data.id || data.permalink || 'sc_playlist'),
      title: playlistTitle,
      thumbnail,
      trackCount: tracks.length,
      tracks,
      platform: 'soundcloud',
    };
  } catch (e) {
    console.error('[soundcloud_playlist] Failed to fetch playlist:', e);
    return null;
  }
}
