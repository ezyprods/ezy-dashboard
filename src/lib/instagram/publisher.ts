import { getDriveService } from '@/lib/drive';
import type { IgMediaItem, IgPost } from '@/types/instagram';
import {
  ContainerParams,
  GraphError,
  containerStatus,
  createContainer,
  mediaInfo,
  postComment,
  publishContainer,
  recentMedia,
  recentStories,
} from './graph';
import { decryptText, signMedia } from './secrets';
import { getPost, listPosts, readConnection, savePost, type IgConnection } from './store';

/**
 * Publicación en Instagram como una pequeña máquina de estados guardada en la propia publicación:
 *
 *   PENDING ──(su hora)──▶ PROCESSING ──▶ PUBLISHED
 *                              │
 *                              └─▶ FAILED (con el motivo)
 *
 * Dentro de PROCESSING: se crean los contenedores en Meta (uno por medio en un carrusel), se espera a
 * que Meta termine de procesarlos (los vídeos pueden tardar minutos) y se publica. Cada paso se guarda,
 * así que si Vercel corta la ejecución (60 s), la siguiente pasada del activador sigue donde se quedó.
 *
 * Para que dos pasadas simultáneas no publiquen lo mismo, cada una "reserva" la publicación durante
 * 75 s (más que lo que dura una función) y comprueba que la reserva sigue siendo suya.
 */

const LEASE_MS = 75 * 1000;
const CONTAINER_MAX_WAIT_MS = 2 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const POLL_MS = 3000;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export function publicBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')
    || process.env.BETTER_AUTH_URL
    || 'https://ezyprods-dashboard.vercel.app';
  return raw.replace(/\/+$/, '');
}

export function imageUrlFor(fileId: string): string {
  return `${publicBaseUrl()}/api/instagram/media/${fileId}?s=${signMedia(fileId)}`;
}

function videoUrlFor(fileId: string): string {
  // Meta descarga el vídeo directamente de Drive: los MB no pasan por Vercel
  return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`;
}

async function ensurePublicLink(fileId: string) {
  try {
    await getDriveService().permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
      supportsAllDrives: true,
    });
  } catch (err) {
    console.warn('[instagram] No se pudo compartir con enlace', fileId, (err as Error).message);
  }
}

function claimTime(claim?: string): number {
  const t = Number(String(claim || '').split('#')[0]);
  return Number.isFinite(t) ? t : 0;
}

/** Reserva la publicación para esta ejecución. Devuelve la versión reservada o null. */
async function acquire(postId: string): Promise<IgPost | null> {
  const current = await getPost(postId);
  if (!current || (current.status !== 'PENDING' && current.status !== 'PROCESSING')) return null;
  if (current.claim && Date.now() - claimTime(current.claim) < LEASE_MS) return null;
  const claim = `${Date.now()}#${Math.random().toString(36).slice(2, 10)}`;
  current.claim = claim;
  if (current.status === 'PENDING') {
    current.status = 'PROCESSING';
    current.processingStartedAt = new Date().toISOString();
  }
  await savePost(current);
  await sleep(1200);
  const check = await getPost(postId);
  return check && check.claim === claim ? check : null;
}

async function release(post: IgPost) {
  post.claim = undefined;
  await savePost(post);
}

async function fail(post: IgPost, message: string) {
  post.status = 'FAILED';
  post.error = message;
  post.claim = undefined;
  await savePost(post);
}

function withoutTags(p: ContainerParams): ContainerParams {
  return { ...p, user_tags: undefined };
}

/** Crea un contenedor; si fallan las etiquetas o colaboradores, reintenta sin ellos y lo anota */
async function createSafely(igUserId: string, token: string, p: ContainerParams, notes: string[]): Promise<string> {
  try {
    return await createContainer(igUserId, token, p);
  } catch (err) {
    const msg = (err as Error).message;
    if (p.user_tags?.length && /etiquetad/i.test(msg)) {
      notes.push('Se publicó sin etiquetas de personas: alguna no se pudo etiquetar.');
      return createSafely(igUserId, token, withoutTags(p), notes);
    }
    if (p.collaborators?.length && /colaborador/i.test(msg)) {
      notes.push('Se publicó sin colaboradores: algún usuario no admite la invitación.');
      return createSafely(igUserId, token, { ...p, collaborators: undefined }, notes);
    }
    throw err;
  }
}

function tagsFor(item: IgMediaItem) {
  return (item.userTags || [])
    .filter(t => t.username)
    .slice(0, 20)
    .map(t => item.kind === 'image'
      ? { username: t.username, x: clamp01(t.x ?? 0.5), y: clamp01(t.y ?? 0.5) }
      : { username: t.username });
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, Number(n) || 0));
}

