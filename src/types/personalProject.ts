import type { WorkSession } from './project';

export type PersonalProjectCategory = 
  | 'beat' 
  | 'grabacion' 
  | 'loop_pack' 
  | 'colaboracion' 
  | 'mashup';

export type PersonalProjectStatus = 
  | 'idea' 
  | 'en_progreso' 
  | 'terminado' 
  | 'en_pausa' 
  | 'incluido_en_pack' 
  | 'cedido_a_artista' 
  | 'descartado';

export interface PersonalProject {
  id: string;                         // ID de la carpeta de Drive del proyecto
  title: string;
  category: PersonalProjectCategory;
  tags: string[];                     // Etiquetas libres
  status: PersonalProjectStatus;
  bpm?: number;
  key?: string;                       // Ej: "G#m", "C Major"
  coverArt?: string;                  // File ID en Drive
  coverArtUrl?: string;
  driveFolderId: string;
  driveUrl?: string;
  year?: number;
  month?: number;                     // 1-12
  collaborators?: string[];           // Productores / Beatmakers colaboradores
  linkedArtistId?: string | null;     // Si se ha vinculado/cedido a un artista
  linkedArtistProjectId?: string | null; // ID del proyecto clonado en el artista
  linkedArtistName?: string | null;
  notes?: string;
  latestBounceFileId?: string | null; // ID del archivo del último bounce para play instantáneo
  latestBounceName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePersonalProjectInput {
  title: string;
  category: PersonalProjectCategory;
  tags?: string[];
  status?: PersonalProjectStatus;
  bpm?: number;
  key?: string;
  year?: number;
  month?: number;
  collaborators?: string[];
  notes?: string;
}

export interface PersonalTask {
  id: string;
  title: string;
  status: 'pending' | 'completed';
  createdAt?: string;
}

export interface PersonalTasksData {
  tasks: PersonalTask[];
  workSessions: WorkSession[];
}

export interface PersonalProjectDetail {
  project: PersonalProject;
  folders: {
    id: string;
    name: string;
    files: any[];
    subFolders?: any[];
  }[];
  rootFiles: any[];
  tasks: PersonalTask[];
  workSessions: WorkSession[];
  bounces: any[];
}
