'use client';

import type { IgBootstrap, IgPostInput, IgPostView, IgSettings } from '@/types/instagram';

async function json<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
  return data as T;
}

let bootstrapCache: { at: number; promise: Promise<IgBootstrap> } | null = null;

export function getBootstrap(fresh = false): Promise<IgBootstrap> {
  if (!fresh && bootstrapCache && Date.now() - bootstrapCache.at < 60_000) return bootstrapCache.promise;
  const promise = fetch('/api/instagram', { cache: 'no-store' }).then(r => json<IgBootstrap>(r));
  bootstrapCache = { at: Date.now(), promise };
  promise.catch(() => { bootstrapCache = null; });
  return promise;
}

export async function listPosts(): Promise<IgPostView[]> {
  const r = await json<{ posts: IgPostView[] }>(await fetch('/api/instagram/posts', { cache: 'no-store' }));
  return r.posts;
}

export async function createPost(input: IgPostInput) {
  return json<{ post: IgPostView; publishing: boolean }>(
    await fetch('/api/instagram/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
  );
}

export async function updatePost(id: string, body: Partial<IgPostInput> | { action: 'cancel' | 'reactivate' | 'retry' | 'publishNow' }) {
  return json<{ post: IgPostView; publishing?: boolean }>(
    await fetch(`/api/instagram/posts/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  );
}

export async function removePost(id: string) {
  return json<{ ok: true }>(await fetch(`/api/instagram/posts/${id}`, { method: 'DELETE' }));
}

export async function processNow() {
  return json<{ published: number; failed: number; waiting: number; due: number }>(await fetch('/api/instagram/process', { method: 'POST' }));
}

export async function disconnect() {
  return json(await fetch('/api/instagram/disconnect', { method: 'POST' }));
}

export async function saveSettings(settings: IgSettings) {
  return json<{ settings: IgSettings }>(
    await fetch('/api/instagram', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) })
  );
}

export interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  modifiedTime?: string;
  width: number;
  height: number;
  duration: number;
}

export async function searchDrive(kind: 'image' | 'video' | 'audio', q = ''): Promise<DriveItem[]> {
  const r = await json<{ files: DriveItem[] }>(await fetch(`/api/instagram/drive?kind=${kind}&q=${encodeURIComponent(q)}`));
  return r.files;
}

export async function driveFileInfo(id: string): Promise<DriveItem> {
  const r = await json<{ file: DriveItem }>(await fetch(`/api/instagram/drive?id=${encodeURIComponent(id)}`));
  return r.file;
}

export async function downloadDriveBlob(id: string): Promise<Blob> {
  const res = await fetch(`/api/instagram/drive/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error((await res.text().catch(() => '')) || 'No se pudo abrir el archivo de Drive');
  return res.blob();
}

/** Miniatura de un archivo de Drive (unos KB; funciona aunque el navegador no tenga sesión de Google) */
export function driveThumb(id: string, size = 600) {
  return `/api/instagram/drive/${encodeURIComponent(id)}?thumb=${size}`;
}

// ── Eventos globales ─────────────────────────────────────────────────────────

export interface ComposeRequest {
  mode?: 'now' | 'schedule';
  /** Editar una publicación existente */
  post?: IgPostView;
  /** Copiar una publicación (mismos archivos, nueva fecha) */
  duplicate?: IgPostView;
  /** Empezar con un archivo de Drive (p. ej. desde el explorador) */
  driveFileId?: string;
  artistId?: string;
  /** Fecha sugerida (ISO) */
  at?: string;
}

export const COMPOSE_EVENT = 'ezy:instagram-compose';
export const CHANGED_EVENT = 'ezy:instagram-changed';

export function openComposer(req: ComposeRequest = {}) {
  window.dispatchEvent(new CustomEvent<ComposeRequest>(COMPOSE_EVENT, { detail: req }));
}

export function notifyChanged() {
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT));
}
