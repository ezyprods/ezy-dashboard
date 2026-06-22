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

// Navigation items
export const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: 'LayoutDashboard' },
  { href: '/artists', label: 'Artistas', icon: 'Users' },
  { href: '/payments', label: 'Pagos', icon: 'CreditCard' },
  { href: '/communications', label: 'Comunicaciones', icon: 'MessageSquare' },
  { href: '/settings', label: 'Configuración', icon: 'Settings' },
] as const;
