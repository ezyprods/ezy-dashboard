/**
 * spotify.ts — server-side Spotify Web API helpers.
 *
 * Since Spotify's February 2026 Web API changes:
 *  - App-only tokens (Client Credentials) can read albums and single tracks,
 *    but NEVER playlist contents (`/playlists/{id}/tracks` → 403).
 *  - A user token (OAuth) can read the contents (`/playlists/{id}/items`) of
 *    playlists the user owns or collaborates on, plus their Liked Songs.
 *
 * The user's refresh token lives in an AES-256-GCM encrypted httpOnly cookie
 * (the dashboard has no database), so connecting Spotify is a one-time step
 * per browser. Only call the user-token helpers from Route Handlers: they may
 * rewrite the cookie after refreshing the access token.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { cookies } from 'next/headers';

const API = 'https://api.spotify.com/v1';
const ACCOUNTS = 'https://accounts.spotify.com';

export const SPOTIFY_SESSION_COOKIE = 'ezy_spotify';
export const SPOTIFY_STATE_COOKIE = 'ezy_spotify_state';
/** OAuth `state` values carry this prefix so the proxy can recognise the callback. */
export const SPOTIFY_STATE_PREFIX = 'spotify.';
export const SPOTIFY_SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
].join(' ');

const COOKIE_MAX_AGE = 60 * 60 * 24 * 399; // browsers cap cookies at 400 days

export function getSpotifyAppCredentials() {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

function basicAuthHeader(clientId: string, clientSecret: string) {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}

// ---------------------------------------------------------------------------
// Cookie encryption
// ---------------------------------------------------------------------------

function cookieKey(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET || process.env.SPOTIFY_CLIENT_SECRET || '';
  return createHash('sha256').update(`ezy-spotify:${secret}`).digest();
}

export function sealCookie(payload: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', cookieKey(), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64url');
}

export function unsealCookie<T>(value: string | undefined): T | null {
  if (!value) return null;
  try {
    const raw = Buffer.from(value, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', cookieKey(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const dec = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
    return JSON.parse(dec.toString('utf8')) as T;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: COOKIE_MAX_AGE,
};

// ---------------------------------------------------------------------------
// Rate-limit aware fetch
// ---------------------------------------------------------------------------

/**
 * GET against the Web API, retrying short 429 bursts (up to 3 times). A long
 * `Retry-After` means a Development Mode quota is exhausted — Spotify blocks
 * catalog endpoints like /tracks and /albums for ~24h after a few hundred
 * calls — so give up at once and let the caller fall back instead of hanging.
 */
export async function spotifyGet(pathOrUrl: string, token: string): Promise<Response> {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${API}${pathOrUrl}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status !== 429 || attempt >= 3) return res;
    const retryAfter = Number(res.headers.get('retry-after')) || 1;
    if (retryAfter > 15) {
      console.error(`[spotify] quota exhausted for ${url.split('?')[0]} (retry-after ${retryAfter}s)`);
      return res;
    }
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
  }
}

// ---------------------------------------------------------------------------
// App token (Client Credentials) — albums & single tracks
// ---------------------------------------------------------------------------

let cachedAppToken: { token: string; expiresAt: number } | null = null;

