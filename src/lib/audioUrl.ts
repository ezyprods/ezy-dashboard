/**
 * Canonical source URL for streaming an audio file.
 *
 * The version token exists to defeat *browser* caches, not the CDN.
 *
 * While `/api/audio/[fileId]` briefly answered with a 307 to Google, those
 * redirects went out with `Cache-Control: public, max-age=86400`. Browsers
 * stored them, so once the route was fixed back to proxying, anyone who had
 * pressed play during that window still got the dead Google URL from their own
 * cache — for a full day, and with no way for the server to reach in and
 * invalidate it. Bumping the token changes the request URL, which misses the
 * poisoned entry entirely and heals every visitor at once.
 *
 * Bump AUDIO_CACHE_VERSION whenever a bad response for these URLs could have
 * been cached by clients.
 */
export const AUDIO_CACHE_VERSION = '2';

export function audioSrc(fileId: string): string {
  return `/api/audio/${fileId}?v=${AUDIO_CACHE_VERSION}`;
}
