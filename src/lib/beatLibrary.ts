import { randomBytes } from 'crypto';
import { createFolder, findAndReadJsonFile, getDriveService, listFolders, saveJsonFile } from '@/lib/drive';
import { DRIVE_ROOT_FOLDER_ID, PERSONAL_PROJECTS_ROOT_FOLDER_NAME } from '@/lib/constants';
import type { ArtistConfig, BeatAssignment, BeatLibraryDb, BeatSend, PortalBeat, PortalBeatSend } from '@/types';

export const LIBRARY_DB_FILE = 'beat_library.json';
export const LIBRARY_DISPLAY_NAME = 'Proyectos personales';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const ARTIST_BEATS_FOLDER = 'Beats';

export interface LibraryNode {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  parentId: string;
  size: string | null;
  modifiedTime: string | null;
  bpm: string | null;
  key: string | null;
}

export class LibraryError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

// ─── Root & database ──────────────────────────────────────────────────────────

let rootPromise: Promise<string> | null = null;

export function getLibraryRootId(): Promise<string> {
  if (!rootPromise) {
    rootPromise = (async () => {
      const folders = await listFolders(DRIVE_ROOT_FOLDER_ID);
      const existing = folders.find(f => (f.name || '').trim().toLowerCase() === PERSONAL_PROJECTS_ROOT_FOLDER_NAME.toLowerCase());
      return existing?.id || createFolder(PERSONAL_PROJECTS_ROOT_FOLDER_NAME, DRIVE_ROOT_FOLDER_ID);
    })().catch(err => {
      rootPromise = null;
      throw err;
    });
  }
  return rootPromise;
}

function normalizeDb(raw: any): BeatLibraryDb {
  return {
    version: 1,
    sends: Array.isArray(raw?.sends) ? raw.sends : [],
    assignments: Array.isArray(raw?.assignments) ? raw.assignments : [],
  };
}

export async function readLibraryDb(rootId: string): Promise<BeatLibraryDb> {
  return normalizeDb(await findAndReadJsonFile<BeatLibraryDb>(LIBRARY_DB_FILE, rootId).catch(() => null));
}

// Serializes read-modify-write cycles inside this server instance
let writeChain: Promise<unknown> = Promise.resolve();

export function updateLibraryDb<T>(rootId: string, mutate: (db: BeatLibraryDb) => Promise<T> | T): Promise<{ db: BeatLibraryDb; result: T }> {
  const run = writeChain.then(async () => {
    const db = await readLibraryDb(rootId);
    const result = await mutate(db);
    await saveJsonFile(LIBRARY_DB_FILE, db, rootId);
    return { db, result };
  });
  writeChain = run.catch(() => {});
  return run;
}

export const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;

// ─── Library index (live Drive tree) ─────────────────────────────────────────

export async function indexLibrary(rootId: string): Promise<Map<string, LibraryNode>> {
  const drive = getDriveService();
  const nodes = new Map<string, LibraryNode>();

  const listChildren = async (folderId: string) => {
    const all: any[] = [];
    let pageToken: string | undefined;
    do {
      const res: any = await drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, appProperties)',
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        pageSize: 1000,
        pageToken,
      });
      all.push(...(res.data.files || []));
      pageToken = res.data.nextPageToken || undefined;
    } while (pageToken);
    return all;
  };

  let level = [rootId];
  for (let depth = 0; level.length > 0 && depth < 12; depth++) {
    const results = await Promise.all(level.map(async id => ({ id, items: await listChildren(id) })));
    const next: string[] = [];
    for (const { id: parentId, items } of results) {
      for (const f of items) {
        const name: string = f.name || '';
        const isFolder = f.mimeType === FOLDER_MIME;
        if (!isFolder && (name.endsWith('.json') || f.mimeType === 'application/json')) continue;
        nodes.set(f.id, {
          id: f.id,
          name,
          mimeType: f.mimeType,
          isFolder,
          parentId,
          size: f.size || null,
          modifiedTime: f.modifiedTime || null,
          bpm: f.appProperties?.bpm || null,
          key: f.appProperties?.key || null,
        });
        if (isFolder) next.push(f.id);
      }
    }
    level = next;
  }
  return nodes;
}

