import { NextResponse } from 'next/server';
import { clearSpotifySession, getSpotifyAppCredentials, getSpotifyUser } from '@/lib/spotify';

import { requireStudioOrPortalTool } from '@/lib/routeAuth';
/** Connection status for the downloader UI. */
export async function GET() {
  const denied = await requireStudioOrPortalTool('downloader');
  if (denied) return denied;
  const user = await getSpotifyUser();
  return NextResponse.json({
    configured: Boolean(getSpotifyAppCredentials()),
    connected: Boolean(user),
    displayName: user?.displayName ?? null,
  });
}

/** Disconnect Spotify in this browser. */
export async function DELETE() {
  const denied = await requireStudioOrPortalTool('downloader');
  if (denied) return denied;
  await clearSpotifySession();
  return NextResponse.json({ connected: false });
}
