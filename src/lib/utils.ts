import { type ClassValue, clsx } from 'clsx';
import { AUDIO_MIME_TYPES, IMAGE_MIME_TYPES, PDF_MIME_TYPES, VIDEO_MIME_TYPES } from './constants';
import type { FileType } from '@/types';

// Simple class name merger (no twMerge needed with Tailwind v4)
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

// Format file size to human-readable string
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// Format date to Spanish locale
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// Format date to relative time (e.g., "hace 2 horas")
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'hace unos segundos';
  if (diffMins < 60) return `hace ${diffMins} min`;
  if (diffHours < 24) return `hace ${diffHours}h`;
  if (diffDays < 7) return `hace ${diffDays}d`;
  return formatDate(dateString);
}

// Format currency
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

// Get file type from MIME type
export function getFileType(mimeType: string): FileType {
  if (AUDIO_MIME_TYPES.includes(mimeType)) return 'audio';
  if (IMAGE_MIME_TYPES.includes(mimeType)) return 'image';
  if (PDF_MIME_TYPES.includes(mimeType)) return 'pdf';
  if (VIDEO_MIME_TYPES.includes(mimeType)) return 'video';
  return 'other';
}

// Generate a portal token
export function generatePortalToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

// Calculate project completion percentage
export function calculateProjectProgress(songs: { services: { status: string }[] }[]): number {
  if (songs.length === 0) return 0;

  const completedStatuses = ['approved', 'delivered'];
  let totalServices = 0;
  let completedServices = 0;

  for (const song of songs) {
    for (const service of song.services) {
      totalServices++;
      if (completedStatuses.includes(service.status)) {
        completedServices++;
      }
    }
  }

  if (totalServices === 0) return 0;
  return Math.round((completedServices / totalServices) * 100);
}

// Calculate payment status
export function calculatePaymentStatus(totalAgreed: number, totalReceived: number): 'pending' | 'partial' | 'paid' {
  if (totalReceived >= totalAgreed) return 'paid';
  if (totalReceived > 0) return 'partial';
  return 'pending';
}

// Truncate text
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

// Slugify text for URLs
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// --- Icon helpers (return icon name strings for lucide-react) ---

export function getFileIconName(mimeType: string): string {
  if (!mimeType) return 'File';
  if (mimeType.startsWith('audio/')) return 'FileAudio';
  if (mimeType.startsWith('image/')) return 'FileImage';
  if (mimeType.startsWith('video/')) return 'Film';
  if (mimeType === 'application/pdf') return 'FileText';
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('7z')) return 'FileArchive';
  if (mimeType.includes('sheet') || mimeType.includes('csv')) return 'FileSpreadsheet';
  if (mimeType.includes('document') || mimeType.includes('word')) return 'FileText';
  return 'File';
}

export function getProjectTypeIcon(type: string): string {
  switch (type) {
    case 'single': return 'Disc';
    case 'ep': return 'Disc3';
    case 'album': return 'Library';
    case 'free': return 'Sparkles';
    default: return 'FolderOpen';
  }
}

export function getPaymentMethodIcon(method: string): string {
  switch (method) {
    case 'cash': return 'Banknote';
    case 'transfer': return 'ArrowRightLeft';
    case 'bizum': return 'Smartphone';
    default: return 'CreditCard';
  }
}
