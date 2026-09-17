'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { isHiddenItem, normalizeItem } from './fileKinds';
import type { Crumb, DriveItem } from './types';

/**
 * Client-side cache shared by every explorer on the page (and kept while navigating the app):
 *  - one entry per folder listing (instant back/forward, stale-while-revalidate)
 *  - one recursive index per explorer root (search everywhere, recents, audio library, starred…)
 *  - the trash of each root
 * Every mutation patches all of them at once so the UI never shows stale copies.
 */

type Status = 'idle' | 'loading' | 'ready' | 'error';

export interface ListEntry {
  items: DriveItem[];
  status: Status;
  fetchedAt: number;
  error?: string;
}

const EMPTY: ListEntry = { items: [], status: 'idle', fetchedAt: 0 };

const folders = new Map<string, ListEntry>();
const indexes = new Map<string, ListEntry>();
const trashes = new Map<string, ListEntry>();
const paths = new Map<string, Crumb[]>();
const inflight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

const FOLDER_TTL = 15_000;
const INDEX_TTL = 60_000;

function emit() {
  listeners.forEach(l => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function readJson(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.details || `Error ${res.status}`);
  return data;
}

function normalizeList(raw: any[], parentId: string | null): DriveItem[] {
  return (raw || []).filter(r => r?.id && !isHiddenItem(r)).map(r => normalizeItem(r, parentId));
}

// ─── Loading ────────────────────────────────────────────────────────────────

export function loadFolder(folderId: string, opts: { force?: boolean } = {}): Promise<void> {
  const current = folders.get(folderId);
  if (!opts.force && current && current.status === 'ready' && Date.now() - current.fetchedAt < FOLDER_TTL) {
    return Promise.resolve();
  }
  const key = `f:${folderId}`;
  const running = inflight.get(key);
  if (running) return running;

  folders.set(folderId, { ...(current || EMPTY), status: 'loading', error: undefined });
  emit();

  const promise = fetch(`/api/files?folderId=${encodeURIComponent(folderId)}`)
    .then(readJson)
    .then(data => {
      folders.set(folderId, { items: normalizeList(data.items, folderId), status: 'ready', fetchedAt: Date.now() });
    })
    .catch((err: Error) => {
      const prev = folders.get(folderId) || EMPTY;
      folders.set(folderId, { ...prev, status: 'error', error: err.message || 'No se pudo cargar la carpeta' });
    })
    .finally(() => {
      inflight.delete(key);
      emit();
    });

  inflight.set(key, promise);
  return promise;
}

export function loadIndex(rootId: string, opts: { force?: boolean } = {}): Promise<void> {
  const current = indexes.get(rootId);
  if (!opts.force && current && current.status === 'ready' && Date.now() - current.fetchedAt < INDEX_TTL) {
    return Promise.resolve();
  }
  const key = `i:${rootId}`;
  const running = inflight.get(key);
  if (running) return running;

  indexes.set(rootId, { ...(current || EMPTY), status: 'loading', error: undefined });
  emit();

  const promise = fetch(`/api/files?folderId=${encodeURIComponent(rootId)}&recursive=true`)
    .then(readJson)
    .then(data => {
      const items = normalizeList(data.items, rootId);
      indexes.set(rootId, { items, status: 'ready', fetchedAt: Date.now() });
      // The index also tells us every folder's children: warm those caches that are missing
      const byParent = new Map<string, DriveItem[]>();
      for (const item of items) {
        if (!item.parentId) continue;
        if (!byParent.has(item.parentId)) byParent.set(item.parentId, []);
        byParent.get(item.parentId)!.push(item);
      }
      const now = Date.now();
      for (const folder of [rootId, ...items.filter(i => i.isFolder).map(i => i.id)]) {
        const cached = folders.get(folder);
        if (!cached || cached.status === 'idle') {
          folders.set(folder, { items: byParent.get(folder) || [], status: 'ready', fetchedAt: now - FOLDER_TTL / 2 });
        }
      }
    })
    .catch((err: Error) => {
      const prev = indexes.get(rootId) || EMPTY;
      indexes.set(rootId, { ...prev, status: 'error', error: err.message });
    })
    .finally(() => {
      inflight.delete(key);
      emit();
    });

  inflight.set(key, promise);
  return promise;
}

export function loadTrash(rootId: string, opts: { force?: boolean } = {}): Promise<void> {
  const key = `t:${rootId}`;
  const running = inflight.get(key);
  if (running) return running;
  const current = trashes.get(rootId);
  if (!opts.force && current?.status === 'ready' && Date.now() - current.fetchedAt < FOLDER_TTL) return Promise.resolve();

  trashes.set(rootId, { ...(current || EMPTY), status: 'loading' });
  emit();

  const promise = (async () => {
    await loadIndex(rootId);
    const index = indexes.get(rootId);
    const folderIds = [rootId, ...(index?.items || []).filter(i => i.isFolder).map(i => i.id)];
    const res = await fetch('/api/files/trash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderIds }),
    });
    const data = await readJson(res);
    const items = normalizeList(data.items, rootId);
    trashes.set(rootId, { items, status: 'ready', fetchedAt: Date.now() });
  })()
    .catch((err: Error) => {
      trashes.set(rootId, { ...(trashes.get(rootId) || EMPTY), status: 'error', error: err.message });
    })
    .finally(() => {
      inflight.delete(key);
      emit();
    });

  inflight.set(key, promise);
  return promise;
}

