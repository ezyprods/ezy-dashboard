'use client';

import { SmartUpload } from '@/components/upload/SmartUpload';

interface SmartUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialFiles: File[];
  preselectedArtistId?: string;
  /** Explicit destination folder (e.g. the folder open in the explorer) */
  preselectedFolderId?: string;
  preselectedFolderName?: string;
  preselectedTargetType?: 'artist' | 'personal';
  preselectedPersonalProjectId?: string;
  /** Called once all uploads have finished */
  onSuccess?: () => void;
}

/** Backwards-compatible entry point for the Smart Upload dialog. */
export function SmartUploadModal({
  isOpen, onClose, initialFiles, preselectedArtistId, preselectedFolderId, preselectedFolderName,
  preselectedTargetType, preselectedPersonalProjectId, onSuccess,
}: SmartUploadModalProps) {
  if (!isOpen) return null;
  return (
    <SmartUpload
      request={{
        files: initialFiles,
        targetType: preselectedTargetType,
        artistId: preselectedArtistId,
        personalProjectId: preselectedPersonalProjectId,
        folderId: preselectedFolderId,
        folderName: preselectedFolderName,
        onFinished: onSuccess,
      }}
      onClose={onClose}
    />
  );
}
