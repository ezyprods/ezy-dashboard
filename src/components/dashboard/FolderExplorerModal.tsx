'use client';

import { FileLocationModal } from './FileLocationModal';

interface FolderExplorerModalProps {
  isOpen: boolean;
  onClose: () => void;
  folderId: string | null;
  folderName?: string;
  highlightFileId?: string;
  highlightFileName?: string;
}

export function FolderExplorerModal({
  isOpen,
  onClose,
  folderId,
  highlightFileId,
  highlightFileName,
}: FolderExplorerModalProps) {
  return (
    <FileLocationModal
      isOpen={isOpen}
      onClose={onClose}
      folderId={folderId}
      highlightFileId={highlightFileId}
      highlightFileName={highlightFileName}
    />
  );
}

export default FolderExplorerModal;
