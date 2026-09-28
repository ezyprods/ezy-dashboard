import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';
import {
  buildAuthorizeUrl,
  sealCookie,
  SPOTIFY_STATE_COOKIE,
  SPOTIFY_STATE_PREFIX,
} from '@/lib/spotify';

/**
 * Starts the Spotify OAuth flow.
 *
 * The redirect URI must match one registered in the Spotify app exactly. By
 * default it is the site origin (e.g. https://ezyprods-dashboard.vercel.app),
 * which is what's registered; src/app/page.tsx forwards that landing to
 * /api/spotify/callback. SPOTIFY_REDIRECT_URI overrides it if needed.
 */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI?.trim() || origin;
  const state = SPOTIFY_STATE_PREFIX + randomBytes(16).toString('hex');

  const authorizeUrl = buildAuthorizeUrl(redirectUri, state);
  if (!authorizeUrl) {
    return NextResponse.redirect(
      `${origin}/tools/downloader?spotify=error&reason=${encodeURIComponent('Faltan las credenciales de Spotify en el servidor.')}`
    );
  }

  (await cookies()).set(SPOTIFY_STATE_COOKIE, sealCookie({ state, redirectUri }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 10,
  });

  return NextResponse.redirect(authorizeUrl);
}
