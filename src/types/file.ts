export type FileType = 'audio' | 'image' | 'pdf' | 'video' | 'other';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdTime: string;
  modifiedTime: string;
  webViewLink?: string;
  webContentLink?: string;
  thumbnailLink?: string;
  downloadable: boolean;
  playable: boolean;
  versionTag?: string;
  parentFolderId: string;
  fileType: FileType;
  expiresAt?: number;
}

export interface DrivePermission {
  id: string;
  type: string;
  role: string;
  emailAddress?: string;
  displayName?: string;
  photoLink?: string;
  deleted?: boolean;
}

export interface DriveFolder {
  id: string;
  name: string;
  parentFolderId?: string;
  createdTime: string;
}

export interface BreadcrumbItem {
  id: string;
  name: string;
}

export interface UploadResult {
  fileId: string;
  name: string;
  mimeType: string;
  size: number;
  isNewVersion: boolean;
  previousVersionId?: string;
}
