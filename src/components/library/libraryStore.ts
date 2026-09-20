'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { readJson } from '@/components/explorer/driveStore';
import type { BeatAssignment, BeatSend } from '@/types';

/** Client cache of the beat library: root folder, sends and assignment history. */

interface LibraryStoreState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  rootId: string;
  rootName: string;
  sends: BeatSend[];
  assignments: BeatAssignment[];
  error?: string;
}

let state: LibraryStoreState = { status: 'idle', rootId: '', rootName: 'Proyectos personales', sends: [], assignments: [] };
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(patch: Partial<LibraryStoreState>) {
  state = { ...state, ...patch };
  listeners.forEach(l => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function loadLibrary(opts: { force?: boolean } = {}): Promise<void> {
  if (inflight) return inflight;
  if (!opts.force && state.status === 'ready') return Promise.resolve();
  set({ status: state.status === 'ready' ? 'ready' : 'loading', error: undefined });
  inflight = fetch('/api/library', { cache: 'no-store' })
    .then(readJson)
    .then(data => set({ status: 'ready', rootId: data.rootId, rootName: data.rootName, sends: data.sends || [], assignments: data.assignments || [] }))
    .catch((err: Error) => set({ status: state.rootId ? 'ready' : 'error', error: err.message }))
    .finally(() => { inflight = null; });
  return inflight;
}

export function useLibrary(enabled = true): LibraryStoreState {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => state);
  useEffect(() => { if (enabled) loadLibrary(); }, [enabled]);
  return snapshot;
}

export function getLibraryState() {
  return state;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export interface SendInput {
  title?: string;
  note?: string;
  itemIds: string[];
  artistIds: string[];
  allowDownload?: boolean;
  mergeIntoId?: string;
}

export async function apiCreateSend(input: SendInput): Promise<{ send: BeatSend; merged: boolean; newArtistIds: string[] }> {
  const data = await readJson(await fetch('/api/library/sends', json('POST', input)));
  set({ sends: data.sends });
  return data;
}

export async function apiUpdateSend(id: string, patch: Partial<Pick<BeatSend, 'title' | 'note' | 'artistIds' | 'itemIds' | 'allowDownload'>>): Promise<BeatSend> {
  const previous = state.sends;
  set({ sends: state.sends.map(s => (s.id === id ? { ...s, ...patch } : s)) });
  try {
    const data = await readJson(await fetch(`/api/library/sends/${id}`, json('PATCH', patch)));
    set({ sends: data.sends });
    return data.send;
  } catch (err) {
    set({ sends: previous });
    throw err;
  }
}

export async function apiDeleteSend(id: string): Promise<void> {
  const previous = state.sends;
  set({ sends: state.sends.filter(s => s.id !== id) });
  try {
    const data = await readJson(await fetch(`/api/library/sends/${id}`, json('DELETE')));
    set({ sends: data.sends });
  } catch (err) {
    set({ sends: previous });
    throw err;
  }
}

/** Restores a deleted send exactly as it was (undo). */
export async function apiRestoreSend(send: BeatSend): Promise<void> {
  const created = await apiCreateSend({ title: send.title, note: send.note, itemIds: send.itemIds, artistIds: send.artistIds, allowDownload: send.allowDownload });
  if (created.send.title !== send.title) await apiUpdateSend(created.send.id, { title: send.title });
}

export async function apiAssign(itemIds: string[], artistId: string): Promise<{ assignments: BeatAssignment[] }> {
  const data = await readJson(await fetch('/api/library/assignments', json('POST', { itemIds, artistId })));
  set({ sends: data.sends, assignments: data.allAssignments });
  return data;
}

export async function apiUndoAssignment(id: string): Promise<void> {
  const data = await readJson(await fetch(`/api/library/assignments/${id}`, json('DELETE')));
  set({ sends: data.sends, assignments: data.allAssignments });
}
