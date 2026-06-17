'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

interface GlobalDragDropContextValue {
  isDraggingFiles: boolean;
  droppedFiles: File[];
  preselectedArtistId: string | null;
  clearDroppedFiles: () => void;
  triggerUploadForArtist: (files: File[], artistId: string) => void;
}

const GlobalDragDropContext = createContext<GlobalDragDropContextValue>({
  isDraggingFiles: false,
  droppedFiles: [],
  preselectedArtistId: null,
  clearDroppedFiles: () => {},
  triggerUploadForArtist: () => {},
});

export const useGlobalDragDrop = () => useContext(GlobalDragDropContext);

export function GlobalDragDropProvider({ children }: { children: React.ReactNode }) {
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<File[]>([]);
  const [preselectedArtistId, setPreselectedArtistId] = useState<string | null>(null);
  const dragCounter = useRef(0);

  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      // Only react to file drags
      if (!e.dataTransfer?.types?.includes('Files')) return;
      dragCounter.current++;
      setIsDraggingFiles(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      dragCounter.current--;
      if (dragCounter.current <= 0) {
        dragCounter.current = 0;
        setIsDraggingFiles(false);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes('Files')) {
        e.preventDefault();
      }
    };

    const handleDrop = (e: DragEvent) => {
      dragCounter.current = 0;
      setIsDraggingFiles(false);
    };

    const handleDragEnd = () => {
      dragCounter.current = 0;
      setIsDraggingFiles(false);
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    window.addEventListener('dragend', handleDragEnd);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
      window.removeEventListener('dragend', handleDragEnd);
    };
  }, []);

  const clearDroppedFiles = useCallback(() => {
    setDroppedFiles([]);
    setPreselectedArtistId(null);
  }, []);

  const triggerUploadForArtist = useCallback((files: File[], artistId: string) => {
    setPreselectedArtistId(artistId);
    setDroppedFiles(files);
    setIsDraggingFiles(false);
  }, []);

  return (
    <GlobalDragDropContext.Provider value={{
      isDraggingFiles,
      droppedFiles,
      preselectedArtistId,
      clearDroppedFiles,
      triggerUploadForArtist,
    }}>
      {children}
    </GlobalDragDropContext.Provider>
  );
}
