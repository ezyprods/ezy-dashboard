/**
 * googleTokenCache.ts
 *
 * In-memory singleton cache for Google OAuth access tokens.
 *
 * Problem: Every call to /api/audio/[fileId] was fetching a fresh OAuth token
 * from Google, adding latency AND consuming Vercel Function Duration unnecessarily.
 *
 * Solution: Cache the access token in the Node.js module scope (survives across
 * requests within the same serverless function instance). Tokens are valid for
 * 1 hour; we refresh them 5 minutes early to avoid races.
 */

interface CachedToken {
  accessToken: string;
  expiresAt: number; // Unix timestamp (ms)
}

// Module-level cache — persists across requests in the same instance
let cached: CachedToken | null = null;

const REFRESH_MARGIN_MS = 5 * 60 * 1000; // Refresh 5 minutes before expiry

/**
 * Returns a valid Google OAuth access token, fetching a new one only when
 * the cached one is about to expire.
 */
export async function getGoogleAccessToken(): Promise<string> {
  const now = Date.now();

  if (cached && cached.expiresAt - REFRESH_MARGIN_MS > now) {
    return cached.accessToken;
  }

    const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN;
    if (!refreshToken) {
      throw new Error('Google refresh token is not configured in environment variables');
    }

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

  if (!res.ok) {
    throw new Error(`Google token refresh failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  if (!data.access_token) {
    throw new Error('Google token response missing access_token');
  }

  // Google tokens expire in 3600s; store expiry timestamp
  const expiresIn = (data.expires_in as number) ?? 3600;
  cached = {
    accessToken: data.access_token,
    expiresAt: now + expiresIn * 1000,
  };

  return cached.accessToken;
}
