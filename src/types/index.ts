export * from './artist';
export * from './project';
export * from './payment';
export * from './file';
export * from './communication';
export * from './portal';

export interface CoverHistoryEntry {
  fileId: string;
  uploadedAt: string;
}

export interface ReleaseTrack {
  id: string;
  originalFileId: string;
  originalFileName?: string;
  title: string;
  newFileId: string;
  previewFileId?: string;
}

export interface Release {
  id: string;
  title: string;
  artistId: string;
  coverArtId?: string;
  coverHistory?: CoverHistoryEntry[];
  tracks: ReleaseTrack[];
  isPublic?: boolean;
  createdAt: string;
  updatedAt: string;
}
