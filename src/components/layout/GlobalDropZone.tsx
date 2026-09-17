'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';
import { UploadCloud, Plus } from 'lucide-react';
import { isFileDrag, useGlobalDragDrop, type DropContextInfo } from '@/lib/contexts/GlobalDragDropContext';
import { SmartUpload } from '@/components/upload/SmartUpload';
import { extractDroppedFiles } from '@/components/upload/fileIntake';

/** Pages whose own drop zones own the gesture (audio tools, release editor, previews manager). */
function isDisabledPath(pathname: string) {
  return pathname.startsWith('/tools')
    || (pathname.includes('/releases/') && pathname.includes('/editor'))
    || /^\/artists\/[^/]+\/previews/.test(pathname);
}

function defaultContext(pathname: string): DropContextInfo {
  if (isDisabledPath(pathname)) return { mode: 'disabled' };
  if (pathname === '/artists') {
    return { mode: 'auto', label: 'Suelta sobre un artista', hint: 'O en cualquier otra parte para detectar el artista automáticamente' };
  }
  if (pathname === '/personal-projects') {
    return { mode: 'personal', label: 'Suelta sobre un proyecto', hint: 'O en cualquier otra parte para elegir el proyecto personal' };
  }
  return { mode: 'auto', label: 'Suelta para subir', hint: 'La Subida inteligente detecta el artista, el proyecto y el tipo de archivo' };
}

/**
 * Global drag & drop layer:
 * - shows a non-blocking hint while files are dragged over the app,
 * - handles drops that no specific target took (according to the page drop context),
 * - hosts the Smart Upload dialog opened from anywhere.
 */
export function GlobalDropZone() {
  const pathname = usePathname();
  const { isDraggingFiles, dropContext, uploadSession, openSmartUpload, closeSmartUpload } = useGlobalDragDrop();

  const context = isDisabledPath(pathname) ? { mode: 'disabled' as const } : (dropContext || defaultContext(pathname));
  const contextRef = useRef(context);
  contextRef.current = context;

  // Fallback for drops that nothing on the page handled
  useEffect(() => {
    const onDrop = (e: DragEvent) => {
      if (!isFileDrag(e) || e.defaultPrevented) return;
      e.preventDefault(); // never let the browser navigate to the dropped file
      const ctx = contextRef.current;
      if (ctx.mode === 'disabled') return;
      // The DataTransfer is emptied when the handler returns, so read it synchronously here
      extractDroppedFiles(e.dataTransfer).then(({ files }) => {
        if (files.length === 0) return;
        openSmartUpload({
          files,
          targetType: ctx.mode === 'personal' ? 'personal' : ctx.mode === 'artist' ? 'artist' : undefined,
          artistId: ctx.artistId,
          projectId: ctx.projectId,
          personalProjectId: ctx.personalProjectId,
          folderId: ctx.folderId,
          folderName: ctx.folderName,
          onFinished: ctx.onFinished,
        });
      });
    };
    window.addEventListener('drop', onDrop);
    return () => window.removeEventListener('drop', onDrop);
  }, [openSmartUpload]);

  // "Subida rápida" from the top bar / right-click menu opens (or focuses) the Smart Upload
  useEffect(() => {
    const open = () => openSmartUpload({ files: [] });
    window.addEventListener('ezy:quick-upload', open);
    return () => window.removeEventListener('ezy:quick-upload', open);
  }, [openSmartUpload]);

  if (typeof document === 'undefined') return null;

  const showHint = isDraggingFiles && context.mode !== 'disabled';
  const adding = !!uploadSession;

  return (
    <>
      {showHint && createPortal(
        <div className="fixed inset-0 z-[450] pointer-events-none animate-fade-in" aria-hidden="true">
          <div className="absolute inset-2 md:inset-3 rounded-[28px] border-2 border-dashed border-accent/60 bg-accent/[0.04]" />
          <div className="absolute left-1/2 -translate-x-1/2 bottom-[calc(80px+env(safe-area-inset-bottom,0px))] md:bottom-8 px-4 w-[min(92vw,520px)]">
            <div className="flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-surface-elevated/95 backdrop-blur-xl border border-accent/40 shadow-2xl shadow-accent/20">
              <div className="w-10 h-10 rounded-xl bg-accent/15 text-accent flex items-center justify-center shrink-0">
                {adding ? <Plus className="w-5 h-5" /> : <UploadCloud className="w-5 h-5 animate-bounce" />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-text-primary truncate">
                  {adding ? 'Suelta para añadirlos a la subida' : (context.label || 'Suelta para subir')}
                </p>
                <p className="text-xs text-text-secondary line-clamp-2">
                  {adding ? 'Se añaden a la lista que ya tienes abierta, sin perder lo configurado' : context.hint}
                </p>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {uploadSession && (
        <SmartUpload key={uploadSession.id} session={uploadSession} onClose={closeSmartUpload} />
      )}
    </>
  );
}
