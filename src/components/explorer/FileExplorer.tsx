'use client';

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { UploadCloud, X, Clock, AudioWaveform, Star, Timer, Trash2, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAudioControls } from '@/lib/contexts/AudioContext';
import { useGlobalDragDrop } from '@/lib/contexts/GlobalDragDropContext';
import { Modal } from '@/components/ui/Modal';
import { ShareModal } from '@/components/artists/ShareModal';
import { DeleteModal } from '@/components/artists/DeleteModal';
import { SmartUploadModal } from '@/components/layout/SmartUploadModal';
import { MiniDAWModal } from '@/components/projects/MiniDAWModal';
import { DAWErrorBoundary } from '@/components/projects/DAWErrorBoundary';
import { addToTrash, apiUpdate, insertItems, patchItems, removeFromTrash, removeItems, runPool } from './driveStore';
import { driveUrl } from './fileKinds';
import { ExplorerProvider, useExplorer, useExplorerController, VIEW_LABEL, type ExplorerProps } from './useExplorerController';
import { ExplorerToolbar } from './ExplorerToolbar';
import { ExplorerSidebarContent } from './ExplorerSidebar';
import { ItemsView } from './ItemsView';
import { DetailsContent, InspectorPanel } from './DetailsPanel';
import { PreviewModal } from './PreviewModal';
import { MoveDialog } from './MoveDialog';
import { SelectionBar } from './SelectionBar';
import { ShortcutsDialog } from './ShortcutsDialog';
import type { ExplorerView } from './types';

const MOBILE_VIEWS: { view: ExplorerView; label: string; icon: React.ElementType }[] = [
  { view: 'folder', label: 'Archivos', icon: FolderOpen },
  { view: 'recent', label: 'Recientes', icon: Clock },
  { view: 'audio', label: 'Audios', icon: AudioWaveform },
  { view: 'starred', label: 'Destacados', icon: Star },
  { view: 'scheduled', label: 'Programados', icon: Timer },
  { view: 'trash', label: 'Papelera', icon: Trash2 },
];