export async function getSpotifyAppToken(): Promise<string | null> {
  const creds = getSpotifyAppCredentials();
  if (!creds) return null;
  if (cachedAppToken && Date.now() < cachedAppToken.expiresAt - 60_000) {
    return cachedAppToken.token;
  }
  try {
    const res = await fetch(`${ACCOUNTS}/api/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: basicAuthHeader(creds.clientId, creds.clientSecret),
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(`[spotify] client credentials failed: ${res.status}`);
      return null;
    }
    const data = await res.json();
    cachedAppToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return cachedAppToken.token;
  } catch (e) {
    console.error('[spotify] client credentials error:', e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// User token (OAuth Authorization Code) — playlists & Liked Songs
// ---------------------------------------------------------------------------

interface SpotifySession {
  refreshToken: string;
  accessToken: string;
  expiresAt: number;
  userId: string;
  displayName: string;
}

export interface SpotifyUser {
  accessToken: string;
  userId: string;
  displayName: string;
}

export function buildAuthorizeUrl(redirectUri: string, state: string): string | null {
  const creds = getSpotifyAppCredentials();
  if (!creds) return null;
  const params = new URLSearchParams({
    client_id: creds.clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SPOTIFY_SCOPES,
    state,
  });
  return `${ACCOUNTS}/authorize?${params}`;
}

async function requestUserToken(body: Record<string, string>) {
  const creds = getSpotifyAppCredentials();
  if (!creds) throw new Error('Faltan SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET en el servidor');
  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuthHeader(creds.clientId, creds.clientSecret),
    },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || `Spotify token ${res.status}`);
  }
  return data as { access_token: string; refresh_token?: string; expires_in: number };
}

/**
 * Exchanges the OAuth code, verifies the account can use the API and stores
 * the encrypted session cookie. Throws a user-facing (Spanish) message on failure.
 */
export async function completeSpotifyLogin(code: string, redirectUri: string): Promise<SpotifyUser> {
  const token = await requestUserToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });

  const meRes = await spotifyGet('/me', token.access_token);
  if (!meRes.ok) {
    const body = await meRes.text();
    console.error(`[spotify] /me after login: ${meRes.status} ${body}`);
    if (meRes.status === 403) {
      throw new Error(
        /premium/i.test(body)
          ? 'Spotify exige que la cuenta dueña de la app tenga Premium activo.'
          : 'Esta cuenta de Spotify no tiene acceso a la app. Añádela en developer.spotify.com > tu app > User Management.'
      );
    }
    throw new Error(`Spotify rechazó la conexión (${meRes.status}).`);
  }
  const me = await meRes.json();

  const session: SpotifySession = {
    refreshToken: token.refresh_token || '',
    accessToken: token.access_token,
    expiresAt: Date.now() + token.expires_in * 1000,
    userId: me.id,
    displayName: me.display_name || me.id,
  };
  (await cookies()).set(SPOTIFY_SESSION_COOKIE, sealCookie(session), sessionCookieOptions);
  return { accessToken: session.accessToken, userId: session.userId, displayName: session.displayName };
}

/**
 * Returns a valid user access token from the session cookie, refreshing it
 * (and rewriting the cookie) when expired. Returns null when not connected or
 * when Spotify revoked the refresh token — the cookie is cleared in that case.
 */
export async function getSpotifyUser(): Promise<SpotifyUser | null> {
  const store = await cookies();
  const session = unsealCookie<SpotifySession>(store.get(SPOTIFY_SESSION_COOKIE)?.value);
  if (!session?.refreshToken) return null;

  if (Date.now() < session.expiresAt - 60_000) {
    return { accessToken: session.accessToken, userId: session.userId, displayName: session.displayName };
  }

  try {
    const token = await requestUserToken({
      grant_type: 'refresh_token',
      refresh_token: session.refreshToken,
    });
    const next: SpotifySession = {
      ...session,
      accessToken: token.access_token,
      // Spotify may rotate the refresh token; keep the old one otherwise.
      refreshToken: token.refresh_token || session.refreshToken,
      expiresAt: Date.now() + token.expires_in * 1000,
    };
    store.set(SPOTIFY_SESSION_COOKIE, sealCookie(next), sessionCookieOptions);
    return { accessToken: next.accessToken, userId: next.userId, displayName: next.displayName };
  } catch (e) {
    console.error('[spotify] refresh failed, disconnecting:', e);
    store.delete(SPOTIFY_SESSION_COOKIE);
    return null;
  }
}

export async function clearSpotifySession() {
  (await cookies()).delete(SPOTIFY_SESSION_COOKIE);
}
