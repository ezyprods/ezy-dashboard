'use client';

/**
 * Turns a drop (or a file input) into a flat list of files.
 *
 * - Supports dropping whole folders (Chromium/Safari/Firefox): the structure is kept in
 *   `relativePathOf(file)` so the upload can recreate the subfolders in Drive.
 * - Ignores system noise (.DS_Store, Thumbs.db, hidden files) and caps the amount of files
 *   so a mis-drop of a huge folder can't freeze the app.
 */

const MAX_FILES = 300;
const MAX_DEPTH = 8;

const relativePaths = new WeakMap<File, string>();

/** Folder path (without the file name) this file came from, e.g. "Stems/Vocals". */
export function relativePathOf(file: File): string {
  return relativePaths.get(file) || '';
}

export function setRelativePath(file: File, path: string) {
  if (path) relativePaths.set(file, path);
}

const IGNORED = /^(\.DS_Store|Thumbs\.db|desktop\.ini|\.localized)$/i;

function isUsable(file: File): boolean {
  if (!file || IGNORED.test(file.name) || file.name.startsWith('.')) return false;
  // Dropping a folder in browsers without directory support yields a 0-byte entry with no type
  if (file.size === 0 && !file.type) return false;
  return true;
}

function readEntries(reader: any): Promise<any[]> {
  return new Promise(resolve => reader.readEntries((entries: any[]) => resolve(entries || []), () => resolve([])));
}

function fileOf(entry: any): Promise<File | null> {
  return new Promise(resolve => entry.file((f: File) => resolve(f), () => resolve(null)));
}

async function walkEntry(entry: any, path: string, out: File[], depth = 0): Promise<void> {
  if (!entry || out.length >= MAX_FILES) return;
  if (entry.isFile) {
    const file = await fileOf(entry);
    if (file && isUsable(file)) {
      setRelativePath(file, path);
      out.push(file);
    }
    return;
  }
  if (entry.isDirectory && depth < MAX_DEPTH) {
    const reader = entry.createReader();
    // readEntries returns at most 100 entries per call
    let batch = await readEntries(reader);
    while (batch.length > 0 && out.length < MAX_FILES) {
      for (const child of batch) {
        await walkEntry(child, path ? `${path}/${entry.name}` : entry.name, out, depth + 1);
        if (out.length >= MAX_FILES) return;
      }
      batch = await readEntries(reader);
    }
  }
}

export interface IntakeResult {
  files: File[];
  /** True when the cap was reached and some files were left out */
  truncated: boolean;
  hadFolders: boolean;
}

/** Extracts every file from a drop, expanding dropped folders. Call it right inside the drop handler. */
export async function extractDroppedFiles(dataTransfer: DataTransfer | null): Promise<IntakeResult> {
  if (!dataTransfer) return { files: [], truncated: false, hadFolders: false };

  // The entries must be captured synchronously: the DataTransfer is emptied once the handler returns
  const entries: any[] = [];
  let hadFolders = false;
  if (dataTransfer.items && typeof dataTransfer.items[0]?.webkitGetAsEntry === 'function') {
    for (const item of Array.from(dataTransfer.items)) {
      if (item.kind !== 'file') continue;
      const entry = (item as any).webkitGetAsEntry?.();
      if (entry) {
        if (entry.isDirectory) hadFolders = true;
        entries.push(entry);
      }
    }
  }
  const plainFiles = Array.from(dataTransfer.files || []);

  if (entries.length === 0) {
    const files = plainFiles.filter(isUsable).slice(0, MAX_FILES);
    return { files, truncated: plainFiles.length > files.length, hadFolders: false };
  }

  const out: File[] = [];
  for (const entry of entries) {
    await walkEntry(entry, '', out);
    if (out.length >= MAX_FILES) break;
  }

  // Safety net: if the entry API gave nothing (rare), fall back to the plain file list
  if (out.length === 0 && plainFiles.length > 0) {
    const files = plainFiles.filter(isUsable).slice(0, MAX_FILES);
    return { files, truncated: false, hadFolders };
  }

  return { files: out, truncated: out.length >= MAX_FILES, hadFolders };
}

/** Files picked with an <input type="file"> (keeps the folder structure of a directory picker). */
export function filesFromInput(list: FileList | null): File[] {
  const files = Array.from(list || []).filter(isUsable).slice(0, MAX_FILES);
  for (const file of files) {
    const rel = (file as any).webkitRelativePath as string | undefined;
    if (rel && rel.includes('/')) {
      // "MiCarpeta/Stems/voz.wav" → "MiCarpeta/Stems"
      setRelativePath(file, rel.slice(0, rel.lastIndexOf('/')));
    }
  }
  return files;
}

/** Stable identity of a file so the same one is never queued twice. */
export function fileKey(file: File): string {
  return `${relativePathOf(file)}/${file.name}:${file.size}:${file.lastModified}`;
}
