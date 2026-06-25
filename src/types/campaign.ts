export type CampaignColor = 'purple' | 'blue' | 'green' | 'orange' | 'pink' | 'red' | 'cyan' | 'yellow';

export interface Campaign {
  id: string;
  name: string;
  type: 'album' | 'singles';
  driveFolderIds: string[];
  description?: string;
  color?: CampaignColor;
  emoji?: string;
  createdAt?: string;
}

export interface EzyConfig {
  campaigns: Campaign[];
}

