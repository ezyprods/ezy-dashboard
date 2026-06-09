import { ServiceType } from './artist';

export type ProjectType = 'single' | 'ep' | 'album' | 'free';
export type ProjectStatus = 'active' | 'completed' | 'archived';
export type ServiceStatus = 'not_started' | 'in_progress' | 'pending_review' | 'approved' | 'delivered';

export interface SongService {
  type: ServiceType | string;
  status: ServiceStatus;
  label?: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface Task {
  id: string;
  title: string;
  status: 'pending' | 'completed';
}

export interface LinkedFile {
  driveFileId: string;
  name: string;
  version?: string;
}

export interface SongVersion {
  version: string;
  date: string;
  fileId?: string;
  notes?: string;
}

export interface WorkSession {
  id: string;
  date: string;
  duration: string;
  description: string;
}

export interface Song {
  id: string;
  trackNumber: number;
  title: string;
  duration?: string;
  services: SongService[];
  checklist: ChecklistItem[];
  notes?: string;
  linkedFiles: LinkedFile[];
  versions: SongVersion[];
  workSessions: WorkSession[];
}

export interface Project {
  id: string;
  artistId: string;
  title: string;
  type: ProjectType;
  coverArt?: string;
  coverArtUrl?: string;
  releaseDate?: string;
  deliveryDate?: string;
  songs: Song[];
  notes?: string;
  status: ProjectStatus;
  templateId?: string;
  createdAt: string;
  updatedAt: string;
  driveFolderId: string;
}

export interface CreateProjectInput {
  artistId: string;
  title: string;
  type: ProjectType;
  releaseDate?: string;
  deliveryDate?: string;
  templateId?: string;
}
