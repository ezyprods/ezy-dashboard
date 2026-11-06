// Publicaciones de Instagram (@ezyprods): tipos compartidos entre el navegador y el servidor.

export type IgFormat = 'STORY' | 'POST' | 'REEL' | 'CAROUSEL';

export type IgStatus =
  | 'PENDING'     // programada, esperando su hora
  | 'PROCESSING'  // enviándose a Instagram (puede durar varias pasadas si es un vídeo)
  | 'PUBLISHED'
  | 'FAILED'
  | 'CANCELLED';

export interface IgUserTag {
  username: string;
  /** Posición en la imagen, de 0 a 1. En vídeos se ignora. */
  x?: number;
  y?: number;
}

export interface IgMediaItem {
  /** Archivo en Drive que se publica (JPEG para imágenes, MP4/MOV para vídeos) */
  fileId: string;
  kind: 'image' | 'video';
  mimeType: string;
  name: string;
  width: number;
  height: number;
  /** Segundos (solo vídeo) */
  duration?: number;
  size?: number;
  /** Miniatura JPEG en Drive para pintar la tarjeta (en imágenes es el propio archivo) */
  thumbFileId?: string;
  altText?: string;
  userTags?: IgUserTag[];
  /** Archivo original del que salió (p. ej. el WAV o el vídeo de un proyecto) */
  sourceFileId?: string;
}

export interface IgReelOptions {
  shareToFeed: boolean;
  audioName?: string;
  /** Portada propia (JPEG en Drive) */
  coverFileId?: string;
  /** Fotograma de portada, en milisegundos desde el inicio */
  thumbOffsetMs?: number;
  /** Reel de prueba: se enseña primero a quien no te sigue */
  trial?: boolean;
}

export interface IgPostLinks {
  artistId?: string;
  artistName?: string;
  /** Archivos de Drive relacionados (la pista, el proyecto…) */
  files?: { id: string; name: string }[];
}

export interface IgPost {
  id: string;
  createdAt: string;
  updatedAt: string;
  format: IgFormat;
  status: IgStatus;
  /** ISO. Para "publicar ahora" es la hora en que se pidió. */
  scheduledFor: string;
  media: IgMediaItem[];
  caption: string;
  firstComment?: string;
  collaborators: string[];
  /** Menciones de la historia (sin posición) */
  storyMentions?: string[];
  reel?: IgReelOptions;
  links: IgPostLinks;
  /** Etiqueta libre para reconocerla en la agenda */
  title?: string;
  /** ISO: cuándo se borra de Instagram (opcional) */
  deleteAt?: string;

  // ── Estado de la publicación (lo escribe el servidor) ──
  attempts: number;
  error?: string;
  claim?: string;
  processingStartedAt?: string;
  containers?: {
    children?: string[];
    parent?: string;
    createdAt: string;
  };
  igMediaId?: string;
  permalink?: string;
  publishedAt?: string;
  firstCommentDone?: boolean;
  /** Borrada de Instagram (por el borrado programado o a mano desde aquí) */
  deletedAt?: string;
  deleteAttempts?: number;
  /** Motivo por el que no se pudo borrar; tras varios intentos se deja de reintentar */
  deleteError?: string;
  deleteGaveUp?: boolean;
}

/** Lo que el navegador envía al crear o editar */
export type IgPostInput = Pick<
  IgPost,
  'format' | 'media' | 'caption' | 'firstComment' | 'collaborators' | 'storyMentions' | 'reel' | 'links' | 'title' | 'deleteAt'
> & {
  /** null o ausente = publicar ahora */
  scheduledFor?: string | null;
};

/** Publicación tal como la recibe la página (con URLs de miniatura ya resueltas) */
export interface IgPostView extends IgPost {
  thumbUrl?: string;
}

export interface IgAccountInfo {
  connected: boolean;
  igUserId?: string;
  username?: string;
  name?: string;
  profilePictureUrl?: string;
  connectedAt?: string;
  /** Publicaciones usadas en las últimas 24 h (máximo 100 por la API) */
  quotaUsage?: number;
  quotaTotal?: number;
  error?: string;
  /** Faltan variables de entorno de Meta */
  missingConfig?: boolean;
}

export interface IgSettings {
  hashtagSets: { id: string; name: string; tags: string }[];
  captionTemplates: { id: string; name: string; text: string }[];
}

export interface IgBootstrap {
  account: IgAccountInfo;
  mediaFolderId: string;
  settings: IgSettings;
}
