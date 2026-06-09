export type ArtistStatus = 'active' | 'archived';
export type ServiceType = 'production' | 'mix' | 'master' | 'songwriting' | 'other';

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
