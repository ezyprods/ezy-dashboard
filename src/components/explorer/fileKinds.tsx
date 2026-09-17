import {
  Folder, FileAudio, FileImage, Film, FileText, FileSpreadsheet, Presentation,
  FileArchive, File as FileIcon, FileCode2, AudioWaveform,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { FOLDER_MIME, type DriveItem, type FileKind, type TypeFilter, type SortField, type SortDir } from './types';

const AUDIO_EXT = ['wav', 'mp3', 'aif', 'aiff', 'flac', 'm4a', 'aac', 'ogg', 'opus', 'wma'];
const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'svg', 'bmp', 'tif', 'tiff'];
const VIDEO_EXT = ['mp4', 'mov', 'm4v', 'webm', 'avi', 'mkv'];
const PROJECT_EXT = ['flp', 'als', 'alp', 'logicx', 'ptx', 'pts', 'cpr', 'rpp', 'song', 'aup3', 'bwproject', 'reason', 'mid', 'midi', 'fxp', 'nki'];
const ARCHIVE_EXT = ['zip', 'rar', '7z', 'tar', 'gz'];
const TEXT_EXT = ['txt', 'md', 'rtf', 'csv', 'json', 'lrc'];

export function getExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function stripExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

export function getKind(mimeType: string, name: string): FileKind {
  const mime = mimeType || '';
  const ext = getExtension(name || '');
  if (mime === FOLDER_MIME) return 'folder';
  if (PROJECT_EXT.includes(ext)) return 'project';
  if (mime.startsWith('audio/') || AUDIO_EXT.includes(ext)) return 'audio';
  if (mime.startsWith('image/') || IMAGE_EXT.includes(ext)) return 'image';
  if (mime.startsWith('video/') || VIDEO_EXT.includes(ext)) return 'video';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mime.includes('spreadsheet') || mime.includes('excel') || ['xls', 'xlsx', 'numbers'].includes(ext)) return 'sheet';
  if (mime.includes('presentation') || mime.includes('powerpoint') || ['ppt', 'pptx', 'key'].includes(ext)) return 'slides';
  if (mime.includes('document') || mime.includes('word') || ['doc', 'docx', 'pages', 'odt'].includes(ext)) return 'doc';
  if (mime.includes('zip') || mime.includes('compressed') || ARCHIVE_EXT.includes(ext)) return 'archive';
  if (mime.startsWith('text/') || TEXT_EXT.includes(ext)) return 'text';
  return 'other';
}

/** Converts a raw item from the /api/files endpoints into the explorer's shape. */
export function normalizeItem(raw: any, fallbackParentId: string | null): DriveItem {
  const name = raw.name || 'Sin título';
  const mimeType = raw.mimeType || 'application/octet-stream';
  const kind = getKind(mimeType, name);
  const expiresRaw = raw.expiresAt ?? raw.appProperties?.expiresAt;
  const expiresAt = expiresRaw ? Number(expiresRaw) : null;
  const sizeNum = raw.size !== undefined && raw.size !== null ? Number(raw.size) : null;
  return {
    id: raw.id,
    name,
    mimeType,
    kind,
    isFolder: kind === 'folder',
    parentId: raw.parentFolderId || fallbackParentId,
    size: sizeNum !== null && !isNaN(sizeNum) ? sizeNum : null,
    createdTime: raw.createdTime,
    modifiedTime: raw.modifiedTime || raw.createdTime,
    webViewLink: raw.webViewLink,
    webContentLink: raw.webContentLink,
    thumbnailLink: raw.thumbnailLink,
    starred: !!raw.starred,
    shared: !!raw.shared,
    // Drive reports its default grey for every folder that was never colored
    folderColor: raw.folderColorRgb && raw.folderColorRgb.toLowerCase() !== '#8f8f8f' ? raw.folderColorRgb : undefined,
    extension: raw.fileExtension || getExtension(name),
    expiresAt: expiresAt && !isNaN(expiresAt) ? expiresAt : null,
    bpm: raw.bpm ?? raw.appProperties?.bpm ?? null,
    musicalKey: raw.key ?? raw.appProperties?.key ?? null,
    durationMs: raw.videoMediaMetadata?.durationMillis ? Number(raw.videoMediaMetadata.durationMillis) : null,
    width: raw.imageMediaMetadata?.width ?? raw.videoMediaMetadata?.width ?? null,
    height: raw.imageMediaMetadata?.height ?? raw.videoMediaMetadata?.height ?? null,
    lastModifiedBy: raw.lastModifyingUser?.displayName,
    trashedTime: raw.trashedTime,
  };
}

/** Hidden config files the dashboard stores next to the user's files. */
export function isHiddenItem(raw: any): boolean {
  const name: string = raw?.name || '';
  return name.endsWith('.json') || raw?.mimeType === 'application/json' || name.startsWith('.');
}

export const KIND_LABEL: Record<FileKind, string> = {
  folder: 'Carpeta',
  audio: 'Audio',
  image: 'Imagen',
  video: 'Vídeo',
  pdf: 'PDF',
  doc: 'Documento',
  sheet: 'Hoja de cálculo',
  slides: 'Presentación',
  project: 'Proyecto DAW',
  archive: 'Comprimido',
  text: 'Texto',
  other: 'Archivo',
};

