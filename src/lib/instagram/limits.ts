// Límites de la API de publicación de Instagram. Código compartido navegador/servidor.
import type { IgFormat, IgMediaItem } from '@/types/instagram';

export const CAPTION_MAX = 2200;
export const HASHTAGS_MAX = 30;
export const MENTIONS_MAX = 20;
export const COLLABORATORS_MAX = 3;
export const USER_TAGS_MAX = 20;
export const CAROUSEL_MIN = 2;
export const CAROUSEL_MAX = 10;

export const VIDEO_MIN_SECONDS = 3;
export const STORY_VIDEO_MAX_SECONDS = 60;
export const CAROUSEL_VIDEO_MAX_SECONDS = 60;
export const REEL_MAX_SECONDS = 15 * 60;
export const STORY_VIDEO_MAX_BYTES = 100 * 1024 * 1024;
export const REEL_MAX_BYTES = 300 * 1024 * 1024;
export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
/** Lado mayor admitido en vídeo */
export const VIDEO_MAX_SIDE = 1920;

/** Proporciones admitidas en el feed (ancho / alto) */
export const FEED_MIN_RATIO = 4 / 5;
export const FEED_MAX_RATIO = 1.91;

export const FORMAT_LABEL: Record<IgFormat, string> = {
  STORY: 'Historia',
  POST: 'Post',
  REEL: 'Reel',
  CAROUSEL: 'Carrusel',
};

export function countHashtags(text: string): number {
  return (text.match(/(^|\s)#[\p{L}\p{N}_]+/gu) || []).length;
}

export function countMentions(text: string): number {
  return (text.match(/(^|[\s(])@[\w.]+/g) || []).length;
}

export function cleanUsername(u: string): string {
  return String(u || '').trim().replace(/^@+/, '').replace(/[^\w.]/g, '').slice(0, 30).toLowerCase();
}

export function formatSeconds(s?: number): string {
  const n = Math.round(Number(s) || 0);
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}

/** Por qué este medio no se puede publicar en ese formato ('' = sí se puede) */
export function mediaProblem(item: Pick<IgMediaItem, 'kind' | 'duration' | 'size' | 'width' | 'height'>, format: IgFormat): string {
  if (item.kind === 'image') {
    if (format === 'REEL') return 'Un Reel necesita un vídeo. Con una imagen puedes crear un Reel con tu música.';
    if ((item.size || 0) > IMAGE_MAX_BYTES) return 'La imagen pesa más de 8 MB.';
    return '';
  }
  const dur = Number(item.duration) || 0;
  const size = Number(item.size) || 0;
  if (format === 'POST') return 'Los vídeos en el feed se publican como Reel.';
  if (dur && dur < VIDEO_MIN_SECONDS) return `Instagram pide vídeos de al menos ${VIDEO_MIN_SECONDS} segundos.`;
  if (Math.max(item.width || 0, item.height || 0) > VIDEO_MAX_SIDE) return `El vídeo mide más de ${VIDEO_MAX_SIDE} px: hay que optimizarlo.`;
  if (format === 'STORY') {
    if (dur > STORY_VIDEO_MAX_SECONDS + 0.5) return `Dura ${formatSeconds(dur)} y las historias admiten hasta 60 s.`;
    if (size > STORY_VIDEO_MAX_BYTES) return 'Las historias admiten vídeos de hasta 100 MB.';
  }
  if (format === 'CAROUSEL' && dur > CAROUSEL_VIDEO_MAX_SECONDS + 0.5) return 'En un carrusel cada vídeo puede durar hasta 60 s.';
  if (format === 'REEL') {
    if (dur > REEL_MAX_SECONDS) return 'Los Reels admiten hasta 15 minutos.';
    if (size > REEL_MAX_BYTES) return 'Los Reels admiten vídeos de hasta 300 MB.';
  }
  return '';
}
