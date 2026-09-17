'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { UploadCloud, X, Clock, AudioWaveform, Star, Timer, Trash2, FolderOpen, Disc3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAudioControls } from '@/lib/contexts/AudioContext';
import { Modal } from '@/components/ui/Modal';
import { ShareModal } from '@/components/artists/ShareModal';
import { DeleteModal } from '@/components/artists/DeleteModal';
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
      {MOBILE_VIEWS.slice(0, 1).map(({ view, label, icon: Icon }) => (
        <button
          key={view}
          type="button"
          onClick={() => ex.setView(view)}
          className={cn(
            'inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors',
            ex.view === view && !(ex.bouncesFolder && ex.crumbs.some(c => c.id === ex.bouncesFolder!.id))
              ? 'bg-text-primary text-surface-elevated'
              : 'bg-surface text-text-secondary border border-border/60',
          )}
        >
          <Icon className="w-3.5 h-3.5" />
          {label}
        </button>
      ))}
      <button
        type="button"
        onClick={ex.openBounces}
        className={cn(
          'inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors',
          ex.view === 'folder' && ex.bouncesFolder && ex.crumbs.some(c => c.id === ex.bouncesFolder!.id)
            ? 'bg-text-primary text-surface-elevated'
            : 'bg-surface text-text-secondary border border-border/60',
        )}
      >
        <Disc3 className="w-3.5 h-3.5" />
        Bounces
      </button>
      {MOBILE_VIEWS.slice(1).map(({ view, label, icon: Icon }) => {
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

      {ex.miniDawItem && (
        <DAWErrorBoundary onClose={() => ex.setMiniDawItem(null)}>
          <MiniDAWModal fileId={ex.miniDawItem.id} fileName={ex.miniDawItem.name} onClose={() => ex.setMiniDawItem(null)} />
        </DAWErrorBoundary>
      )}
    </>
  );
}

/**
 * Sticky metrics inside the app's scroll container (#app-main).
 * Sticky offsets are measured from the container's padding edge, so its top padding is
 * compensated: `stickyTop` is the visual height already covered at the top (e.g. the artist tabs).
 */
function useStickyMetrics(stickyTop: number) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarH, setToolbarH] = useState(0);
  const [metrics, setMetrics] = useState<{ padTop: number; usable: number } | null>(null);

  useLayoutEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const update = () => setToolbarH(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const main = document.getElementById('app-main');
    if (!main) return;
    const update = () => {
      const cs = getComputedStyle(main);
      setMetrics({
        padTop: parseFloat(cs.paddingTop || '0'),
        // Visible height excluding the space reserved at the bottom (mobile tab bar, mini player)
        usable: main.clientHeight - parseFloat(cs.paddingBottom || '0'),
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(main);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  const padTop = metrics?.padTop ?? 0;
  const style = {
    '--x-top': `${stickyTop - padTop}px`,
    '--x-toolbar': `${toolbarH}px`,
    '--x-panel-h': metrics ? `${Math.max(320, metrics.usable - stickyTop)}px` : `calc(100dvh - ${stickyTop + 140}px)`,
  } as React.CSSProperties;

  return { toolbarRef, style };
}

function ExplorerLayout({ stickyTop }: { stickyTop: number }) {
  const ex = useExplorer();
  const showSidebar = ex.isLg && !ex.sidebarCollapsed;
  const showInspector = ex.isXL && ex.inspectorVisible;
  const { toolbarRef, style } = useStickyMetrics(stickyTop);

  return (
    <div
      ref={ex.containerRef}
      tabIndex={-1}
      onKeyDown={ex.onKeyDown}
      onPointerDownCapture={ex.onContainerPointerDown}
      style={style}
      className="outline-none w-full animate-fade-in"
    >
      {/* overflow-clip (not hidden) keeps the rounded corners without breaking position: sticky */}
      <div className="flex items-stretch rounded-2xl border border-border bg-surface-elevated overflow-clip shadow-sm">
        {showSidebar && (
          <aside className="w-64 shrink-0 border-r border-border/60 bg-surface-elevated/60" aria-label="Navegación de archivos">
            <div className="sticky top-[var(--x-top)] h-[var(--x-panel-h)] flex flex-col">
              <ExplorerSidebarContent />
            </div>
          </aside>
        )}

        <section className="flex-1 min-w-0 flex flex-col">
          <div ref={toolbarRef} className="sticky top-[var(--x-top)] z-20 rounded-t-2xl lg:rounded-none">
            <ExplorerToolbar />
          </div>
          <ViewChips />
          <div
            {...ex.containerDropProps}
            className="relative flex-1 min-h-[420px] bg-surface-elevated"
          >
            <ItemsView />
            {ex.fileDragOver && (
              <div className="pointer-events-none absolute inset-2 z-10 rounded-2xl border-2 border-dashed border-accent bg-accent/10 backdrop-blur-[2px] flex flex-col items-center justify-start pt-24 text-center animate-fade-in">
                <div className="sticky top-[calc(var(--x-top)+var(--x-toolbar)+4rem)] flex flex-col items-center">
                  <div className="w-14 h-14 rounded-2xl bg-accent/20 flex items-center justify-center mb-3">
                    <UploadCloud className="w-7 h-7 text-accent" />
                  </div>
                  <p className="text-sm font-semibold text-text-primary">Suelta para subir a “{ex.currentFolderName}”</p>
                  <p className="text-xs text-text-secondary mt-1">O suéltalos encima de una carpeta concreta</p>
                </div>
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
export function FileExplorer({ stickyTop = 0, ...props }: ExplorerProps & { stickyTop?: number }) {
  const controller = useExplorerController(props);
  return (
    <ExplorerProvider value={controller}>
      <ExplorerLayout stickyTop={stickyTop} />
    </ExplorerProvider>
  );
}