export async function resolvePath(folderId: string, rootId: string, rootName: string): Promise<Crumb[]> {
  if (folderId === rootId) return [{ id: rootId, name: rootName }];
  const known = getKnownPath(folderId, rootId, rootName);
  if (known) return known;
  const res = await fetch(`/api/files/path?folderId=${encodeURIComponent(folderId)}&rootId=${encodeURIComponent(rootId)}`);
  const data = await readJson(res);
  if (!data.insideRoot || !Array.isArray(data.path) || data.path.length === 0) {
    throw new Error('La carpeta no pertenece a este explorador');
  }
  const trail: Crumb[] = data.path.map((c: Crumb, i: number) => (i === 0 ? { id: rootId, name: rootName } : c));
  paths.set(folderId, trail);
  return trail;
}

/** Path from memory (navigation history or index) without hitting the network. */
export function getKnownPath(folderId: string, rootId: string, rootName: string): Crumb[] | null {
  if (folderId === rootId) return [{ id: rootId, name: rootName }];
  const index = indexes.get(rootId);
  if (index && index.items.length > 0) {
    const byId = new Map(index.items.map(i => [i.id, i]));
    const trail: Crumb[] = [];
    let current = byId.get(folderId);
    let guard = 0;
    while (current && guard++ < 30) {
      trail.unshift({ id: current.id, name: current.name });
      if (current.parentId === rootId) {
        return [{ id: rootId, name: rootName }, ...trail];
      }
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
  }
  const remembered = paths.get(folderId);
  return remembered ? [{ id: rootId, name: rootName }, ...remembered.slice(1)] : null;
}

export function rememberPath(folderId: string, trail: Crumb[]) {
  paths.set(folderId, trail);
}

// ─── Reading (hooks) ────────────────────────────────────────────────────────

export function getFolder(folderId: string | null | undefined): ListEntry {
  return (folderId && folders.get(folderId)) || EMPTY;
}

export function getIndex(rootId: string): ListEntry {
  return indexes.get(rootId) || EMPTY;
}

export function useFolder(folderId: string | null | undefined, autoload = true): ListEntry {
  const entry = useSyncExternalStore(subscribe, () => getFolder(folderId), () => EMPTY);
  useEffect(() => {
    if (autoload && folderId) loadFolder(folderId);
  }, [folderId, autoload]);
  return entry;
}

export function useIndex(rootId: string, enabled = true): ListEntry {
  const entry = useSyncExternalStore(subscribe, () => indexes.get(rootId) || EMPTY, () => EMPTY);
  useEffect(() => {
    if (enabled) loadIndex(rootId);
  }, [rootId, enabled]);
  return entry;
}

export function useTrash(rootId: string, enabled: boolean): ListEntry {
  const entry = useSyncExternalStore(subscribe, () => trashes.get(rootId) || EMPTY, () => EMPTY);
  useEffect(() => {
    if (enabled) loadTrash(rootId);
  }, [rootId, enabled]);
  return entry;
}

/** Re-renders whenever anything in the store changes (for derived lookups). */
export function useStoreVersion(): number {
  return useSyncExternalStore(subscribe, () => storeVersion, () => 0);
}
let storeVersion = 0;
listeners.add(() => { storeVersion++; });

export function findItem(id: string): DriveItem | undefined {
  for (const entry of folders.values()) {
    const hit = entry.items.find(i => i.id === id);
    if (hit) return hit;
  }
  for (const entry of indexes.values()) {
    const hit = entry.items.find(i => i.id === id);
    if (hit) return hit;
  }
  return undefined;
}

/** True when `folderId` is `ancestorId` or lives somewhere below it (uses the loaded index). */
export function isInside(folderId: string, ancestorId: string, rootId: string): boolean {
  if (folderId === ancestorId) return true;
  const index = indexes.get(rootId);
  if (!index) return false;
  const byId = new Map(index.items.map(i => [i.id, i]));
  let current = byId.get(folderId);
  let guard = 0;
  while (current && guard++ < 40) {
    if (current.parentId === ancestorId) return true;
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return false;
}

// ─── Local patches (optimistic updates) ─────────────────────────────────────

function mapEntries(map: Map<string, ListEntry>, fn: (items: DriveItem[], key: string) => DriveItem[]) {
  for (const [key, entry] of map) {
    const next = fn(entry.items, key);
    if (next !== entry.items) map.set(key, { ...entry, items: next });
  }
}

export function patchItems(ids: string[], patch: Partial<DriveItem> | ((item: DriveItem) => Partial<DriveItem>)) {
  const idSet = new Set(ids);
  const apply = (items: DriveItem[]) => {
    let changed = false;
    const next = items.map(item => {
      if (!idSet.has(item.id)) return item;
      changed = true;
      return { ...item, ...(typeof patch === 'function' ? patch(item) : patch) };
    });
    return changed ? next : items;
  };
  mapEntries(folders, apply);
  mapEntries(indexes, apply);
  mapEntries(trashes, apply);
  emit();
}

export function removeItems(ids: string[]) {
  const idSet = new Set(ids);
  const apply = (items: DriveItem[]) => (items.some(i => idSet.has(i.id)) ? items.filter(i => !idSet.has(i.id)) : items);
  mapEntries(folders, apply);
  mapEntries(indexes, apply);
  emit();
}

export function removeFromTrash(ids: string[]) {
  const idSet = new Set(ids);
  mapEntries(trashes, items => (items.some(i => idSet.has(i.id)) ? items.filter(i => !idSet.has(i.id)) : items));
  emit();
}

export function addToTrash(rootId: string, items: DriveItem[]) {
  const entry = trashes.get(rootId);
  if (entry) {
    const ids = new Set(items.map(i => i.id));
    trashes.set(rootId, { ...entry, items: [...items.map(i => ({ ...i, trashedTime: new Date().toISOString() })), ...entry.items.filter(i => !ids.has(i.id))] });
    emit();
  }
}

/** Inserts (or replaces) items into their parent folder listing and the root's index. */
export function insertItems(items: DriveItem[], rootId: string) {
  for (const item of items) {
    if (!item.parentId) continue;
    const entry = folders.get(item.parentId);
    if (entry && entry.status !== 'idle') {
      folders.set(item.parentId, { ...entry, items: [...entry.items.filter(i => i.id !== item.id), item] });
    }
  }
  const index = indexes.get(rootId);
  if (index && index.status !== 'idle') {
    const ids = new Set(items.map(i => i.id));
    indexes.set(rootId, { ...index, items: [...index.items.filter(i => !ids.has(i.id)), ...items] });
  }
  emit();
}

/** Marks every cached listing as stale so the next read refetches in the background. */
export function invalidateAll() {
  for (const [key, entry] of folders) folders.set(key, { ...entry, fetchedAt: 0 });
  for (const [key, entry] of indexes) indexes.set(key, { ...entry, fetchedAt: 0 });
  for (const [key, entry] of trashes) trashes.set(key, { ...entry, fetchedAt: 0 });
  emit();
}

// ─── Server mutations ───────────────────────────────────────────────────────

export async function apiUpdate(fileId: string, body: Record<string, unknown>) {
  const res = await fetch('/api/files', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, ...body }),
  });
  return readJson(res);
}

