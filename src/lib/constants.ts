// Application constants
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'EZY Studio';
export const PRODUCER_NAME = process.env.NEXT_PUBLIC_PRODUCER_NAME || 'EZY';

// Google Drive
export const DRIVE_ROOT_FOLDER_ID = process.env.DRIVE_ROOT_FOLDER_ID || '';

// Drive folder structure template for new artists
export const ARTIST_FOLDER_STRUCTURE: string[] = [];

// Drive folder structure template for new projects
export const PROJECT_FOLDER_STRUCTURE: string[] = [];

export const FOLDER_NAME_MAP: Record<string, string> = {
  Sessions: '01_Sesiones_y_DAW',
  Bounces: 'Bounces',
  Mix: '03_Revisiones_y_Mezclas',
  Master: '04_Masters_Finales',
  References: '05_Referencias_y_Otros',
  Other: '05_Referencias_y_Otros',
};

// Service types with Spanish labels
export const SERVICE_LABELS: Record<string, string> = {
  production: 'Producción',
  mix: 'Mezcla',
  master: 'Master',
  songwriting: 'Composición',
  other: 'Otro',
};

// Service status with Spanish labels and colors
export const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  not_started: { label: 'Sin empezar', color: '#8888a0', bgColor: 'rgba(136, 136, 160, 0.15)' },
  in_progress: { label: 'En progreso', color: '#6c5ce7', bgColor: 'rgba(108, 92, 231, 0.15)' },
  pending_review: { label: 'Pendiente revisión', color: '#fdcb6e', bgColor: 'rgba(253, 203, 110, 0.15)' },
  approved: { label: 'Aprobado', color: '#00b894', bgColor: 'rgba(0, 184, 148, 0.15)' },
  delivered: { label: 'Entregado', color: '#00cec9', bgColor: 'rgba(0, 206, 201, 0.15)' },
};

// Project type labels in Spanish
export const PROJECT_TYPE_LABELS: Record<string, string> = {
  single: 'Single',
  ep: 'EP',
  album: 'Álbum',
  free: 'Proyecto libre',
};

// Payment method labels in Spanish
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  bizum: 'Bizum',
  other: 'Otro',
};

// Payment status labels in Spanish
export const PAYMENT_STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  pending: { label: 'Pendiente', color: '#e17055', bgColor: 'rgba(225, 112, 85, 0.15)' },
  partial: { label: 'Parcial', color: '#fdcb6e', bgColor: 'rgba(253, 203, 110, 0.15)' },
  paid: { label: 'Pagado', color: '#00b894', bgColor: 'rgba(0, 184, 148, 0.15)' },
};

// File type mappings
export const AUDIO_MIME_TYPES = [
  'audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp3',
  'audio/aac', 'audio/flac', 'audio/x-flac', 'audio/ogg',
  'audio/mp4', 'audio/x-m4a',
];

export const IMAGE_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
];

export const PDF_MIME_TYPES = ['application/pdf'];

export const VIDEO_MIME_TYPES = [
  'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm',
];

// Personal Projects
export const PERSONAL_PROJECTS_ROOT_FOLDER_NAME = '00_PROYECTOS_PERSONALES';

export function isSystemOrSpecialFolder(name: string | null | undefined): boolean {
  if (!name) return true;
  const trimmed = name.trim();
  return (
    trimmed.startsWith('00_') ||
    trimmed.startsWith('.') ||
    trimmed.toLowerCase() === PERSONAL_PROJECTS_ROOT_FOLDER_NAME.toLowerCase() ||
    trimmed.toLowerCase() === '00_proyectos personales'
  );
}

export const PERSONAL_PROJECT_CATEGORIES: Record<
  'beat' | 'grabacion' | 'loop_pack' | 'colaboracion' | 'mashup',
  { label: string; shortLabel: string; folderName: string; color: string; bgColor: string; iconName: string }
> = {
  beat: {
    label: 'Beats / Instrumentales',
    shortLabel: 'Beat',
    folderName: 'Beats',
    color: '#6c5ce7',
    bgColor: 'rgba(108, 92, 231, 0.15)',
    iconName: 'Music',
  },
  grabacion: {
    label: 'Grabaciones / Covers',
    shortLabel: 'Grabación',
    folderName: 'Grabaciones',
    color: '#00cec9',
    bgColor: 'rgba(0, 206, 201, 0.15)',
    iconName: 'Mic',
  },
  loop_pack: {
    label: 'Sound Kits / Loop Packs',
    shortLabel: 'Sound Kit',
    folderName: 'Loop Packs',
    color: '#fdcb6e',
    bgColor: 'rgba(253, 203, 110, 0.15)',
    iconName: 'Layers',
  },
  colaboracion: {
    label: 'Colaboraciones entre Productores',
    shortLabel: 'Colab',
    folderName: 'Colaboraciones',
    color: '#e84393',
    bgColor: 'rgba(232, 67, 147, 0.15)',
    iconName: 'Users2',
  },
  mashup: {
    label: 'Mashups / Remezclas',
    shortLabel: 'Mashup',
    folderName: 'Mashups',
    color: '#0984e3',
    bgColor: 'rgba(9, 132, 227, 0.15)',
    iconName: 'Disc3',
  },
};

export const PERSONAL_PROJECT_STATUS_CONFIG: Record<
  'idea' | 'en_progreso' | 'terminado' | 'en_pausa' | 'incluido_en_pack' | 'cedido_a_artista' | 'descartado',
  { label: string; icon: string; color: string; bgColor: string }
> = {
  idea: { label: 'Idea / Boceto', icon: '💡', color: '#a29bfe', bgColor: 'rgba(162, 155, 254, 0.15)' },
  en_progreso: { label: 'En Progreso', icon: '⚡', color: '#6c5ce7', bgColor: 'rgba(108, 92, 231, 0.15)' },
  terminado: { label: 'Terminado / Maquetado', icon: '🎧', color: '#00b894', bgColor: 'rgba(0, 184, 148, 0.15)' },
  en_pausa: { label: 'En Pausa', icon: '⏸️', color: '#fdcb6e', bgColor: 'rgba(253, 203, 110, 0.15)' },
  incluido_en_pack: { label: 'Incluido en Pack / Álbum', icon: '📦', color: '#e17055', bgColor: 'rgba(225, 112, 85, 0.15)' },
  cedido_a_artista: { label: 'Cedido a Artista', icon: '🤝', color: '#0984e3', bgColor: 'rgba(9, 132, 227, 0.15)' },
  descartado: { label: 'Descartado', icon: '🗑️', color: '#636e72', bgColor: 'rgba(99, 110, 114, 0.15)' },
};

export const PERSONAL_PROJECT_SUBFOLDERS = [
  '01_Bounces_y_Demos',
  '02_Stems_y_Pistas',
  '03_Backup_y_Sesiones',
];

// Navigation items
export const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: 'LayoutDashboard' },
  { href: '/artists', label: 'Artistas', icon: 'Users' },
  { href: '/personal-projects', label: 'Proyectos Personales', icon: 'Music' },
  { href: '/payments', label: 'Pagos', icon: 'CreditCard' },
  { href: '/communications', label: 'Comunicaciones', icon: 'MessageSquare' },
  { href: '/settings', label: 'Configuración', icon: 'Settings' },
] as const;
