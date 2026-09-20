/**
 * driveDirectLink.ts
 *
 * Zero-bandwidth delivery of Drive media.
 *
 * Every byte that `/api/audio/[fileId]` streamed through the serverless
 * function counted as Vercel "Fast Origin Transfer" (10 GB/month on the free
 * plan, and we were burning 12.2 GB of it). Vercel's CDN can't absorb that
 * traffic either: its cache refuses any request carrying a `Range` header,
 * and every `<audio>` element sends one.
 *
 * So the bytes must never touch Vercel. `drive.usercontent.google.com` serves
 * them straight from Google's CDN with `Accept-Ranges: bytes` (scrubbing),
 * `Access-Control-Allow-Origin: *` (fetch/WaveSurfer) and the file's real
 * `audio/*` content type — but ONLY when the file is link-readable. For a
 * private file it answers 302 → `application/binary`, which Chrome then kills
 * with ORB (Opaque Response Blocking). That is the exact failure that forced
 * the previous revert back to proxying, and the reason this module always
 * confirms public-reader access *before* handing out a direct link.
 */

const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';

export interface DriveMediaMeta {
  mimeType: string;
  name: string;
  size: number;
  /** Confirmed link-readable, so a direct Google CDN URL won't be ORB-blocked. */
  linkReadable: boolean;
}

// Module scope: survives across requests handled by the same warm instance,
// so replaying a track costs zero extra Drive round-trips.
const metaCache = new Map<string, DriveMediaMeta>();
const MAX_CACHE_ENTRIES = 1000;

function remember(fileId: string, meta: DriveMediaMeta) {
  if (metaCache.size >= MAX_CACHE_ENTRIES) {
    // Cheap FIFO eviction — Map preserves insertion order.
    const oldest = metaCache.keys().next().value;
    if (oldest) metaCache.delete(oldest);
  }
  metaCache.set(fileId, meta);
}

/** Content types the browser plays natively and ORB never blocks. */
export function isDirectPlayable(mimeType?: string | null): boolean {
  return !!mimeType && /^(audio|video)\//i.test(mimeType);
}

/**
 * Google CDN URL for direct audio streaming.
 * Only ever hand this out for a link-readable (anyone=reader) file.
 *
 * We use the /uc?id= path WITHOUT &export=download because the download variant
 * triggers Google's virus-scan interstitial HTML page for any file larger than
 * ~25 MB — the <audio> element then receives HTML instead of audio bytes and
 * silently fails to play.  The /uc endpoint serves raw bytes with the file's
 * real Content-Type and Access-Control-Allow-Origin: * for public files.
 */
export function directDriveUrl(fileId: string): string {
  return `https://drive.usercontent.google.com/uc?id=${fileId}`;
}

export async function getDriveMediaMeta(
  fileId: string,
  accessToken: string
): Promise<DriveMediaMeta | null> {
  const cached = metaCache.get(fileId);
  if (cached) return cached;

  const res = await fetch(
    `${DRIVE_API}/${fileId}?fields=name,mimeType,size,permissions(type,role)&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return null;

  const data = await res.json();
  const meta: DriveMediaMeta = {
    mimeType: data.mimeType || '',
    name: data.name || '',
    size: parseInt(data.size || '0', 10),
    linkReadable: Array.isArray(data.permissions)
      ? data.permissions.some((p: any) => p.type === 'anyone')
      : false,
  };
  remember(fileId, meta);
  return meta;
}

/**
 * Grants `anyone → reader` if the file doesn't already have it.
 *
 * Deliberately `reader`, never `writer`: Drive rejects `anyone + writer` under
 * common Workspace policies, and that silent rejection is what left files
 * private — and playback ORB-blocked — in the previous implementation.
 *
 * Returns false when the grant fails, so the caller can fall back to proxying
 * instead of emitting a link that would break playback.
 */
export async function ensureLinkReadable(
  fileId: string,
  accessToken: string,
  meta?: DriveMediaMeta | null
): Promise<boolean> {
  if (meta?.linkReadable) return true;

  try {
    const res = await fetch(
      `${DRIVE_API}/${fileId}/permissions?supportsAllDrives=true&sendNotificationEmail=false`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: 'reader', type: 'anyone' }),
      }
    );

    if (!res.ok && res.status !== 409) {
      const body = await res.text().catch(() => '');
      // A duplicate-permission rejection still means the file is readable.
      if (!/already|duplicate/i.test(body)) {
        console.warn(`[driveDirectLink] Could not make ${fileId} link-readable: ${res.status}`);
        return false;
      }
    }

    if (meta) {
      meta.linkReadable = true;
      remember(fileId, meta);
    }
    return true;
  } catch (err: any) {
    console.warn(`[driveDirectLink] Permission error for ${fileId}:`, err?.message);
    return false;
  }
}