export async function apiTrash(fileId: string) {
  return readJson(await fetch(`/api/files?id=${encodeURIComponent(fileId)}`, { method: 'DELETE' }));
}

export async function apiDeleteForever(fileId: string) {
  return readJson(await fetch(`/api/files?id=${encodeURIComponent(fileId)}&permanent=true`, { method: 'DELETE' }));
}

export async function apiCreateFolder(name: string, parentId: string): Promise<string> {
  const data = await readJson(await fetch('/api/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, parentId }),
  }));
  return data.folderId;
}

export async function apiCopy(fileId: string, parentId?: string) {
  const data = await readJson(await fetch('/api/files/copy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId, parentId }),
  }));
  return data.file;
}

export async function apiSetExpiration(fileId: string, expiresAt: number | null) {
  return readJson(await fetch(`/api/files/${fileId}/expiration`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(expiresAt ? { expiresAt } : { expiresAt: null, expiresInMs: null }),
  }));
}

export async function apiShareWith(fileId: string, emailAddress: string, role = 'reader') {
  return readJson(await fetch(`/api/files/${fileId}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, type: 'user', emailAddress }),
  }));
}

/** Runs `fn` over `items` with limited parallelism; returns the failures. */
export async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<unknown>): Promise<{ item: T; error: Error }[]> {
  const failures: { item: T; error: Error }[] = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      try {
        await fn(item);
      } catch (error: any) {
        failures.push({ item, error });
      }
    }
  });
  await Promise.all(workers);
  return failures;
}
