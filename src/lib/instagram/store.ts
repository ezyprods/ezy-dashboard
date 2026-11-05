import { randomUUID } from 'node:crypto';
import { getDriveService } from '@/lib/drive';
import { DRIVE_ROOT_FOLDER_ID } from '@/lib/constants';
import type { IgPost, IgSettings, IgStatus } from '@/types/instagram';

/**
 * Almacén de Instagram en Google Drive, separado de todo lo demás:
 *
 *   00_INSTAGRAM/                 (privada; el prefijo 00_ evita que salga como artista)
 *     conexion.json               cuenta conectada y token cifrado
 *     ajustes.json                hashtags y plantillas de texto
 *     Publicaciones/<id>.json     una publicación por archivo, con su estado en appProperties
 *     Medios/                     lo que se publica (compartida con enlace: Meta descarga de aquí)
 *
 * Borrar la carpeta 00_INSTAGRAM elimina el módulo entero sin dejar restos.
 */

const ROOT_NAME = '00_INSTAGRAM';
const POSTS_NAME = 'Publicaciones';
const MEDIA_NAME = 'Medios';
const CONNECTION_FILE = 'conexion.json';
const SETTINGS_FILE = 'ajustes.json';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export interface IgFolders {
  root: string;
  posts: string;
  media: string;
}

export interface IgConnection {
  igUserId: string;
  username: string;
  name?: string;
  profilePictureUrl?: string;
  /** Token cifrado (ver secrets.ts) */
  token: string;
  systemUserId?: string;
  businessId?: string;
  connectedAt: string;
}

let foldersCache: IgFolders | null = null;
const postCache = new Map<string, { modified: string; post: IgPost }>();

