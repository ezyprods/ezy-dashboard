import { createHmac } from 'node:crypto';
import { getDriveService, findAndReadJsonFile, saveJsonFile } from '@/lib/drive';
import { DRIVE_ROOT_FOLDER_ID } from '@/lib/constants';

/**
 * Limits wrong guesses of the studio password (POST /api/studio/unlock).
 *
 *  · Per IP: 5 failures in 15 minutes lock that IP for the rest of the window.
 *  · Global: 50 failures in an hour (any IP) lock the unlock form for 15 minutes, so rotating IPs
 *    does not help an attacker. A device that is already unlocked keeps working: the lock only
 *    affects new unlocks.
 *
 * Vercel runs several instances that do not share memory, so the counters also live in Drive
 * (00_SEGURIDAD/intentos_desbloqueo.json, private, IPs stored as an HMAC, never in clear).
 * Memory is the fast path; Drive is only touched on a failure or when an unlock is attempted.
 */

const IP_WINDOW_MS = 15 * 60 * 1000;
const IP_MAX_FAILURES = 5;
const GLOBAL_WINDOW_MS = 60 * 60 * 1000;
const GLOBAL_MAX_FAILURES = 50;
const GLOBAL_LOCK_MS = 15 * 60 * 1000;

const FOLDER_NAME = '00_SEGURIDAD';
const FILE_NAME = 'intentos_desbloqueo.json';

interface Counter { failures: number; since: number }
interface State {
  ips: Record<string, Counter>;
  global: Counter;
  lockedUntil?: number;
}

const memory: State = { ips: {}, global: { failures: 0, since: Date.now() } };
let folderId: Promise<string | null> | null = null;

export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for') || '';
  return forwarded.split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown';
}

function ipKey(ip: string): string {
  const secret = process.env.BETTER_AUTH_SECRET || '';
  return createHmac('sha256', secret).update(`unlock-ip:${ip}`).digest('base64url').slice(0, 22);
}

function getFolderId(): Promise<string | null> {
  if (!DRIVE_ROOT_FOLDER_ID) return Promise.resolve(null);
  folderId ??= (async () => {
    const drive = getDriveService();
    const found = await drive.files.list({
      q: `'${DRIVE_ROOT_FOLDER_ID}' in parents and name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id)',
      orderBy: 'createdTime',
      pageSize: 1,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    if (found.data.files?.[0]?.id) return found.data.files[0].id;
    // Created without any public link (lib/drive createFolder would share it)
    const created = await drive.files.create({
      requestBody: { name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder', parents: [DRIVE_ROOT_FOLDER_ID] },
      fields: 'id',
      supportsAllDrives: true,
    });
    return created.data.id || null;
  })().catch((err: Error) => {
    folderId = null;
    console.warn('[loginRateLimit] security folder unavailable:', err?.message);
    return null;
  });
  return folderId;
}

function prune(state: State, now: number) {
  for (const [key, c] of Object.entries(state.ips)) {
    if (now - c.since > IP_WINDOW_MS) delete state.ips[key];
  }
  if (now - state.global.since > GLOBAL_WINDOW_MS) state.global = { failures: 0, since: now };
  if (state.lockedUntil && state.lockedUntil < now) delete state.lockedUntil;
}

async function readShared(): Promise<State | null> {
  const id = await getFolderId();
  if (!id) return null;
  const raw = await findAndReadJsonFile<State>(FILE_NAME, id).catch(() => null);
  if (!raw || typeof raw !== 'object') return { ips: {}, global: { failures: 0, since: Date.now() } };
  return { ips: raw.ips || {}, global: raw.global || { failures: 0, since: Date.now() }, lockedUntil: raw.lockedUntil };
}

/** Merges the Drive counters into memory (keeps the highest count of each). */
function merge(shared: State | null) {
  if (!shared) return;
  for (const [key, c] of Object.entries(shared.ips)) {
    const mine = memory.ips[key];
    if (!mine || c.failures > mine.failures) memory.ips[key] = { ...c };
  }
  if (shared.global.failures > memory.global.failures) memory.global = { ...shared.global };
  if ((shared.lockedUntil || 0) > (memory.lockedUntil || 0)) memory.lockedUntil = shared.lockedUntil;
}

export interface LimitCheck { allowed: boolean; retryAfterSeconds: number }

export async function checkUnlockAllowed(ip: string): Promise<LimitCheck> {
  const now = Date.now();
  merge(await readShared().catch(() => null));
  prune(memory, now);

  if (memory.lockedUntil && memory.lockedUntil > now) {
    return { allowed: false, retryAfterSeconds: Math.ceil((memory.lockedUntil - now) / 1000) };
  }
  const c = memory.ips[ipKey(ip)];
  if (c && c.failures >= IP_MAX_FAILURES) {
    return { allowed: false, retryAfterSeconds: Math.ceil((c.since + IP_WINDOW_MS - now) / 1000) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export async function recordUnlockFailure(ip: string): Promise<void> {
  const now = Date.now();
  prune(memory, now);
  const key = ipKey(ip);
  const c = memory.ips[key] || { failures: 0, since: now };
  c.failures += 1;
  memory.ips[key] = c;
  memory.global.failures += 1;
  if (memory.global.failures >= GLOBAL_MAX_FAILURES) memory.lockedUntil = now + GLOBAL_LOCK_MS;

  try {
    const id = await getFolderId();
    if (!id) return;
    const shared = (await readShared()) || { ips: {}, global: { failures: 0, since: now } };
    prune(shared, now);
    const s = shared.ips[key] || { failures: 0, since: now };
    shared.ips[key] = { failures: Math.max(s.failures + 1, c.failures), since: Math.min(s.since, c.since) };
    shared.global = { failures: Math.max(shared.global.failures + 1, memory.global.failures), since: Math.min(shared.global.since, memory.global.since) };
    if (memory.lockedUntil) shared.lockedUntil = Math.max(shared.lockedUntil || 0, memory.lockedUntil);
    await saveJsonFile(FILE_NAME, shared, id);
  } catch (err) {
    console.warn('[loginRateLimit] could not persist the failure:', (err as Error)?.message);
  }
}

/** A correct password clears that IP's counter. */
export async function recordUnlockSuccess(ip: string): Promise<void> {
  const key = ipKey(ip);
  delete memory.ips[key];
  try {
    const id = await getFolderId();
    const shared = id ? await readShared() : null;
    if (id && shared?.ips[key]) {
      delete shared.ips[key];
      await saveJsonFile(FILE_NAME, shared, id);
    }
  } catch (err) {
    console.warn('[loginRateLimit] could not clear the counter:', (err as Error)?.message);
  }
}
