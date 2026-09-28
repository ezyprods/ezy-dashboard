import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { completeSpotifyLogin, SPOTIFY_STATE_COOKIE, unsealCookie } from '@/lib/spotify';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (params: Record<string, string>) =>
    NextResponse.redirect(`${url.origin}/tools/downloader?${new URLSearchParams(params)}`);

  const store = await cookies();
  const saved = unsealCookie<{ state: string; redirectUri: string }>(store.get(SPOTIFY_STATE_COOKIE)?.value);
  store.delete(SPOTIFY_STATE_COOKIE);

  const error = url.searchParams.get('error');
  if (error) {
    return back({
      spotify: 'error',
      reason: error === 'access_denied' ? 'Cancelaste la conexión con Spotify.' : `Spotify: ${error}`,
    });
  }

  const code = url.searchParams.get('code');
  if (!code || !saved || saved.state !== url.searchParams.get('state')) {
    return back({ spotify: 'error', reason: 'La sesión de conexión caducó. Inténtalo de nuevo.' });
  }

  try {
    const user = await completeSpotifyLogin(code, saved.redirectUri);
    return back({ spotify: 'connected', name: user.displayName });
  } catch (e: any) {
    console.error('[spotify] callback error:', e);
    return back({ spotify: 'error', reason: e.message || 'No se pudo conectar con Spotify.' });
  }
}