function esc(v: string) {
  return v.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function findOrCreateFolder(name: string, parentId: string, publicLink = false): Promise<string> {
  const drive = getDriveService();
  // Siempre la más antigua: si dos ejecuciones crearon la carpeta a la vez, todas eligen la misma
  const list = async () => (await drive.files.list({
    q: `'${parentId}' in parents and name = '${esc(name)}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: 'files(id, createdTime)',
    orderBy: 'createdTime',
    pageSize: 10,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })).data.files || [];
  const found = (await list())[0]?.id;
  if (found) return found;
  const created = await drive.files.create({
    requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
    fields: 'id',
    supportsAllDrives: true,
  });
  let id = created.data.id!;
  const oldest = (await list())[0]?.id;
  if (oldest && oldest !== id) {
    // Otra ejecución se adelantó: se usa la suya y se quita la recién creada (está vacía)
    await drive.files.delete({ fileId: id, supportsAllDrives: true }).catch(() => {});
    id = oldest;
    return id;
  }
  if (publicLink) {
    await drive.permissions.create({
      fileId: id,
      requestBody: { role: 'reader', type: 'anyone' },
      supportsAllDrives: true,
    });
  }
  return id;
}

let foldersPromise: Promise<IgFolders> | null = null;

export function getFolders(): Promise<IgFolders> {
  if (foldersCache) return Promise.resolve(foldersCache);
  if (!DRIVE_ROOT_FOLDER_ID) return Promise.reject(new Error('Falta DRIVE_ROOT_FOLDER_ID'));
  // Peticiones simultáneas comparten la misma búsqueda (evita carpetas duplicadas)
  foldersPromise ??= (async () => {
    const root = await findOrCreateFolder(ROOT_NAME, DRIVE_ROOT_FOLDER_ID);
    const [posts, media] = await Promise.all([
      findOrCreateFolder(POSTS_NAME, root),
      findOrCreateFolder(MEDIA_NAME, root, true),
    ]);
    foldersCache = { root, posts, media };
    return foldersCache;
  })().finally(() => { foldersPromise = null; });
  return foldersPromise;
}

// ── JSON sueltos (conexión y ajustes) ───────────────────────────────────────

async function findFileId(name: string, parentId: string): Promise<string | null> {
  const drive = getDriveService();
  const res = await drive.files.list({
    q: `'${parentId}' in parents and name = '${esc(name)}' and trashed = false`,
    fields: 'files(id)',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return res.data.files?.[0]?.id || null;
}

async function readJson<T>(fileId: string): Promise<T> {
  const drive = getDriveService();
  const res = await drive.files.get({ fileId, alt: 'media', supportsAllDrives: true }, { responseType: 'text' });
  const raw = res.data as unknown;
  return (typeof raw === 'string' ? JSON.parse(raw) : raw) as T;
}

async function writeNamedJson(name: string, parentId: string, data: unknown): Promise<void> {
  const drive = getDriveService();
  const existing = await findFileId(name, parentId);
  const media = { mimeType: 'application/json', body: JSON.stringify(data, null, 2) };
  if (existing) {
    await drive.files.update({ fileId: existing, media, supportsAllDrives: true });
  } else {
    await drive.files.create({
      requestBody: { name, parents: [parentId], mimeType: 'application/json' },
      media,
      fields: 'id',
      supportsAllDrives: true,
    });
  }
}

let connectionCache: { at: number; value: IgConnection | null } | null = null;
const CONNECTION_TTL_MS = 60 * 1000;

export async function readConnection(fresh = false): Promise<IgConnection | null> {
  if (!fresh && connectionCache && Date.now() - connectionCache.at < CONNECTION_TTL_MS) return connectionCache.value;
  const { root } = await getFolders();
  const id = await findFileId(CONNECTION_FILE, root);
  const value = id ? await readJson<IgConnection>(id).catch(() => null) : null;
  connectionCache = { at: Date.now(), value };
  return value;
}

export async function saveConnection(conn: IgConnection | null): Promise<void> {
  const { root } = await getFolders();
  if (conn) {
    await writeNamedJson(CONNECTION_FILE, root, conn);
  } else {
    const id = await findFileId(CONNECTION_FILE, root);
    if (id) await getDriveService().files.delete({ fileId: id, supportsAllDrives: true });
  }
  connectionCache = { at: Date.now(), value: conn };
}

const DEFAULT_SETTINGS: IgSettings = {
  hashtagSets: [
    { id: 'produccion', name: 'Producción', tags: '#producer #musicproducer #beatmaker #studio #flstudio' },
    { id: 'mezcla', name: 'Mezcla y master', tags: '#mixing #mastering #mixingengineer #audioengineer #studiolife' },
  ],
  captionTemplates: [
    { id: 'beat', name: 'Nuevo beat', text: 'Nuevo beat 🔥\n\n¿Qué artista lo ves encima? 👇' },
    { id: 'proceso', name: 'Proceso', text: 'Así se cocinó por dentro 🎛️' },
    { id: 'lanzamiento', name: 'Lanzamiento', text: 'Ya disponible en todas las plataformas 🎧' },
    { id: 'antes-despues', name: 'Antes / después', text: 'Antes y después de la mezcla. Desliza 👉' },
  ],
};

export async function readSettings(): Promise<IgSettings> {
  const { root } = await getFolders();
  const id = await findFileId(SETTINGS_FILE, root);
  if (!id) return DEFAULT_SETTINGS;
  const s: Partial<IgSettings> = await readJson<Partial<IgSettings>>(id).catch(() => ({}));
  return {
    hashtagSets: Array.isArray(s.hashtagSets) ? s.hashtagSets : DEFAULT_SETTINGS.hashtagSets,
    captionTemplates: Array.isArray(s.captionTemplates) ? s.captionTemplates : DEFAULT_SETTINGS.captionTemplates,
  };
}

export async function saveSettings(settings: IgSettings): Promise<void> {
  const { root } = await getFolders();
  await writeNamedJson(SETTINGS_FILE, root, settings);
}

// ── Publicaciones ────────────────────────────────────────────────────────────

interface PostFileMeta {
  fileId: string;
  postId: string;
  modified: string;
  status: IgStatus;
  scheduledFor: string;
}

async function listPostFiles(statuses?: IgStatus[]): Promise<PostFileMeta[]> {
  const { posts } = await getFolders();
  const drive = getDriveService();
  let q = `'${posts}' in parents and trashed = false and mimeType = 'application/json'`;
  if (statuses?.length) {
    q += ` and (${statuses.map(s => `appProperties has { key='igStatus' and value='${s}' }`).join(' or ')})`;
  }
  const out: PostFileMeta[] = [];
  let pageToken: string | undefined;
  do {
    const res: any = await drive.files.list({
      q,
      fields: 'nextPageToken, files(id, name, modifiedTime, appProperties)',
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    for (const f of res.data.files || []) {
      out.push({
        fileId: f.id,
        postId: String(f.name || '').replace(/\.json$/, ''),
        modified: f.modifiedTime || '',
        status: (f.appProperties?.igStatus || 'PENDING') as IgStatus,
        scheduledFor: f.appProperties?.igAt || '',
      });
    }
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);
  return out;
}

const fileIdByPost = new Map<string, string>();

async function loadPost(meta: PostFileMeta): Promise<IgPost | null> {
  fileIdByPost.set(meta.postId, meta.fileId);
  const cached = postCache.get(meta.postId);
  if (cached && cached.modified === meta.modified) return cached.post;
  try {
    const post = await readJson<IgPost>(meta.fileId);
    postCache.set(meta.postId, { modified: meta.modified, post });
    return post;
  } catch (err) {
    console.warn('[instagram/store] No se pudo leer', meta.postId, (err as Error).message);
    return null;
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }));
  return out;
}

export async function listPosts(statuses?: IgStatus[]): Promise<IgPost[]> {
  const metas = await listPostFiles(statuses);
  const posts = await mapLimit(metas, 8, loadPost);
  return posts.filter((p): p is IgPost => !!p);
}

async function postFileId(postId: string): Promise<string | null> {
  const known = fileIdByPost.get(postId);
  if (known) return known;
  const { posts } = await getFolders();
  const id = await findFileId(`${postId}.json`, posts);
  if (id) fileIdByPost.set(postId, id);
  return id;
}

export async function getPost(postId: string): Promise<IgPost | null> {
  if (!/^[\w-]{8,64}$/.test(postId)) return null;
  const fileId = await postFileId(postId);
  if (!fileId) return null;
  try {
    return await readJson<IgPost>(fileId);
  } catch {
    return null;
  }
}

export async function savePost(post: IgPost): Promise<IgPost> {
  const drive = getDriveService();
  const { posts } = await getFolders();
  post.updatedAt = new Date().toISOString();
  const appProperties = { igStatus: post.status, igAt: post.scheduledFor || '' };
  const media = { mimeType: 'application/json', body: JSON.stringify(post, null, 2) };
  const existing = await postFileId(post.id);
  let modified = '';
  if (existing) {
    const res = await drive.files.update({
      fileId: existing,
      requestBody: { appProperties },
      media,
      fields: 'modifiedTime',
      supportsAllDrives: true,
    });
    modified = res.data.modifiedTime || '';
  } else {
    const res = await drive.files.create({
      requestBody: { name: `${post.id}.json`, parents: [posts], mimeType: 'application/json', appProperties },
      media,
      fields: 'id, modifiedTime',
      supportsAllDrives: true,
    });
    fileIdByPost.set(post.id, res.data.id!);
    modified = res.data.modifiedTime || '';
  }
  postCache.set(post.id, { modified, post });
  return post;
}

export async function deletePost(postId: string): Promise<void> {
  const fileId = await postFileId(postId);
  if (fileId) await getDriveService().files.delete({ fileId, supportsAllDrives: true });
  fileIdByPost.delete(postId);
  postCache.delete(postId);
}

export function newPostId(): string {
  return randomUUID();
}

/** Lee y modifica una publicación, comprobando que nadie la haya cambiado mientras tanto */
export async function updatePost(postId: string, change: (p: IgPost) => IgPost | null): Promise<IgPost | null> {
  const current = await getPost(postId);
  if (!current) return null;
  const next = change(current);
  if (!next) return current;
  return savePost(next);
}

/** Borra archivos de 00_INSTAGRAM/Medios (los de otras carpetas de Drive no se tocan) */
export async function deleteMediaFiles(ids: (string | undefined)[]): Promise<number> {
  const { media } = await getFolders();
  const drive = getDriveService();
  let removed = 0;
  for (const id of new Set(ids.filter((x): x is string => !!x && /^[\w-]{10,}$/.test(x)))) {
    try {
      const f = await drive.files.get({ fileId: id, fields: 'parents', supportsAllDrives: true });
      if (!f.data.parents?.includes(media)) continue;
      await drive.files.delete({ fileId: id, supportsAllDrives: true });
      removed++;
    } catch { /* ya no existe */ }
  }
  return removed;
}
