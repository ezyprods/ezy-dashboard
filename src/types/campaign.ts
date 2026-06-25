export interface Campaign {
  id: string;
  name: string;
  type: 'album' | 'singles';
  driveFolderIds: string[];
}

export interface EzyConfig {
  campaigns: Campaign[];
}
