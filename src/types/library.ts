/**
 * Beat library ("Proyectos personales"): one free-form Drive folder tree.
 * Sends and assignments are stored in `beat_library.json` at the library root.
 */

/** A delivery of library items (files or whole folders) to one or more artists. Nothing is copied. */
export interface BeatSend {
  id: string;
  title: string;
  note?: string;
  /** Drive ids of files or folders inside the library. Folders are resolved live (their current content). */
  itemIds: string[];
  artistIds: string[];
  allowDownload: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A beat handed to an artist: moved out of the library into `<artist>/Beats`. */
export interface BeatAssignment {
  id: string;
  fileId: string;
  fileName: string;
  isFolder: boolean;
  artistId: string;
  artistName: string;
  fromFolderId: string;
  fromPath: string;
  toFolderId: string;
  /** Sends that referenced this item directly (restored on undo) */
  removedFromSendIds: string[];
  assignedAt: string;
}

export interface BeatLibraryDb {
  version: 1;
  sends: BeatSend[];
  assignments: BeatAssignment[];
}

export interface LibraryState extends BeatLibraryDb {
  rootId: string;
  rootName: string;
}

/** A playable/downloadable file resolved from a send, as the artist portal receives it. */
export interface PortalBeat {
  id: string;
  name: string;
  mimeType: string;
  size: string | null;
  modifiedTime: string | null;
  bpm: string | null;
  key: string | null;
  /** Sub-path inside the sent folder, e.g. "Trap / 2025" (empty for loose files) */
  path: string;
}

export interface PortalBeatSend {
  id: string;
  title: string;
  note?: string;
  sentAt: string;
  allowDownload: boolean;
  beats: PortalBeat[];
}