async function buildContainers(post: IgPost, conn: IgConnection, token: string, notes: string[]) {
  const ig = conn.igUserId;
  const caption = post.caption?.trim() || undefined;
  const collaborators = post.collaborators?.length ? post.collaborators.slice(0, 3) : undefined;
  for (const m of post.media) if (m.kind === 'video') await ensurePublicLink(m.fileId);

  if (post.format === 'CAROUSEL') {
    const children: string[] = [];
    for (const item of post.media.slice(0, 10)) {
      const base: ContainerParams = item.kind === 'video'
        ? { media_type: 'VIDEO', video_url: videoUrlFor(item.fileId), is_carousel_item: true }
        : { image_url: imageUrlFor(item.fileId), is_carousel_item: true, alt_text: item.altText || undefined };
      children.push(await createSafely(ig, token, { ...base, user_tags: tagsFor(item) }, notes));
    }
    post.containers = { children, createdAt: new Date().toISOString() };
    return;
  }

  const item = post.media[0];
  if (!item) throw new GraphError('La publicación no tiene ningún archivo.');

  if (post.format === 'STORY') {
    const mentions = (post.storyMentions || []).map(username => ({ username }));
    const params: ContainerParams = item.kind === 'video'
      ? { media_type: 'STORIES', video_url: videoUrlFor(item.fileId) }
      : { media_type: 'STORIES', image_url: imageUrlFor(item.fileId) };
    const tags = [...tagsFor(item), ...mentions].slice(0, 20);
    post.containers = { parent: await createSafely(ig, token, { ...params, user_tags: tags }, notes), createdAt: new Date().toISOString() };
    return;
  }

  if (post.format === 'REEL') {
    const r = post.reel || { shareToFeed: true };
    const params: ContainerParams = {
      media_type: 'REELS',
      video_url: videoUrlFor(item.fileId),
      caption,
      collaborators,
      share_to_feed: r.shareToFeed !== false,
      audio_name: r.audioName?.trim() || undefined,
      cover_url: r.coverFileId ? imageUrlFor(r.coverFileId) : undefined,
      thumb_offset: !r.coverFileId && r.thumbOffsetMs ? Math.round(r.thumbOffsetMs) : undefined,
      trial_params: r.trial ? { graduation_strategy: 'SS_PERFORMANCE' } : undefined,
      user_tags: tagsFor(item),
    };
    post.containers = { parent: await createSafely(ig, token, params, notes), createdAt: new Date().toISOString() };
    return;
  }

  // POST (imagen única)
  const params: ContainerParams = {
    image_url: imageUrlFor(item.fileId),
    caption,
    collaborators,
    alt_text: item.altText || undefined,
    user_tags: tagsFor(item),
  };
  post.containers = { parent: await createSafely(ig, token, params, notes), createdAt: new Date().toISOString() };
}

const PRODUCT_TYPE: Record<string, string> = { STORY: 'STORY', REEL: 'REELS', POST: 'FEED', CAROUSEL: 'FEED' };

/** Meta dice que ya está publicada pero no lo apuntamos: se busca en la cuenta */
async function reconcile(post: IgPost, conn: IgConnection, token: string): Promise<string | undefined> {
  const since = new Date(post.containers?.createdAt || post.processingStartedAt || 0).getTime() - 60_000;
  const list = post.format === 'STORY' ? await recentStories(conn.igUserId, token) : await recentMedia(conn.igUserId, token);
  const known = new Set((await listPosts(['PUBLISHED'])).map(p => p.igMediaId).filter(Boolean));
  const t = (s?: string) => new Date(String(s || '').replace(/([+-]\d{2})(\d{2})$/, '$1:$2')).getTime();
  const match = list
    .filter(m => !known.has(m.id) && (!m.media_product_type || m.media_product_type === PRODUCT_TYPE[post.format]) && t(m.timestamp) >= since)
    .sort((a, b) => t(a.timestamp) - t(b.timestamp))[0];
  return match?.id;
}

async function markPublished(post: IgPost, mediaId: string | undefined, conn: IgConnection, token: string, notes: string[]) {
  post.status = 'PUBLISHED';
  post.igMediaId = mediaId;
  post.publishedAt = new Date().toISOString();
  post.claim = undefined;
  post.error = notes.length ? notes.join(' ') : undefined;
  if (mediaId) {
    const info = await mediaInfo(mediaId, token);
    post.permalink = info.permalink;
  }
  await savePost(post);
  if (mediaId && post.firstComment?.trim() && post.format !== 'STORY' && !post.firstCommentDone) {
    try {
      await postComment(mediaId, post.firstComment.trim(), token);
      post.firstCommentDone = true;
    } catch (err) {
      post.error = [post.error, `No se pudo escribir el primer comentario: ${(err as Error).message}`].filter(Boolean).join(' ');
    }
    await savePost(post);
  }
}

export type AdvanceResult = 'published' | 'waiting' | 'failed' | 'skipped';

