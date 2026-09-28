import { NextResponse } from 'next/server';
import { clearSpotifySession, getSpotifyAppCredentials, getSpotifyUser } from '@/lib/spotify';

/** Connection status for the downloader UI. */
export async function GET() {
  const user = await getSpotifyUser();
  return NextResponse.json({
    configured: Boolean(getSpotifyAppCredentials()),
    connected: Boolean(user),
    displayName: user?.displayName ?? null,
  });
}

/** Disconnect Spotify in this browser. */
export async function DELETE() {
  await clearSpotifySession();
  return NextResponse.json({ connected: false });
}
