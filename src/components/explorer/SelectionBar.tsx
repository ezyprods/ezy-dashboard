'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { X, Download, ArrowRightLeft, Trash2, MoreHorizontal, Star, RotateCcw, ListChecks, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useContextMenu } from '@/lib/contexts/ContextMenuContext';
import { useExplorer } from './useExplorerController';

function BarButton({ icon: Icon, label, onClick, danger }: { icon: React.ElementType; label: string; onClick: (e: React.MouseEvent) => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 min-w-[52px] h-12 sm:h-10 px-2 sm:px-3 rounded-xl text-[10px] sm:text-xs font-medium transition-colors',
        danger ? 'text-error hover:bg-error/10' : 'text-text-primary hover:bg-surface',
      )}
      title={label}
    >
      <Icon className="w-[18px] h-[18px] sm:w-4 sm:h-4" />
      <span>{label}</span>
    </button>
  );
}

/**
 * Floating action bar for the current selection. Shown on touch devices in selection mode,
 * for multi-selections, and for single selections when the details panel is not on screen.
 */
export function SelectionBar({ hasPlayer }: { hasPlayer: boolean }) {
  const ex = useExplorer();
  const { showMenu } = useContextMenu();
  const items = ex.selectedItems;
  const inspectorShown = ex.isXL && ex.inspectorVisible;
  const visible = ex.selectionMode || items.length > 1 || (items.length === 1 && !inspectorShown && ex.canHover);

  if (!visible || typeof document === 'undefined') return null;
  const inTrash = ex.view === 'trash';
  const single = items.length === 1 ? items[0] : null;

  return createPortal(
    <div
      className={cn(
        'fixed left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-1.5rem)] sm:w-auto max-w-2xl animate-slide-up',
        hasPlayer
          ? 'bottom-[calc(64px+62px+env(safe-area-inset-bottom,0px)+0.75rem)] md:bottom-[5.5rem]'
          : 'bottom-[calc(64px+env(safe-area-inset-bottom,0px)+0.75rem)] md:bottom-6',
      )}
      role="toolbar"
      aria-label="Acciones de la selección"
    >
      <div className="flex items-center gap-1 p-1.5 rounded-2xl bg-surface-elevated/95 backdrop-blur-xl border border-border shadow-2xl shadow-black/40">
        <button
          type="button"
          onClick={ex.clearSelection}
          className="w-10 h-10 flex items-center justify-center rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface shrink-0"
          aria-label="Cancelar selección"
        >
          <X className="w-5 h-5" />
        </button>
        <span className="text-sm font-semibold text-text-primary px-1 whitespace-nowrap min-w-[2.5rem]">
          {items.length === 0 ? 'Toca para elegir' : items.length}
          <span className="hidden sm:inline font-normal text-text-secondary">{items.length > 0 ? (items.length === 1 ? ' seleccionado' : ' seleccionados') : ''}</span>
        </span>
        <div className="w-px h-6 bg-border mx-1 shrink-0" />

        {items.length === 0 ? (
          <BarButton icon={ListChecks} label="Todo" onClick={ex.selectAll} />
        ) : inTrash ? (
          <>
            <BarButton icon={RotateCcw} label="Restaurar" onClick={() => ex.restoreItems(items)} />
            <BarButton icon={Trash2} label="Eliminar" danger onClick={() => ex.deleteForever(items)} />
          </>
        ) : (
          <div className="flex items-center flex-1 justify-around sm:justify-start">
            <BarButton icon={Download} label="Descargar" onClick={() => ex.download(items)} />
            {single
              ? <BarButton icon={Share2} label="Compartir" onClick={() => ex.setShareItem(single)} />
              : <BarButton icon={Star} label={items.every(i => i.starred) ? 'Quitar' : 'Destacar'} onClick={() => ex.toggleStar(items)} />}
            <BarButton icon={ArrowRightLeft} label="Mover" onClick={() => ex.setMoveDialog({ items, mode: 'move' })} />
            <BarButton icon={Trash2} label="Eliminar" danger onClick={() => ex.trashItems(items)} />
            <BarButton
              icon={MoreHorizontal}
              label="Más"
              onClick={e => {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const menu = ex.buildItemMenu(items, { x: rect.left, y: rect.top });
                showMenu(rect.left - 120, Math.max(8, rect.top - 420), [
                  ...menu,
                  { separator: true },
                  { label: 'Seleccionar todo', icon: 'ListChecks', action: ex.selectAll },
                ]);
              }}
            />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