/** Avanza una publicación ya reservada tanto como permita el presupuesto de tiempo */
async function advance(post: IgPost, conn: IgConnection, budgetMs: number): Promise<AdvanceResult> {
  const deadline = Date.now() + budgetMs;
  const token = decryptText(conn.token);
  const notes: string[] = [];

  try {
    if (!post.containers) {
      post.attempts = (post.attempts || 0) + 1;
      if (post.attempts > MAX_ATTEMPTS) {
        await fail(post, 'Se intentó varias veces sin completarse. Revisa los archivos y pulsa Reintentar.');
        return 'failed';
      }
      await buildContainers(post, conn, token, notes);
      if (notes.length) post.error = notes.join(' ');
      await savePost(post);
    }

    for (;;) {
      const c = post.containers!;
      if (Date.now() - new Date(c.createdAt).getTime() > CONTAINER_MAX_WAIT_MS) {
        await fail(post, 'Instagram lleva más de 2 horas procesando el archivo. Pulsa Reintentar.');
        return 'failed';
      }

      if (!c.parent && c.children?.length) {
        const states = await Promise.all(c.children.map(id => containerStatus(id, token)));
        const bad = states.find(s => s.code === 'ERROR' || s.code === 'EXPIRED');
        if (bad) {
          await fail(post, `Instagram rechazó uno de los archivos del carrusel${bad.detail ? ` (${bad.detail})` : ''}. Los vídeos deben ser MP4/MOV en H.264 con audio AAC.`);
          return 'failed';
        }
        if (states.every(s => s.code === 'FINISHED')) {
          c.parent = await createSafely(conn.igUserId, token, {
            media_type: 'CAROUSEL',
            children: c.children,
            caption: post.caption?.trim() || undefined,
            collaborators: post.collaborators?.length ? post.collaborators.slice(0, 3) : undefined,
          }, notes);
          await savePost(post);
          continue;
        }
      } else if (c.parent) {
        const s = await containerStatus(c.parent, token);
        if (s.code === 'FINISHED') {
          try {
            const mediaId = await publishContainer(conn.igUserId, c.parent, token);
            await markPublished(post, mediaId, conn, token, notes);
            return 'published';
          } catch (err) {
            const again = await containerStatus(c.parent, token).catch(() => null);
            if (again?.code === 'PUBLISHED') {
              await markPublished(post, await reconcile(post, conn, token), conn, token, notes);
              return 'published';
            }
            throw err;
          }
        }
        if (s.code === 'PUBLISHED') {
          await markPublished(post, await reconcile(post, conn, token), conn, token, notes);
          return 'published';
        }
        if (s.code === 'ERROR') {
          await fail(post, `Instagram rechazó el archivo${s.detail ? ` (${s.detail})` : ''}. Los vídeos deben ser MP4/MOV en H.264 con audio AAC.`);
          return 'failed';
        }
        if (s.code === 'EXPIRED') {
          post.containers = undefined;
          await fail(post, 'El envío a Instagram caducó. Pulsa Reintentar.');
          return 'failed';
        }
      }

      if (Date.now() + POLL_MS > deadline) {
        await release(post);
        return 'waiting';
      }
      await sleep(POLL_MS);
    }
  } catch (err) {
    const e = err as GraphError;
    if (e.transient && (post.attempts || 0) < MAX_ATTEMPTS) {
      post.error = `${e.message} (se reintentará)`;
      await release(post);
      return 'waiting';
    }
    await fail(post, e.message || 'Error desconocido al publicar');
    return 'failed';
  }
}

/** Publica (o sigue publicando) una publicación concreta: "Publicar ahora" */
export async function runPost(postId: string, budgetMs = 45000): Promise<AdvanceResult> {
  const conn = await readConnection();
  if (!conn) return 'skipped';
  const post = await acquire(postId);
  if (!post) return 'skipped';
  return advance(post, conn, budgetMs);
}

export interface QueueRunResult {
  connected: boolean;
  published: number;
  failed: number;
  waiting: number;
  due: number;
}

/** Una pasada del activador: sigue lo que está en curso y empieza lo que ya toca */
export async function processQueue(totalBudgetMs = 48000): Promise<QueueRunResult> {
  const start = Date.now();
  const result: QueueRunResult = { connected: false, published: 0, failed: 0, waiting: 0, due: 0 };
  const conn = await readConnection();
  if (!conn) return result;
  result.connected = true;

  const nowIso = new Date().toISOString();
  const candidates = (await listPosts(['PENDING', 'PROCESSING']))
    .filter(p => p.status === 'PROCESSING' || (p.scheduledFor && p.scheduledFor <= nowIso))
    .sort((a, b) => {
      // Primero lo que ya está en marcha, luego lo más antiguo
      if (a.status !== b.status) return a.status === 'PROCESSING' ? -1 : 1;
      return a.scheduledFor.localeCompare(b.scheduledFor);
    });
  result.due = candidates.length;

  for (const c of candidates) {
    const left = totalBudgetMs - (Date.now() - start);
    // Empezar algo nuevo solo si queda tiempo de sobra; lo que ya está en curso solo necesita consultar
    if (left < (c.status === 'PROCESSING' ? 6000 : 20000)) break;
    const post = await acquire(c.id);
    if (!post) continue;
    const r = await advance(post, conn, Math.min(left - 3000, c.status === 'PROCESSING' ? 12000 : 30000));
    if (r === 'published') result.published++;
    else if (r === 'failed') result.failed++;
    else if (r === 'waiting') result.waiting++;
  }
  return result;
}
