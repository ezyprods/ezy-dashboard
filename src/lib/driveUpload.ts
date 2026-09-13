'use client';

export interface UploadedDriveFile {
  id: string;
  name: string;
  mimeType?: string;
  size?: string;
  webViewLink?: string;
  webContentLink?: string;
}

interface UploadOptions {
  /** Overwrite this existing Drive file (keeps its id) instead of creating a new one */
  fileId?: string;
  /** Name to store in Drive (defaults to the file name) */
  name?: string;
  appProperties?: Record<string, string>;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/**
 * Uploads a file straight to Google Drive with a resumable session.
 * The bytes never go through the Vercel function, so there is no 4.5 MB body limit.
 */
export async function uploadFileToDrive(file: Blob & { name?: string }, parentId: string, opts: UploadOptions = {}): Promise<UploadedDriveFile> {
  const name = opts.name || file.name || 'archivo';
  const mimeType = file.type || 'application/octet-stream';

  const sessionRes = await fetch('/api/files/upload-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType,
      parentId,
      fileId: opts.fileId,
      appProperties: opts.appProperties,
    }),
    signal: opts.signal,
  });

  if (!sessionRes.ok) {
    const err = await sessionRes.json().catch(() => ({}));
    throw new Error(err.error || 'No se pudo iniciar la subida a Google Drive');
  }

  const { uploadUrl } = await sessionRes.json();

  return new Promise<UploadedDriveFile>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', mimeType);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) opts.onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        let data: any = {};
        try { data = JSON.parse(xhr.responseText); } catch {}
        const id = data.id || opts.fileId;
        if (!id) {
          reject(new Error('Google Drive no devolvió el identificador del archivo'));
          return;
        }
        opts.onProgress?.(1);
        resolve({ ...data, id, name: data.name || name });
      } else {
        reject(new Error(`Error al subir ${name} a Google Drive (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Error de conexión con Google Drive'));
    xhr.onabort = () => reject(new DOMException('Subida cancelada', 'AbortError'));

    if (opts.signal) {
      if (opts.signal.aborted) { xhr.abort(); return; }
      opts.signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    xhr.send(file);
  });
}

// ─── Similar-name detection (same algorithm the /api/files upload used) ───────

function cleanName(str: string): string {
  return str
    .toLowerCase()
    .replace(/\.[^/.]+$/, '')
    .replace(/[-_]?(v\d+|final|master|mix|demo|edit|ref|prod)/gi, '')
    .replace(/[^a-z0-9]/gi, '')
    .trim();
}

function levenshtein(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) d[i][0] = i;
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[a.length][b.length];
}

function similarity(a: string, b: string): number {
  const c1 = cleanName(a);
  const c2 = cleanName(b);
  if (!c1 || !c2) return 0;
  if (c1 === c2) return 1;
  const maxLen = Math.max(c1.length, c2.length);
  return 1 - levenshtein(c1, c2) / maxLen;
}

/** Returns an existing file in the folder whose name is ≥80% similar, if any. */
export async function findSimilarFileInFolder(parentId: string, fileName: string): Promise<{ id: string; name: string } | null> {
  try {
    const res = await fetch(`/api/files?folderId=${encodeURIComponent(parentId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    let best: { id: string; name: string } | null = null;
    let bestScore = 0;
    for (const f of data.items || []) {
      if (f.mimeType === 'application/vnd.google-apps.folder') continue;
      const score = similarity(fileName, f.name || '');
      if (score > bestScore) {
        bestScore = score;
        best = { id: f.id, name: f.name };
      }
    }
    return bestScore >= 0.8 ? best : null;
  } catch {
    return null;
  }
}
