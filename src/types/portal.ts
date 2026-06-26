export interface PortalModule {
  id: string;
  type: 'projects' | 'finances' | 'bounces' | 'tasks' | 'releases' | 'custom_text' | 'custom_link';
  title?: string;
  isVisible: boolean;
  order: number;
  config?: any;
}

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
