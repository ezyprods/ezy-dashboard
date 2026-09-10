// ─── Instagram Studio Types ───────────────────────────────────────────────────

export interface InstagramSlot {
  /** Hora de publicación "HH:mm" */
  time: string;
  /** Si está activado el autoeliminar */
  autoDelete: boolean;
  /** Horas de offset para autoeliminar (default 24) */
  autoDeleteOffsetHours: number;
}

export interface InstagramPack {
  id: string;
  /** Fecha "YYYY-MM-DD" */
  date: string;
  artistId?: string;
  artistName?: string;
  story?: InstagramSlot;
  feed?: InstagramSlot;
  reel?: InstagramSlot;
  notes?: string;
  createdAt: string;
}

export type InstagramContentType = 'story' | 'feed' | 'reel';

export const CONTENT_TYPE_LABELS: Record<InstagramContentType, string> = {
  story: 'Historia',
  feed: 'Feed Post',
  reel: 'Reel',
};

export const CONTENT_TYPE_EMOJIS: Record<InstagramContentType, string> = {
  story: '📸',
  feed: '🖼️',
  reel: '🎬',
};
