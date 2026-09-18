'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Platform-wide drag & drop of files from the computer.
 *
 * - Anything that accepts files itself (explorer folders, artist cards, project cards, tool drop zones…)
 *   handles the `drop` event and calls `preventDefault()`.
 * - Every other drop falls back to the *page drop context*: each page describes what a drop "anywhere"
 *   means there (upload to this artist, to the beat library, to the folder being viewed…) through
 *   `useDropContext`. Without a registered context the drop opens the Smart Upload in auto-detect mode.
 * - Dropping again (or from another place) never opens a second dialog: the files are queued as a new
 *   *batch* of the open upload session, keeping their own destination.
 */

export interface UploadRequest {
  files: File[];
  targetType?: 'artist' | 'library';
  artistId?: string;
  /** Project folder of the artist (files are routed inside it by type) */
  projectId?: string;
  /** Explicit destination folder. When omitted, Smart Upload routes files automatically. */
  folderId?: string;
  folderName?: string;
  /** Called after the upload finished (successfully or not) so the page can refresh. */
  onFinished?: () => void;
}

/** A group of files dropped together, with the destination of that particular drop. */
export interface UploadBatch extends UploadRequest {
  id: number;
}

export interface UploadSession {
  id: number;
  batches: UploadBatch[];
}

export interface DropContextInfo {
  /** 'disabled' turns the global fallback off (pages with their own drop zones, e.g. tools). */
  mode: 'auto' | 'artist' | 'library' | 'disabled';
  /** Short text shown while dragging, e.g. "Subir a Aaron Bzn". */
  label?: string;
  hint?: string;
  artistId?: string;
  projectId?: string;
  folderId?: string;
  folderName?: string;
  onFinished?: () => void;
}

interface GlobalDragDropContextValue {
  isDraggingFiles: boolean;
  /** The open upload session (null when the Smart Upload is closed) */
  uploadSession: UploadSession | null;
  isUploadOpen: boolean;
  dropContext: DropContextInfo | null;
  /** Opens the Smart Upload, or adds the files to the one already open. */
  openSmartUpload: (request: UploadRequest) => void;
  closeSmartUpload: () => void;
  registerDropContext: (info: DropContextInfo) => () => void;
  /** @deprecated use openSmartUpload */
  triggerUploadForArtist: (files: File[], artistId: string, folderId?: string) => void;
}

const noop = () => {};

const GlobalDragDropContext = createContext<GlobalDragDropContextValue>({
  isDraggingFiles: false,
  uploadSession: null,
  isUploadOpen: false,
  dropContext: null,
  openSmartUpload: noop,
  closeSmartUpload: noop,
  registerDropContext: () => noop,
  triggerUploadForArtist: noop,
});

export const useGlobalDragDrop = () => useContext(GlobalDragDropContext);

/** True when the drag carries real files from the OS (not text, links or in-app items). */
export function isFileDrag(e: { dataTransfer: DataTransfer | null }): boolean {
  return !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
}

/**
 * Describes what dropping files anywhere on the current page does.
 * Pass `null` to leave the default (auto-detect) behaviour.
 */
export function useDropContext(info: DropContextInfo | null) {
  const { registerDropContext } = useGlobalDragDrop();
  const key = info ? JSON.stringify({ ...info, onFinished: undefined }) : '';
  const onFinishedRef = useRef(info?.onFinished);
  onFinishedRef.current = info?.onFinished;

  useEffect(() => {
    if (!info) return;
    return registerDropContext({ ...info, onFinished: () => onFinishedRef.current?.() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, registerDropContext]);
}

export function GlobalDragDropProvider({ children }: { children: React.ReactNode }) {
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [uploadSession, setUploadSession] = useState<UploadSession | null>(null);
  const [contexts, setContexts] = useState<{ id: number; info: DropContextInfo }[]>([]);
  const dragDepth = useRef(0);
  const seq = useRef(0);

  useEffect(() => {
    const reset = () => {
      dragDepth.current = 0;
      setIsDraggingFiles(false);
    };
    const onDragEnter = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      dragDepth.current++;
      setIsDraggingFiles(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) reset();
    };
    const onDragOver = (e: DragEvent) => {
      // Allow dropping files anywhere (otherwise the browser would open the file and leave the app)
      if (isFileDrag(e)) e.preventDefault();
    };
    const onMouseMove = (e: MouseEvent) => {
      // Safety net for stuck states (e.g. the drag ended outside the window)
      if (dragDepth.current > 0 && e.buttons === 0) reset();
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', reset);
    window.addEventListener('dragend', reset);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', reset);
      window.removeEventListener('dragend', reset);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('blur', reset);
    };
  }, []);

  const openSmartUpload = useCallback((request: UploadRequest) => {
    dragDepth.current = 0;
    setIsDraggingFiles(false);
    setUploadSession(prev => {
      const batch: UploadBatch = { ...request, id: ++seq.current };
      // Already open → the files join the same dialog as a new batch
      if (prev) return { ...prev, batches: [...prev.batches, batch] };
      return { id: ++seq.current, batches: [batch] };
    });
  }, []);

  const closeSmartUpload = useCallback(() => setUploadSession(null), []);

  const registerDropContext = useCallback((info: DropContextInfo) => {
    const id = ++seq.current;
    setContexts(prev => [...prev, { id, info }]);
    return () => setContexts(prev => prev.filter(c => c.id !== id));
  }, []);

  const triggerUploadForArtist = useCallback((files: File[], artistId: string, folderId?: string) => {
    openSmartUpload({ files, targetType: 'artist', artistId: artistId || undefined, folderId });
  }, [openSmartUpload]);

  // The most recently registered (deepest) context wins
  const dropContext = contexts.length ? contexts[contexts.length - 1].info : null;

  const value = useMemo(() => ({
    isDraggingFiles,
    uploadSession,
    isUploadOpen: !!uploadSession,
    dropContext,
    openSmartUpload,
    closeSmartUpload,
    registerDropContext,
    triggerUploadForArtist,
  }), [isDraggingFiles, uploadSession, dropContext, openSmartUpload, closeSmartUpload, registerDropContext, triggerUploadForArtist]);

  return <GlobalDragDropContext.Provider value={value}>{children}</GlobalDragDropContext.Provider>;
}
