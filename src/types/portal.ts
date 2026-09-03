export interface PortalModule {
  id: string;
  type: 'projects' | 'finances' | 'bounces' | 'tasks' | 'releases' | 'custom_text' | 'custom_link';
  title?: string;
  isVisible: boolean;
  order: number;
  config?: any;
}

export type PortalToolId = 'downloader' | 'converter' | 'trimmer' | 'tags' | 'detector' | 'stems';

export interface PortalToolMeta {
  id: PortalToolId;
  name: string;
  shortName: string;
  description: string;
  iconName: string;
  color: string;
  bg: string;
  badge?: string;
}

export const PORTAL_TOOLS: PortalToolMeta[] = [
  {
    id: 'downloader',
    name: 'Descargador MP3',
    shortName: 'Descargador',
    description: 'Descarga audios de YouTube, Spotify y SoundCloud.',
    iconName: 'Download',
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
  },
  {
    id: 'converter',
    name: 'Conversor de Audio',
    shortName: 'Conversor',
    description: 'Convierte archivos a MP3, WAV, FLAC, OGG y M4A.',
    iconName: 'RefreshCw',
    color: 'text-purple-500',
    bg: 'bg-purple-500/10',
  },
  {
    id: 'trimmer',
    name: 'Recortador de Audio',
    shortName: 'Recortador',
    description: 'Corta fragmentos de canciones con precisión.',
    iconName: 'Scissors',
    color: 'text-pink-500',
    bg: 'bg-pink-500/10',
  },
  {
    id: 'tags',
    name: 'Editor de Metadatos',
    shortName: 'Metadatos',
    description: 'Añade carátulas, títulos y artistas a tus MP3.',
    iconName: 'Tags',
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
  },
  {
    id: 'detector',
    name: 'Detector BPM & Key',
    shortName: 'BPM & Key',
    description: 'Analiza el tempo y tonalidad de cualquier audio.',
    iconName: 'Activity',
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
  },
  {
    id: 'stems',
    name: 'Separador de Stems',
    shortName: 'Stems',
    description: 'Aísla la voz y los instrumentos con IA (Demucs v4).',
    iconName: 'Layers',
    color: 'text-indigo-500',
    bg: 'bg-indigo-500/10',
    badge: 'IA',
  },
];

export interface PortalConfig {
  artistId: string;
  token: string;
  producerName: string;
  producerLogo?: string;
  showFeedback: boolean;
  createdAt: string;
  theme?: 'dark' | 'light' | 'custom';
  accentColor?: string;
  enableTools?: boolean;
  allowedTools?: PortalToolId[];
  modules?: PortalModule[];
}

export interface FeedbackComment {
  id: string;
  songId: string;
  songTitle: string;
  comment: string;
  createdAt: string;
  artistName?: string;
}

export interface PortalData {
  artist: {
    name: string;
    photo?: string;
  };
  projects: PortalProject[];
  producerName: string;
  producerLogo?: string;
}

export interface PortalProject {
  id: string;
  title: string;
  type: string;
  coverArt?: string;
  songs: PortalSong[];
  status: string;
}

export interface PortalSong {
  id: string;
  trackNumber: number;
  title: string;
  duration?: string;
  status: string;
  playableFileUrl?: string;
  downloadableFileUrl?: string;
  feedback?: FeedbackComment[];
}