export function pathOf(id: string, index: Map<string, LibraryNode>, rootId: string): string {
  const names: string[] = [];
  let current = index.get(id);
  let guard = 0;
  while (current && guard++ < 40) {
    names.unshift(current.name);
    if (current.parentId === rootId) break;
    current = index.get(current.parentId);
  }
  return names.join(' / ');
}

// ─── Sends ───────────────────────────────────────────────────────────────────

/** Files currently inside the sent items. Items that left the library (assigned, trashed) simply vanish. */
export function resolveSendBeats(send: BeatSend, index: Map<string, LibraryNode>): PortalBeat[] {
  const children = new Map<string, LibraryNode[]>();
  for (const node of index.values()) {
    if (!children.has(node.parentId)) children.set(node.parentId, []);
    children.get(node.parentId)!.push(node);
  }

  const beats = new Map<string, PortalBeat>();
  const toBeat = (node: LibraryNode, path: string): PortalBeat => ({
    id: node.id,
    name: node.name,
    mimeType: node.mimeType,
    size: node.size,
    modifiedTime: node.modifiedTime,
    bpm: node.bpm,
    key: node.key,
    path,
  });

  const walk = (folder: LibraryNode, path: string, depth: number) => {
    if (depth > 12) return;
    for (const child of children.get(folder.id) || []) {
      if (child.isFolder) walk(child, path ? `${path} / ${child.name}` : child.name, depth + 1);
      else if (!beats.has(child.id)) beats.set(child.id, toBeat(child, path));
    }
  };

  for (const id of send.itemIds) {
    const node = index.get(id);
    if (!node) continue;
    if (node.isFolder) walk(node, node.name, 0);
    else if (!beats.has(node.id)) beats.set(node.id, toBeat(node, ''));
  }
  return Array.from(beats.values()).sort((a, b) => (a.path || '').localeCompare(b.path || '', 'es', { numeric: true }) || a.name.localeCompare(b.name, 'es', { numeric: true }));
}

export async function getPortalBeatSends(artistId: string): Promise<PortalBeatSend[]> {
  const rootId = await getLibraryRootId();
  const db = await readLibraryDb(rootId);
  const sends = db.sends.filter(s => s.artistIds.includes(artistId));
  if (sends.length === 0) return [];
  const index = await indexLibrary(rootId);
  // A beat reachable from several sends is listed once, in the most recent one
  const seen = new Set<string>();
  return sends
    .map(send => ({
      id: send.id,
      title: send.title,
      note: send.note,
      sentAt: send.updatedAt || send.createdAt,
      allowDownload: send.allowDownload !== false,
      beats: resolveSendBeats(send, index),
    }))
    .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())
    .map(send => {
      const beats = send.beats.filter(b => !seen.has(b.id));
      beats.forEach(b => seen.add(b.id));
      return { ...send, beats };
    })
    .filter(s => s.beats.length > 0);
}

// ─── Assignments ─────────────────────────────────────────────────────────────

async function artistName(artistId: string): Promise<string> {
  const db = await findAndReadJsonFile<ArtistConfig[]>('ezy_artists_db.json', DRIVE_ROOT_FOLDER_ID).catch(() => null);
  const fromDb = (db || []).find(a => a.id === artistId)?.name;
  if (fromDb) return fromDb;
  const res = await getDriveService().files.get({ fileId: artistId, fields: 'name', supportsAllDrives: true });
  return res.data.name || 'Artista';
}

async function ensureArtistBeatsFolder(artistId: string): Promise<string> {
  const drive = getDriveService();
  const artist = await drive.files.get({ fileId: artistId, fields: 'id, mimeType, trashed, parents', supportsAllDrives: true }).catch(() => null);
  if (!artist?.data || artist.data.mimeType !== FOLDER_MIME || artist.data.trashed) {
    throw new LibraryError('El artista no existe o su carpeta está en la papelera', 404);
  }
  const folders = await listFolders(artistId);
  const existing = folders.find(f => /^beats?$/i.test((f.name || '').trim()));
  return existing?.id || createFolder(ARTIST_BEATS_FOLDER, artistId);
}

