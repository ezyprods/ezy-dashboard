export type ArtistStatus = 'active' | 'archived';
export type ServiceType = 'production' | 'mix' | 'master' | 'songwriting' | 'other';

export interface PulseStats {
  statusColor: 'gray' | 'purple' | 'orange' | 'green';
  activeProjects: Array<{ id: string; title: string; type: string }>;
  pendingPayments: number;
  newFiles: number;
  lastSessionDate?: string;
  progressPercent?: number;
}

export interface Artist {
  id: string; // Drive folder ID
  name: string;
  photo?: string; // Drive file ID of photo
  photoUrl?: string; // Resolved URL for display
  genre: string[];
  email?: string;
  phone?: string;
  tags: string[];
  services: ServiceType[];
  notes?: string;
  status: ArtistStatus;
  portalToken?: string;
  createdAt: string;
  updatedAt: string;
  driveFolderId: string;
  // Computed/joined fields
  activeProject?: string;
  projectCount?: number;
  pulseStats?: PulseStats;
}

export interface ArtistConfig {
  id: string;
  name: string;
  photo?: string;
  genre: string[];
  email?: string;
  phone?: string;
  tags: string[];
  services: ServiceType[];
  notes?: string;
  status: ArtistStatus;
  portalToken?: string;
  createdAt: string;
  updatedAt: string;
  pulseStats?: PulseStats;
}

export interface CreateArtistInput {
  name: string;
  genre?: string[];
  email?: string;
  phone?: string;
  tags?: string[];
  services?: ServiceType[];
  notes?: string;
}
