import type { IgFormat, IgMediaItem, IgPostInput, IgUserTag } from '@/types/instagram';
import {
  CAPTION_MAX,
  CAROUSEL_MAX,
  CAROUSEL_MIN,
  COLLABORATORS_MAX,
  HASHTAGS_MAX,
  MENTIONS_MAX,
  USER_TAGS_MAX,
  cleanUsername,
  countHashtags,
  countMentions,
  mediaProblem,
} from './limits';

const DRIVE_ID = /^[\w-]{10,}$/;
const FORMATS: IgFormat[] = ['STORY', 'POST', 'REEL', 'CAROUSEL'];

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

function users(list: unknown, max: number): string[] {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map(u => cleanUsername(String(u))).filter(Boolean))].slice(0, max);
}

function tags(list: unknown): IgUserTag[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((t: any) => ({
      username: cleanUsername(t?.username),
      x: typeof t?.x === 'number' ? Math.max(0, Math.min(1, t.x)) : undefined,
      y: typeof t?.y === 'number' ? Math.max(0, Math.min(1, t.y)) : undefined,
    }))
    .filter(t => t.username)
    .slice(0, USER_TAGS_MAX);
}

function mediaItem(m: any): IgMediaItem | null {
  if (!m || !DRIVE_ID.test(String(m.fileId || ''))) return null;
  const kind = m.kind === 'video' ? 'video' : 'image';
  return {
    fileId: String(m.fileId),
    kind,
    mimeType: str(m.mimeType, 80) || (kind === 'video' ? 'video/mp4' : 'image/jpeg'),
    name: str(m.name, 150),
    width: Math.round(Number(m.width) || 0),
    height: Math.round(Number(m.height) || 0),
    duration: kind === 'video' ? Math.round((Number(m.duration) || 0) * 10) / 10 : undefined,
    size: Number(m.size) || undefined,
    thumbFileId: DRIVE_ID.test(String(m.thumbFileId || '')) ? String(m.thumbFileId) : undefined,
    altText: str(m.altText, 1000) || undefined,
    userTags: tags(m.userTags),
    sourceFileId: DRIVE_ID.test(String(m.sourceFileId || '')) ? String(m.sourceFileId) : undefined,
  };
}

/** Limpia lo que llega del navegador y explica el primer problema que impide publicar */
export function sanitizeInput(body: any): { input?: IgPostInput; error?: string } {
  const format = FORMATS.includes(body?.format) ? (body.format as IgFormat) : null;
  if (!format) return { error: 'Elige un formato.' };

  const media = (Array.isArray(body.media) ? body.media : []).map(mediaItem).filter(Boolean) as IgMediaItem[];
  if (media.length === 0) return { error: 'Añade al menos un archivo.' };
  if (format === 'CAROUSEL') {
    if (media.length < CAROUSEL_MIN) return { error: `Un carrusel necesita al menos ${CAROUSEL_MIN} archivos.` };
    if (media.length > CAROUSEL_MAX) return { error: `Un carrusel admite hasta ${CAROUSEL_MAX} archivos.` };
  }
  const used = format === 'CAROUSEL' ? media : media.slice(0, 1);
  for (const m of used) {
    const problem = mediaProblem(m, format);
    if (problem) return { error: problem };
  }

  const caption = format === 'STORY' ? '' : str(body.caption, CAPTION_MAX + 10);
  if (caption.length > CAPTION_MAX) return { error: `El texto pasa de ${CAPTION_MAX} caracteres.` };
  if (countHashtags(caption) > HASHTAGS_MAX) return { error: `Instagram admite hasta ${HASHTAGS_MAX} hashtags.` };
  if (countMentions(caption) > MENTIONS_MAX) return { error: `Instagram admite hasta ${MENTIONS_MAX} menciones.` };

  let scheduledFor: string | null = null;
  if (body.scheduledFor) {
    const d = new Date(body.scheduledFor);
    if (isNaN(d.getTime())) return { error: 'La fecha programada no es válida.' };
    scheduledFor = d.toISOString();
  }

  let deleteAt: string | undefined;
  if (body.deleteAt) {
    const d = new Date(body.deleteAt);
    if (isNaN(d.getTime())) return { error: 'La fecha de borrado no es válida.' };
    const from = scheduledFor ? new Date(scheduledFor).getTime() : Date.now();
    if (d.getTime() <= from + 5 * 60 * 1000) return { error: 'El borrado tiene que ser al menos 5 minutos después de publicarse.' };
    deleteAt = d.toISOString();
  }

  const reelIn = body.reel || {};
  const links = body.links || {};
  return {
    input: {
      format,
      media: used,
      caption,
      firstComment: format === 'STORY' ? undefined : str(body.firstComment, CAPTION_MAX) || undefined,
      collaborators: format === 'STORY' ? [] : users(body.collaborators, COLLABORATORS_MAX),
      storyMentions: format === 'STORY' ? users(body.storyMentions, USER_TAGS_MAX) : undefined,
      reel: format === 'REEL'
        ? {
            shareToFeed: reelIn.shareToFeed !== false,
            audioName: str(reelIn.audioName, 80) || undefined,
            coverFileId: DRIVE_ID.test(String(reelIn.coverFileId || '')) ? String(reelIn.coverFileId) : undefined,
            thumbOffsetMs: Number(reelIn.thumbOffsetMs) > 0 ? Math.round(Number(reelIn.thumbOffsetMs)) : undefined,
            trial: reelIn.trial === true,
          }
        : undefined,
      links: {
        artistId: DRIVE_ID.test(String(links.artistId || '')) ? String(links.artistId) : undefined,
        artistName: str(links.artistName, 120) || undefined,
        files: Array.isArray(links.files)
          ? links.files
              .filter((f: any) => DRIVE_ID.test(String(f?.id || '')))
              .slice(0, 10)
              .map((f: any) => ({ id: String(f.id), name: str(f.name, 150) }))
          : undefined,
      },
      title: str(body.title, 120) || undefined,
      deleteAt,
      scheduledFor,
    },
  };
}