async function moveItem(fileId: string, fromParentId: string, toParentId: string) {
  await getDriveService().files.update({
    fileId,
    addParents: toParentId,
    removeParents: fromParentId,
    supportsAllDrives: true,
    fields: 'id',
  });
}

export async function assignToArtist(itemIds: string[], artistId: string) {
  const rootId = await getLibraryRootId();
  const [index, beatsFolderId, name] = await Promise.all([indexLibrary(rootId), ensureArtistBeatsFolder(artistId), artistName(artistId)]);

  const nodes = Array.from(new Set(itemIds)).map(id => index.get(id)).filter(Boolean) as LibraryNode[];
  // A folder and something inside it: moving the folder already takes the rest along
  const selected = new Set(nodes.map(n => n.id));
  const isUnderSelected = (node: LibraryNode) => {
    let parent = index.get(node.parentId);
    let guard = 0;
    while (parent && guard++ < 40) {
      if (selected.has(parent.id)) return true;
      parent = index.get(parent.parentId);
    }
    return false;
  };
  const targets = nodes.filter(n => !isUnderSelected(n));
  if (targets.length === 0) throw new LibraryError('Esos elementos ya no están en la biblioteca', 404);

  const moved: LibraryNode[] = [];
  const failed: string[] = [];
  await Promise.all(targets.map(async node => {
    try {
      await moveItem(node.id, node.parentId, beatsFolderId);
      moved.push(node);
    } catch {
      failed.push(node.name);
    }
  }));

  const now = new Date().toISOString();
  const { db, result } = await updateLibraryDb(rootId, db => {
    const created: BeatAssignment[] = moved.map(node => {
      const removedFromSendIds: string[] = [];
      for (const send of db.sends) {
        if (send.itemIds.includes(node.id)) {
          send.itemIds = send.itemIds.filter(id => id !== node.id);
          removedFromSendIds.push(send.id);
        }
      }
      return {
        id: newId('asg'),
        fileId: node.id,
        fileName: node.name,
        isFolder: node.isFolder,
        artistId,
        artistName: name,
        fromFolderId: node.parentId,
        fromPath: node.parentId === rootId ? '' : pathOf(node.parentId, index, rootId),
        toFolderId: beatsFolderId,
        removedFromSendIds,
        assignedAt: now,
      };
    });
    db.assignments = [...created, ...db.assignments];
    return created;
  });

  return { assignments: result, failed, db, rootId };
}

export async function undoAssignment(assignmentId: string) {
  const rootId = await getLibraryRootId();
  const drive = getDriveService();
  const db = await readLibraryDb(rootId);
  const assignment = db.assignments.find(a => a.id === assignmentId);
  if (!assignment) throw new LibraryError('Esa asignación ya no existe', 404);

  const [file, origin] = await Promise.all([
    drive.files.get({ fileId: assignment.fileId, fields: 'id, parents, trashed', supportsAllDrives: true }).catch(() => null),
    drive.files.get({ fileId: assignment.fromFolderId, fields: 'id, trashed', supportsAllDrives: true }).catch(() => null),
  ]);
  if (!file?.data || file.data.trashed) throw new LibraryError('El beat ya no existe (¿se eliminó de la carpeta del artista?)', 410);

  const target = origin?.data && !origin.data.trashed ? assignment.fromFolderId : rootId;
  const currentParents = (file.data.parents || []).join(',');
  await drive.files.update({
    fileId: assignment.fileId,
    addParents: target,
    removeParents: currentParents || undefined,
    supportsAllDrives: true,
    fields: 'id',
  });

  const updated = await updateLibraryDb(rootId, db => {
    db.assignments = db.assignments.filter(a => a.id !== assignmentId);
    for (const send of db.sends) {
      if (assignment.removedFromSendIds.includes(send.id) && !send.itemIds.includes(assignment.fileId)) {
        send.itemIds = [...send.itemIds, assignment.fileId];
      }
    }
  });

  return { db: updated.db, restoredTo: target, rootId };
}
