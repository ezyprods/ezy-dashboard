import { type ClassValue, clsx } from 'clsx';
import { AUDIO_MIME_TYPES, IMAGE_MIME_TYPES, PDF_MIME_TYPES, VIDEO_MIME_TYPES } from './constants';
import type { FileType } from '@/types';

// Simple class name merger (no twMerge needed with Tailwind v4)
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function isBrowserCompatible(mimeType?: string): boolean {
  if (!mimeType) return false;
  return (
    mimeType.startsWith('image/') ||
    mimeType.startsWith('video/') ||
    mimeType.startsWith('audio/') ||
    mimeType === 'application/pdf' ||
    mimeType === 'text/plain'
  );
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

// Calculate string similarity (0 to 1) using normalized Levenshtein distance
export function stringSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;
  
  const m = s1.length;
  const n = s2.length;
  const d: number[][] = [];
  
  for (let i = 0; i <= m; i++) {
    d[i] = [i];
  }
  for (let j = 0; j <= n; j++) {
    d[0][j] = j;
  }
  
  for (let j = 1; j <= n; j++) {
    for (let i = 1; i <= m; i++) {
      if (s1[i - 1] === s2[j - 1]) {
        d[i][j] = d[i - 1][j - 1];
      } else {
        d[i][j] = Math.min(
          d[i - 1][j] + 1,
          d[i][j - 1] + 1,
          d[i - 1][j - 1] + 1
        );
      }
    }
  }
  
  const distance = d[m][n];
  const maxLen = Math.max(m, n);
  return (maxLen - distance) / maxLen;
}

// Find the best match from an array of objects
export function findBestMatch<T>(
  query: string, 
  items: T[], 
  getString: (item: T) => string, 
  threshold = 0.6
): T | null {
  const cleanQuery = query.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
  if (!cleanQuery) return null;

  const queryWords = cleanQuery.split(/\s+/).filter(w => w.length > 2);
  if (queryWords.length === 0 && cleanQuery.length > 0) {
    queryWords.push(cleanQuery);
  }
  
  let bestScore = 0;
  let bestItem: T | null = null;
  
  for (const item of items) {
    const itemName = getString(item);
    const itemClean = itemName.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
    
    if (query.toLowerCase().includes(itemClean) || itemClean.includes(cleanQuery)) {
      return item;
    }
    
    const itemWords = itemClean.split(/\s+/);
    let totalScore = 0;
    
    for (const qw of queryWords) {
      let maxWordScore = 0;
      for (const iw of itemWords) {
        if (iw.includes(qw) || qw.includes(iw)) {
          maxWordScore = 1;
        } else {
          maxWordScore = Math.max(maxWordScore, stringSimilarity(qw, iw));
        }
      }
      totalScore += maxWordScore;
    }
    
    const avgScore = totalScore / queryWords.length;
    
    if (avgScore > bestScore && avgScore >= threshold) {
      bestScore = avgScore;
      bestItem = item;
    }
  }
  
  return bestItem;
}

// Normalize filename for fuzzy matching (removes extensions, common suffixes, etc.)
export function getNormalizedBaseName(filename: string): string {
  if (!filename) return '';
  
  // Remove extension
  const extMatch = filename.match(/\.[^.]+$/);
  let base = extMatch ? filename.slice(0, -extMatch[0].length) : filename;
  
  // Convert to lowercase and remove diacritics
  base = base.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  // Remove common suffixes like v1, v2, master, bounce, mix, 24bits, 48khz, final
  // Also remove dates or things in parentheses
  base = base.replace(/\b(v\d+|master|bounce|mix|final|24bits|48khz|24b|16b|44\.1khz)\b/g, '');
  base = base.replace(/\(.*?\)/g, ''); // Remove anything in parentheses
  base = base.replace(/\[.*?\]/g, ''); // Remove anything in brackets
  
  // Remove non-alphanumeric characters and collapse spaces
  base = base.replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  
  return base;
}

// Format a phone number elegantly and ensure it has country code
export function formatPhoneNumber(phone: string): string {
  if (!phone) return '';
  // Elimina cualquier carácter que no sea dígito o el signo +
  let cleaned = phone.replace(/[^\d+]/g, '');
  
  // Si empieza con 00 (código internacional europeo), lo cambiamos a +
  if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.substring(2);
  }
  
  // Si no empieza por +, asumimos España (+34)
  if (!cleaned.startsWith('+')) {
    // Solo números (123456789) -> asumimos España
    if (cleaned.length === 9) {
      cleaned = '+34' + cleaned;
    } 
    // Empezó escribiendo 34 sin el más (34612345678)
    else if (cleaned.startsWith('34') && cleaned.length === 11) {
      cleaned = '+' + cleaned;
    }
  }
  
  // Si es formato español (+34 seguido de 9 dígitos), le damos el formato bonito
  if (cleaned.startsWith('+34') && cleaned.length === 12) {
    const p1 = cleaned.substring(0, 3); // +34
    const p2 = cleaned.substring(3, 6); // 6XX
    const p3 = cleaned.substring(6, 8); // XX
    const p4 = cleaned.substring(8, 10); // XX
    const p5 = cleaned.substring(10, 12); // XX
    return `${p1} ${p2} ${p3} ${p4} ${p5}`;
  }
  
  return cleaned;
}

// Generate the proper wa.me link ensuring correct format
export function getWhatsAppUrl(phone: string, text: string): string {
  const formatted = formatPhoneNumber(phone);
  const numericOnly = formatted.replace(/[^\d]/g, '');
  const encodedText = encodeURIComponent(text);
  return `https://wa.me/${numericOnly}?text=${encodedText}`;
}
