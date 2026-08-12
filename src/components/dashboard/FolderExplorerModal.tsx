'use client';

// FolderExplorerModal — now delegates to the lightweight FileLocationModal
// to avoid mounting the full DriveExplorer (which triggers expensive recursive fetches)
export { FileLocationModal as FolderExplorerModal } from './FileLocationModal';
