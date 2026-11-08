import { NextResponse } from 'next/server';
import { getDriveService } from '@/lib/drive';
import { DRIVE_ROOT_FOLDER_ID } from '@/lib/constants';
import { hasStudioAccess } from '@/lib/routeAuth';

/**
 * The public read routes (/api/files/<id>, /api/audio/<id>, /api/releases/<id>) act with the
 * studio's Google account, which can read far more than the studio folder. They only serve what
 * lives inside DRIVE_ROOT_FOLDER_ID; anything else is answered as "not found" to anyone who has
 * not unlocked the studio.
 */

/** Drive ids are 25–44 url-safe characters. Anything else never reaches a Drive query. */
const DRIVE_ID_RE = /^[A-Za-z0-9_-]{10,80}$/;
export const isDriveId = (id: unknown): id is string => typeof id === 'string' && DRIVE_ID_RE.test(id);

const MAX_DEPTH = 20;
const POSITIVE_TTL_MS = 6 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 5000;

// fileId -> { inside, expires }. Folders on the way up are cached too, so files in the same
// project cost a single Drive call after the first one.
const cache = new Map<string, { inside: boolean; expires: number }>();

function remember(ids: string[], inside: boolean) {
  const expires = Date.now() + (inside ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS);
  if (cache.size > MAX_ENTRIES) cache.clear();
  for (const id of ids) cache.set(id, { inside, expires });
}

function cached(id: string): boolean | undefined {
  const hit = cache.get(id);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    cache.delete(id);
    return undefined;
  }
  return hit.inside;
}

/** True when the file or folder is (anywhere) inside the studio root folder. */
export async function isInsideStudioRoot(fileId: string): Promise<boolean> {
  if (!DRIVE_ROOT_FOLDER_ID || !isDriveId(fileId)) return false;
  if (fileId === DRIVE_ROOT_FOLDER_ID) return true;

  const drive = getDriveService();
  const walked: string[] = [];
  let current: string | undefined = fileId;

  while (current && walked.length < MAX_DEPTH) {
    if (current === DRIVE_ROOT_FOLDER_ID) {
      remember(walked, true);
      return true;
    }
    const known = cached(current);
    if (known !== undefined) {
      remember(walked, known);
      return known;
    }
    walked.push(current);
    let parents: string[] = [];
    try {
      const { data } = await drive.files.get({ fileId: current, fields: 'parents, trashed', supportsAllDrives: true });
      if (data.trashed) break;
      parents = data.parents || [];
    } catch {
      break;
    }
    current = parents[0];
  }

  remember(walked, false);
  return false;
}

const artistFolderCache = new Map<string, { ok: boolean; expires: number }>();

/**
 * True when the id is an artist folder: a direct child of the studio root that is not a system
 * folder (00_…). The public portal routes only answer for these.
 */
export async function isArtistFolder(id: string): Promise<boolean> {
  if (!DRIVE_ROOT_FOLDER_ID || !isDriveId(id) || id === DRIVE_ROOT_FOLDER_ID) return false;
  const hit = artistFolderCache.get(id);
  if (hit && hit.expires > Date.now()) return hit.ok;
  let ok = false;
  try {
    const { data } = await getDriveService().files.get({ fileId: id, fields: 'name, parents, mimeType, trashed', supportsAllDrives: true });
    ok = data.mimeType === 'application/vnd.google-apps.folder'
      && !data.trashed
      && (data.parents || []).includes(DRIVE_ROOT_FOLDER_ID)
      && !(data.name || '').startsWith('00_');
  } catch {
    ok = false;
  }
  if (artistFolderCache.size > MAX_ENTRIES) artistFolderCache.clear();
  artistFolderCache.set(id, { ok, expires: Date.now() + (ok ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS) });
  return ok;
}

export const portalNotFound = () =>
  NextResponse.json({ error: 'Artist not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });

export interface PublicFileAccess {
  /** Response to return straight away (bad id or not allowed) */
  denied?: NextResponse;
  /**
   * The file is outside the studio folder and only the unlocked studio may see it: the response
   * must not be stored by the CDN, or a later anonymous request for the same URL would get it.
   */
  privateOnly: boolean;
}

export async function checkPublicFileAccess(fileId: string): Promise<PublicFileAccess> {
  if (!isDriveId(fileId)) {
    return { denied: new NextResponse('Invalid file id', { status: 400, headers: { 'Cache-Control': 'no-store' } }), privateOnly: false };
  }
  if (await isInsideStudioRoot(fileId)) return { privateOnly: false };
  if (await hasStudioAccess()) return { privateOnly: true };
  return { denied: new NextResponse('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } }), privateOnly: false };
}

/** Marks a response as private when the file is only visible to the studio. */
export function applyPrivacy<T extends Response>(response: T, access: PublicFileAccess): T {
  if (access.privateOnly) response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
