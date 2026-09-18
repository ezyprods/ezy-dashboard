export const FOLDER_MIME = 'application/vnd.google-apps.folder';

export type FileKind =
  | 'folder'
  | 'audio'
  | 'image'
  | 'video'
  | 'pdf'
  | 'doc'
  | 'sheet'
  | 'slides'
  | 'project'
  | 'archive'
  | 'text'
  | 'other';

export interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  kind: FileKind;
  isFolder: boolean;
  parentId: string | null;
  size: number | null;
  createdTime?: string;
  modifiedTime?: string;
  webViewLink?: string;
  webContentLink?: string;
  thumbnailLink?: string;
  starred: boolean;
  shared: boolean;
  folderColor?: string;
  extension: string;
  expiresAt: number | null;
  bpm: string | null;
  musicalKey: string | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  lastModifiedBy?: string;
  trashedTime?: string;
}

export interface Crumb {
  id: string;
  name: string;
}

/** Where the explorer lives: decides how uploads are routed and which extra actions exist. */
export type ExplorerScope =
  | { type: 'artist'; artistId: string; artistEmail?: string }
  | { type: 'library' };

/** `sends` and `assigned` only exist in the beat library. */
export type ExplorerView = 'folder' | 'recent' | 'audio' | 'starred' | 'scheduled' | 'trash' | 'sends' | 'assigned';

export type TypeFilter = 'all' | 'folder' | 'audio' | 'image' | 'video' | 'document' | 'project' | 'other';

export type SortField = 'name' | 'modified' | 'size' | 'type';
export type SortDir = 'asc' | 'desc';

export type ViewMode = 'list' | 'grid';
