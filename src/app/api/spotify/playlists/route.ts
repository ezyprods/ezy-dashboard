import { NextResponse } from 'next/server';
import { getSpotifyUser, spotifyGet } from '@/lib/spotify';

export const maxDuration = 30;

export interface MySpotifyPlaylist {
  id: string;
  name: string;
  url: string;
  thumbnail: string;
  trackCount: number | null;
  owner: string;
  /** Spotify only returns the full contents for owned/collaborative playlists. */
  fullAccess: boolean;
}

/**
 * Lists the connected user's library: Liked Songs first, then every playlist
 * they own, collaborate on or follow (flagging which ones can be read in full).
 */
export async function GET() {
  const user = await getSpotifyUser();
  if (!user) return NextResponse.json({ error: 'Spotify no está conectado' }, { status: 401 });

  const playlists: MySpotifyPlaylist[] = [];

  const likedRes = await spotifyGet('/me/tracks?limit=1', user.accessToken);
  if (likedRes.ok) {
    const liked = await likedRes.json();
    playlists.push({
      id: 'liked',
      name: 'Canciones que te gustan',
      url: 'https://open.spotify.com/collection/tracks',
      thumbnail: '',
      trackCount: liked.total ?? null,
      owner: user.displayName,
      fullAccess: true,
    });
  }

  let next: string | null = '/me/playlists?limit=50';
  for (let page = 0; next && page < 20; page++) {
    const res = await spotifyGet(next, user.accessToken);
    if (!res.ok) {
      console.error(`[spotify] /me/playlists ${res.status}`);
      if (playlists.length === 0) {
        return NextResponse.json({ error: `Spotify respondió ${res.status}` }, { status: 502 });
      }
      break;
    }
    const data: any = await res.json();
    for (const p of data.items ?? []) {
      if (!p?.id) continue;
      const ownerId = p.owner?.id;
      playlists.push({
        id: p.id,
        name: p.name || 'Sin título',
        url: p.external_urls?.spotify || `https://open.spotify.com/playlist/${p.id}`,
        thumbnail: p.images?.[0]?.url || '',
        // Field renamed from `tracks` to `items` in Feb 2026; accept both.
        trackCount: p.items?.total ?? p.tracks?.total ?? null,
        owner: p.owner?.display_name || ownerId || '',
        fullAccess: ownerId === user.userId || Boolean(p.collaborative),
      });
    }
    next = data.next;
  }

  return NextResponse.json({ playlists });
}
