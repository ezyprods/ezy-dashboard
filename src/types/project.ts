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

// --- Flexible Board System ---
export type FlexTaskStatus = 'todo' | 'in_progress' | 'review' | 'done';
export type FlexTaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface FlexTask {
  id: string;
  title: string;
  status: FlexTaskStatus;
  priority?: FlexTaskPriority;
  notes?: string;
  tags?: string[];
  dueDate?: string;
  createdAt: string;
}

export interface TaskGroup {
  id: string;
  title: string;
  color?: string;
  collapsed?: boolean;
  tasks: FlexTask[];
}

export interface FlexBoardData {
  groups: TaskGroup[];
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
  budget?: number;
  songs: Song[];
  notes?: string;
  status: ProjectStatus;
  templateId?: string;
  createdAt: string;
  updatedAt: string;
  driveFolderId: string;
  
  // Pro Tools Extensions
  folderStatuses?: Record<string, string>;
  customFileOrders?: Record<string, string[]>;
  productionGrid?: ProductionGrid;
  referenceTracks?: ReferenceTrack[];
  workSessions?: WorkSession[];
}

export interface CreateProjectInput {
  artistId: string;
  title: string;
  type: ProjectType;
  releaseDate?: string;
  deliveryDate?: string;
  templateId?: string;
}

// --- Pro Tools (Advanced Modularity) ---

export interface GridCell {
  status: FlexTaskStatus;
  notes?: string;
}

export interface ProductionGrid {
  columns: { id: string; name: string }[];
  rows: { id: string; name: string; cells: Record<string, GridCell> }[];
}

export interface ReferenceTrack {
  id: string;
  title: string;
  url: string; // Spotify, YouTube, or Drive Link
  type: 'spotify' | 'youtube' | 'drive';
  notes?: string;
}

