export * from './artist';
export * from './project';
export * from './payment';
export * from './file';
export * from './communication';
export * from './portal';

export interface ReleaseTrack {
  id: string;
  originalFileId: string;
  title: string;
  newFileId: string;
}

export interface Release {
  id: string;
  title: string;
  artistId: string;
  coverArtId?: string;
  tracks: ReleaseTrack[];
  createdAt: string;
  updatedAt: string;
}