function ViewChips() {
  const ex = useExplorer();
  return (
    <div className="lg:hidden flex items-center gap-1.5 overflow-x-auto scrollbar-hide px-2 md:px-3 py-2 border-b border-border/60 bg-surface-elevated" data-no-swipe>
      {MOBILE_VIEWS.map(({ view, label, icon: Icon }) => {
        const active = ex.view === view;
        const count = view === 'scheduled' ? ex.counts.scheduled : view === 'starred' ? ex.counts.starred : 0;
        return (
          <button
            key={view}
            type="button"
            onClick={() => ex.setView(view)}
            className={cn(
              'inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors',
              active ? 'bg-text-primary text-surface-elevated' : 'bg-surface text-text-secondary border border-border/60',
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
            {count > 0 && <span className={cn('text-[10px] px-1.5 rounded-full', active ? 'bg-surface-elevated/20' : 'bg-surface-elevated')}>{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

function SidebarDrawer() {
  const ex = useExplorer();
  useEffect(() => {
    if (!ex.drawerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') ex.setDrawerOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ex.drawerOpen, ex]);

  if (!ex.drawerOpen || typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[85] lg:hidden" role="dialog" aria-modal="true" aria-label="Carpetas">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => ex.setDrawerOpen(false)} />
      <div className="absolute inset-y-0 left-0 w-[min(320px,86vw)] bg-surface-elevated border-r border-border shadow-2xl flex flex-col animate-slide-in pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]" data-no-swipe>
        <div className="flex items-center justify-between px-4 h-14 border-b border-border/60 shrink-0">
          <span className="text-sm font-semibold text-text-primary truncate">{ex.rootName}</span>
          <button type="button" onClick={() => ex.setDrawerOpen(false)} className="w-10 h-10 flex items-center justify-center rounded-xl text-text-secondary hover:bg-surface" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 min-h-0">
          <ExplorerSidebarContent />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ExplorerModals() {
  const ex = useExplorer();
  const { currentTrack } = useAudioControls();

  const deleteItems = ex.deleteDialog;
  const detailsItem = ex.detailsSheetId && ex.detailsSheetId !== '__folder__'
    ? ex.visibleItems.find(i => i.id === ex.detailsSheetId)
    : null;

  // Close the details sheet if its item disappears (deleted/moved) or the layout grows to show the inspector
  useEffect(() => {
    if (ex.detailsSheetId && ex.detailsSheetId !== '__folder__' && !detailsItem) ex.setDetailsSheetId(null);
  }, [ex.detailsSheetId, detailsItem, ex]);
  useEffect(() => {
    if (ex.isXL && ex.detailsSheetId) ex.setDetailsSheetId(null);
  }, [ex.isXL, ex.detailsSheetId, ex]);

  const portal = (node: React.ReactNode) => (typeof document === 'undefined' ? null : createPortal(node, document.body));

  return (
    <>
      <PreviewModal />
      <MoveDialog />
      <ShortcutsDialog />
      <SidebarDrawer />
      <SelectionBar hasPlayer={!!currentTrack} />

      {!ex.isXL && ex.detailsSheetId && (
        <Modal isOpen onClose={() => ex.setDetailsSheetId(null)} title={detailsItem ? 'Detalles' : (ex.view === 'folder' ? ex.currentFolderName : VIEW_LABEL[ex.view])}>
          <DetailsContent />
        </Modal>
      )}

      {ex.shareItem && portal(
        <ShareModal
          isOpen
          onClose={() => ex.setShareItem(null)}
          fileId={ex.shareItem.id}
          fileName={ex.shareItem.name}
          webViewLink={driveUrl(ex.shareItem)}
          webContentLink={ex.shareItem.webContentLink}
          expiresAt={ex.shareItem.expiresAt}
        />,
      )}

      {deleteItems && deleteItems.length > 0 && portal(
        <DeleteModal
          isOpen
          initialMode="schedule"
          onClose={() => ex.setDeleteDialog(null)}
          fileId={deleteItems[0].id}
          fileName={deleteItems.length === 1 ? deleteItems[0].name : `${deleteItems.length} archivos`}
          fileIds={deleteItems.map(i => i.id)}
          currentExpiration={deleteItems.every(i => i.expiresAt) ? deleteItems[0].expiresAt : null}
          onExpirationChanged={(id, expiresAt) => patchItems([id], { expiresAt })}
          onDeleted={(ids) => {
            // The modal already moved them to the trash on the server
            const trashed = deleteItems.filter(i => (ids || []).includes(i.id));
            removeItems(trashed.map(i => i.id));
            addToTrash(ex.rootId, trashed);
            ex.notify(`${trashed.length === 1 ? `"${trashed[0].name}"` : `${trashed.length} archivos`} movido a la papelera`, {
              label: 'eliminar',
              run: async () => {
                await runPool(trashed, 4, i => apiUpdate(i.id, { trashed: false }));
                removeFromTrash(trashed.map(i => i.id));
                insertItems(trashed, ex.rootId);
              },
            });
          }}
        />,
      )}

      {ex.upload && (
        <SmartUploadModal
          isOpen
          onClose={() => { ex.setUpload(null); ex.onUploadFinished(); }}
          onSuccess={ex.onUploadFinished}
          initialFiles={ex.upload.files}
          preselectedFolderId={ex.upload.folderId}
          preselectedTargetType={ex.scope.type}
          preselectedArtistId={ex.scope.type === 'artist' ? ex.scope.artistId : undefined}
          preselectedPersonalProjectId={ex.scope.type === 'personal' ? ex.scope.projectId : undefined}
        />
      )}

      {ex.miniDawItem && (
        <DAWErrorBoundary onClose={() => ex.setMiniDawItem(null)}>
          <MiniDAWModal fileId={ex.miniDawItem.id} fileName={ex.miniDawItem.name} onClose={() => ex.setMiniDawItem(null)} />
        </DAWErrorBoundary>
      )}
    </>
  );
}

function ExplorerLayout() {
  const ex = useExplorer();
  const { currentTrack } = useAudioControls();
  const { isDraggingFiles } = useGlobalDragDrop();
  const showSidebar = ex.isLg && !ex.sidebarCollapsed;
  const showInspector = ex.isXL && ex.inspectorVisible;
  const dropFolderName = ex.currentFolderName;

  return (
    <div
      ref={ex.containerRef}
      tabIndex={-1}
      onKeyDown={ex.onKeyDown}
      onPointerDownCapture={ex.onContainerPointerDown}
      className={cn('outline-none w-full animate-fade-in', isDraggingFiles && 'relative z-[500]')}
    >
      <div
        className={cn(
          'flex rounded-2xl border border-border bg-surface-elevated overflow-hidden shadow-sm',
          'md:min-h-[540px]',
          currentTrack ? 'md:h-[calc(100dvh-14rem)]' : 'md:h-[calc(100dvh-10rem)]',
        )}
      >
        {showSidebar && (
          <aside className="w-64 shrink-0 border-r border-border/60 bg-surface-elevated/60 flex flex-col min-h-0" aria-label="Navegación de archivos">
            <ExplorerSidebarContent />
          </aside>
        )}

        <section className="flex-1 min-w-0 flex flex-col min-h-0">
          <ExplorerToolbar />
          <ViewChips />
          <div
            {...ex.containerDropProps}
            className="relative flex-1 min-h-[360px] md:min-h-0 md:overflow-y-auto overscroll-contain bg-surface-elevated"
          >
            <ItemsView />
            {ex.fileDragOver && (
              <div className="pointer-events-none absolute inset-2 z-20 rounded-2xl border-2 border-dashed border-accent bg-accent/10 backdrop-blur-[2px] flex flex-col items-center justify-center text-center animate-fade-in">
                <div className="w-14 h-14 rounded-2xl bg-accent/20 flex items-center justify-center mb-3">
                  <UploadCloud className="w-7 h-7 text-accent" />
                </div>
                <p className="text-sm font-semibold text-text-primary">Suelta para subir a “{dropFolderName}”</p>
                <p className="text-xs text-text-secondary mt-1">O suéltalos encima de una carpeta concreta</p>
              </div>
            )}
          </div>
        </section>

        {showInspector && <InspectorPanel />}
      </div>

      <input ref={ex.fileInputRef} type="file" multiple className="hidden" onChange={ex.onFileInputChange} />
      <ExplorerModals />
    </div>
  );
}

/**
 * Google Drive file explorer used inside every artist profile (and personal projects).
 * Desktop: sidebar (quick views + folder tree) · list/grid · details inspector.
 * Tablet: folders in a drawer, details in a sheet. Phone: single column, tap to open,
 * long-press or "⋮" for actions, selection mode with a floating action bar.
 */
export function FileExplorer(props: ExplorerProps) {
  const controller = useExplorerController(props);
  return (
    <ExplorerProvider value={controller}>
      <ExplorerLayout />
    </ExplorerProvider>
  );
}
