'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { DriveItem } from './types';

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
}

export function useMediaQuery(query: string, fallback = false): boolean {
  const [matches, setMatches] = useState(fallback);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [query]);
  return matches;
}

/** A per-viewer preference remembered in localStorage (silently falls back to memory). */
export function usePreference<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`ezy-explorer:${key}`);
      if (raw !== null) setValue(JSON.parse(raw));
    } catch {}
  }, [key]);
  const update = useCallback((next: T) => {
    setValue(next);
    try { localStorage.setItem(`ezy-explorer:${key}`, JSON.stringify(next)); } catch {}
  }, [key]);
  return [value, update];
}

export async function copyText(text: string, successMessage = 'Copiado al portapapeles') {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); } catch {}
    document.body.removeChild(area);
  }
  toast.success(successMessage);
}

/**
 * Solicita en segundo plano que Google Drive active permisos de lectura pública
 * para los elementos indicados (archivos o carpetas).
 */
export async function ensurePublic(fileIds: string | string[], role: 'writer' | 'reader' = 'reader') {
  const ids = (Array.isArray(fileIds) ? fileIds : [fileIds]).filter(Boolean);
  if (ids.length === 0) return;
  try {
    await fetch('/api/files/share-public', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileIds: ids, role }),
    });
  } catch (err) {
    console.warn('[ensurePublic] Failed to update permissions:', err);
  }
}

/**
 * Copia el enlace al portapapeles de forma inmediata y activa en segundo plano
 * el permiso de lectura pública (role: 'reader', type: 'anyone') en Google Drive
 * para que cualquier persona que reciba el enlace pueda entrar y leer todo sin pedir acceso.
 */
export async function copyTextAndEnsurePublic(
  text: string,
  fileIds: string | string[],
  successMessage = 'Enlace copiado',
  role: 'writer' | 'reader' = 'reader'
) {
  // 1. Inmediato para feedback instantáneo al usuario
  await copyText(text, successMessage);
  // 2. Activación en segundo plano (fire-and-forget)
  ensurePublic(fileIds, role);
}

const LARGE_FILE = 95 * 1024 * 1024;

function downloadUrl(id: string) {
  return `/api/files/${id}?download=true`;
}

function triggerAnchor(id: string, name: string) {
  const a = document.createElement('a');
  a.href = downloadUrl(id);
  a.download = name;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function triggerIframe(id: string) {
  const frame = document.createElement('iframe');
  frame.style.display = 'none';
  frame.src = downloadUrl(id);
  document.body.appendChild(frame);
  setTimeout(() => frame.remove(), 120_000);
}

/**
 * Downloads files straight from Google (the API route only redirects, no bytes go through Vercel).
 * A single file uses a normal link; several files are queued through hidden frames so the page
 * never navigates away. Files above ~100 MB need Google's "download anyway" page, so they open in a tab.
 */
export function downloadFiles(files: DriveItem[]) {
  const list = files.filter(f => !f.isFolder);
  if (list.length === 0) return;

  if (list.length === 1) {
    triggerAnchor(list[0].id, list[0].name);
    return;
  }

  if (isIOS()) {
    triggerAnchor(list[0].id, list[0].name);
    toast.info('En iPhone/iPad solo se puede descargar un archivo cada vez', {
      description: 'Se ha descargado el primero. Selecciona los demás de uno en uno o ábrelos en Drive.',
    });
    return;
  }

  const large = list.filter(f => (f.size ?? 0) > LARGE_FILE);
  const regular = list.filter(f => (f.size ?? 0) <= LARGE_FILE);

  regular.forEach((file, i) => setTimeout(() => triggerIframe(file.id), i * 900));
  large.forEach(file => {
    const win = window.open(downloadUrl(file.id), '_blank', 'noopener');
    if (!win) {
      toast.warning(`"${file.name}" es muy grande`, {
        description: 'Tu navegador bloqueó la ventana de descarga.',
        action: { label: 'Descargar', onClick: () => triggerAnchor(file.id, file.name) },
        duration: 15_000,
      });
    }
  });

  toast.success(`Descargando ${list.length} archivos`, {
    description: 'Si el navegador lo pregunta, permite las descargas múltiples.',
  });
}

export async function nativeShare(title: string, url: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.share) return false;
  try {
    await navigator.share({ title, url });
    return true;
  } catch (err: any) {
    // The user closing the share sheet is not an error
    return err?.name === 'AbortError';
  }
}

export function canNativeShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}