const KIND_STYLE: Record<FileKind, { icon: any; color: string; bg: string }> = {
  folder: { icon: Folder, color: 'text-accent', bg: 'bg-accent/10' },
  audio: { icon: AudioWaveform, color: 'text-violet-400', bg: 'bg-violet-500/10' },
  image: { icon: FileImage, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  video: { icon: Film, color: 'text-rose-400', bg: 'bg-rose-500/10' },
  pdf: { icon: FileText, color: 'text-orange-400', bg: 'bg-orange-500/10' },
  doc: { icon: FileText, color: 'text-sky-400', bg: 'bg-sky-500/10' },
  sheet: { icon: FileSpreadsheet, color: 'text-green-400', bg: 'bg-green-500/10' },
  slides: { icon: Presentation, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  project: { icon: FileCode2, color: 'text-orange-400', bg: 'bg-orange-500/10' },
  archive: { icon: FileArchive, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  text: { icon: FileText, color: 'text-text-secondary', bg: 'bg-surface' },
  other: { icon: FileIcon, color: 'text-text-secondary', bg: 'bg-surface' },
};

export function kindStyle(kind: FileKind) {
  return KIND_STYLE[kind];
}

export function KindIcon({ item, className }: { item: Pick<DriveItem, 'kind' | 'folderColor' | 'extension'>; className?: string }) {
  if (item.kind === 'audio') {
    return <FileAudio className={cn('text-violet-400', className)} />;
  }
  const style = KIND_STYLE[item.kind];
  const Icon = style.icon;
  if (item.kind === 'folder' && item.folderColor) {
    return <Icon className={className} style={{ color: item.folderColor }} fill={item.folderColor} fillOpacity={0.25} />;
  }
  return <Icon className={cn(style.color, className)} fill={item.kind === 'folder' ? 'currentColor' : 'none'} fillOpacity={item.kind === 'folder' ? 0.2 : undefined} />;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || isNaN(bytes)) return '';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (!ms) return '';
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** "Hoy 14:32", "Ayer 09:10", "12 mar", "12 mar 2024" */
export function formatShortDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (d.getTime() >= startOfToday) return `Hoy ${time}`;
  if (d.getTime() >= startOfToday - 86_400_000) return `Ayer ${time}`;
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function formatLongDate(iso?: string | number): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function matchesTypeFilter(item: DriveItem, filter: TypeFilter): boolean {
  switch (filter) {
    case 'all': return true;
    case 'folder': return item.isFolder;
    case 'audio': return item.kind === 'audio';
    case 'image': return item.kind === 'image';
    case 'video': return item.kind === 'video';
    case 'document': return ['pdf', 'doc', 'sheet', 'slides', 'text'].includes(item.kind);
    case 'project': return item.kind === 'project' || item.kind === 'archive';
    case 'other': return item.kind === 'other';
  }
}

/** Accent/case-insensitive, every word must appear somewhere in the name. */
export function normalizeForSearch(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function matchesQuery(item: DriveItem, query: string): boolean {
  const words = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeForSearch(`${item.name} ${item.bpm ? `${item.bpm}bpm ${item.bpm} bpm` : ''} ${item.musicalKey || ''}`);
  return words.every(w => haystack.includes(w));
}

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });

export function sortItems(items: DriveItem[], field: SortField, dir: SortDir, foldersFirst = true): DriveItem[] {
  const factor = dir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    if (foldersFirst && a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
    let cmp = 0;
    if (field === 'modified') {
      cmp = (new Date(a.modifiedTime || 0).getTime()) - (new Date(b.modifiedTime || 0).getTime());
    } else if (field === 'size') {
      cmp = (a.size ?? -1) - (b.size ?? -1);
    } else if (field === 'type') {
      cmp = collator.compare(KIND_LABEL[a.kind], KIND_LABEL[b.kind]) || collator.compare(a.extension, b.extension);
    }
    if (cmp === 0) cmp = collator.compare(a.name, b.name);
    return cmp * factor;
  });
}

export function driveUrl(item: Pick<DriveItem, 'id' | 'isFolder' | 'webViewLink'>): string {
  if (item.isFolder) return `https://drive.google.com/drive/folders/${item.id}`;
  return item.webViewLink || `https://drive.google.com/file/d/${item.id}/view`;
}

/** Google's thumbnail links end with `=s220`; ask for a bigger rendition. */
export function sizedThumbnail(link: string | undefined, size: number): string | undefined {
  if (!link) return undefined;
  return /=s\d+(-[a-z])?$/.test(link) ? link.replace(/=s\d+(-[a-z])?$/, `=s${size}`) : link;
}

export function bpmTone(bpm: string | number | null): string {
  const n = parseInt(String(bpm ?? ''), 10);
  if (isNaN(n)) return 'text-text-secondary bg-surface border-border';
  if (n < 80) return 'text-sky-400 bg-sky-500/10 border-sky-500/20';
  if (n < 110) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
  if (n < 140) return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
  return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
}

/** Drive's own folder palette (any other value is snapped to the nearest one by Google). */
export const FOLDER_COLORS: { label: string; value: string }[] = [
  { label: 'Por defecto', value: '#8f8f8f' },
  { label: 'Rojo', value: '#f83a22' },
  { label: 'Naranja', value: '#ff7537' },
  { label: 'Amarillo', value: '#fad165' },
  { label: 'Verde', value: '#16a765' },
  { label: 'Turquesa', value: '#2da2bb' },
  { label: 'Azul', value: '#4986e7' },
  { label: 'Morado', value: '#a47ae2' },
  { label: 'Rosa', value: '#f691b2' },
];
