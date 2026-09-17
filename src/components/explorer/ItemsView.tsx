'use client';

import React, { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Play, Pause, MoreVertical, Star, Users, Check, FolderOpen, AlertCircle, RefreshCw, UploadCloud, SearchX,
  ArrowUp, ArrowDown, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { RealtimeCountdown } from '@/components/ui/RealtimeCountdown';
import { useExplorer, VIEW_LABEL } from './useExplorerController';
import {
  bpmTone, formatBytes, formatDuration, formatShortDate, KIND_LABEL, KindIcon, kindStyle, sizedThumbnail,
} from './fileKinds';
import type { DriveItem, SortField } from './types';

// ─── Thumbnail ──────────────────────────────────────────────────────────────

export function Thumbnail({ item, size = 400, className, iconClassName }: { item: DriveItem; size?: number; className?: string; iconClassName?: string }) {
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  const canThumb = ['image', 'video', 'pdf', 'doc', 'sheet', 'slides'].includes(item.kind);
  useEffect(() => setStage(0), [item.id]);

  const src = stage === 0
    ? sizedThumbnail(item.thumbnailLink, size) || (item.kind === 'image' ? `https://drive.google.com/thumbnail?id=${item.id}&sz=w${size}` : undefined)
    : stage === 1 && item.kind === 'image'
      ? `https://drive.google.com/thumbnail?id=${item.id}&sz=w${size}`
      : undefined;

  if (!canThumb || !src) {
    return (
      <div className={cn('flex items-center justify-center', kindStyle(item.kind).bg, className)}>
        <KindIcon item={item} className={iconClassName || 'w-8 h-8'} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      draggable={false}
      onError={() => setStage(s => (s === 0 && item.kind === 'image' && item.thumbnailLink ? 1 : 2))}
      className={cn('object-cover bg-surface', className)}
    />
  );
}

// ─── Inline rename ──────────────────────────────────────────────────────────

function RenameInput({ item, className }: { item: DriveItem; className?: string }) {
  const ex = useExplorer();
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    input.focus();
    const dot = item.isFolder ? -1 : item.name.lastIndexOf('.');
    input.setSelectionRange(0, dot > 0 ? dot : item.name.length);
  }, [item]);

  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    if (commit) ex.commitRename(item, ref.current?.value ?? item.name);
    else ex.setRenamingId(null);
    ex.containerRef.current?.focus({ preventScroll: true });
  };

  return (
    <input
      ref={ref}
      defaultValue={item.name}
      onClick={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      }}
      onBlur={() => finish(true)}
      className={cn('w-full min-w-0 bg-background border border-accent rounded-md px-2 py-1 text-sm text-text-primary outline-none ring-2 ring-accent/25', className)}
      aria-label="Nuevo nombre"
    />
  );
}

// ─── Small pieces ───────────────────────────────────────────────────────────

function AudioBadges({ item }: { item: DriveItem }) {
  if (!item.bpm && !item.musicalKey) return null;
  return (
    <>
      {item.bpm && (
        <span className={cn('shrink-0 font-mono text-[10px] font-bold px-1.5 py-px rounded border', bpmTone(item.bpm))}>
          {parseInt(String(item.bpm), 10) || item.bpm} BPM
        </span>
      )}
      {item.musicalKey && (
        <span className="shrink-0 font-mono text-[10px] font-bold px-1.5 py-px rounded border text-violet-400 bg-violet-500/10 border-violet-500/20">
          {item.musicalKey}
        </span>
      )}
    </>
  );
}

function StatusIcons({ item }: { item: DriveItem }) {
  const ex = useExplorer();
  return (
    <>
      {item.starred && <Star className="w-3.5 h-3.5 shrink-0 text-amber-400 fill-amber-400" aria-label="Destacado" />}
      {item.shared && <Users className="w-3.5 h-3.5 shrink-0 text-text-secondary" aria-label="Compartido" />}
      {item.expiresAt && (
        <span onClick={e => { e.stopPropagation(); ex.setDeleteDialog([item]); }} className="shrink-0">
          <RealtimeCountdown expiresAt={item.expiresAt} />
        </span>
      )}
    </>
  );
}

function PlayButton({ item, className }: { item: DriveItem; className?: string }) {
  const ex = useExplorer();
  const active = ex.currentTrackId === item.id;
  const playing = active && ex.isPlaying;
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); ex.play(item); }}
      onDoubleClick={e => e.stopPropagation()}
      className={cn(
        'rounded-full flex items-center justify-center shrink-0 transition-all',
        active ? 'bg-accent text-white shadow-md shadow-accent/30' : 'bg-violet-500/10 text-violet-400 hover:bg-accent hover:text-white',
        className,
      )}
      aria-label={playing ? 'Pausar' : 'Reproducir'}
      title={playing ? 'Pausar' : 'Reproducir'}
    >
      {playing ? <Pause className="w-[45%] h-[45%] fill-current" /> : <Play className="w-[45%] h-[45%] fill-current translate-x-[6%]" />}
    </button>
  );
}

function MoreButton({ item, className }: { item: DriveItem; className?: string }) {
  const ex = useExplorer();
  return (
    <button
      type="button"
      onClick={e => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        ex.showItemMenu(rect.right - 200, rect.bottom + 4, item);
      }}
      onDoubleClick={e => e.stopPropagation()}
      className={cn('flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface transition-colors', className)}
      aria-label={`Acciones de ${item.name}`}
      title="Más acciones"
    >
      <MoreVertical className="w-4 h-4" />
    </button>
  );
}

function SelectCheck({ item, visible }: { item: DriveItem; visible: boolean }) {
  const ex = useExplorer();
  const checked = ex.selectedSet.has(item.id);
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); ex.toggleSelected(item.id); }}
      onDoubleClick={e => e.stopPropagation()}
      className={cn(
        'w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all',
        checked ? 'bg-accent border-accent text-white' : 'border-border bg-surface-elevated hover:border-accent',
        visible || checked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100',
      )}
      aria-label={checked ? 'Deseleccionar' : 'Seleccionar'}
      aria-pressed={checked}
    >
      {checked && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
    </button>
  );
}

function useItemInteractionProps(item: DriveItem) {
  const ex = useExplorer();
  const dropProps = item.isFolder && ex.view !== 'trash' ? ex.getFolderDropProps(item.id, { springLoad: true }) : {};
  return {
    'data-item-id': item.id,
    style: { scrollMarginTop: 'calc(var(--x-top) + var(--x-toolbar) + 44px)', scrollMarginBottom: '96px' } as React.CSSProperties,
    role: 'option',
    'aria-selected': ex.selectedSet.has(item.id),
    draggable: ex.canHover && ex.renamingId !== item.id && ex.view !== 'trash',
    onPointerDown: ex.onItemPointerDown,
    onClick: (e: React.MouseEvent) => ex.onItemClick(e, item),
    onDoubleClick: (e: React.MouseEvent) => ex.onItemDoubleClick(e, item),
    onContextMenu: (e: React.MouseEvent) => ex.onItemContextMenu(e, item),
    onDragStart: (e: React.DragEvent) => ex.onItemDragStart(e, item),
    onDragEnd: ex.onDragEnd,
    ...dropProps,
  };
}

// ─── List row ───────────────────────────────────────────────────────────────

const ListRow = memo(function ListRow({ item }: { item: DriveItem }) {
  const ex = useExplorer();
  const props = useItemInteractionProps(item);
  const selected = ex.selectedSet.has(item.id);
  const focused = ex.focusId === item.id;
  const isDrop = ex.dropTargetId === item.id;
  const active = ex.currentTrackId === item.id;
  const renaming = ex.renamingId === item.id;
  const location = ex.showLocation ? ex.locationOf(item) : '';
  const touchSelect = ex.selectionMode;

  const meta = [
    item.isFolder ? null : formatBytes(item.size),
    item.durationMs ? formatDuration(item.durationMs) : null,
  ].filter(Boolean).join(' · ');

  return (
    <div
      {...props}
      className={cn(
        'group relative flex items-center gap-3 px-3 md:px-4 min-h-[60px] md:min-h-[52px] cursor-default select-none border-b border-border/40 last:border-b-0 transition-colors',
        selected ? 'bg-accent/10' : 'hover:bg-surface/70',
        focused && ex.canHover && 'shadow-[inset_2px_0_0_var(--accent)]',
        isDrop && 'bg-accent/15 ring-2 ring-inset ring-accent',
        ex.highlightId === item.id && 'animate-pulse bg-accent/20',
      )}
    >
      {(ex.canHover || touchSelect) && <SelectCheck item={item} visible={touchSelect || ex.selectedIds.length > 1} />}

      {item.kind === 'audio' && ex.view !== 'trash' ? (
        <PlayButton item={item} className="w-10 h-10 md:w-9 md:h-9" />
      ) : (
        <div className="w-10 h-10 md:w-9 md:h-9 shrink-0 rounded-lg overflow-hidden flex items-center justify-center">
          {['image', 'video'].includes(item.kind)
            ? <Thumbnail item={item} size={96} className="w-full h-full rounded-lg" iconClassName="w-5 h-5" />
            : <KindIcon item={item} className="w-6 h-6" />}
        </div>
      )}

      <div className="flex-1 min-w-0 md:grid md:grid-cols-[minmax(0,1fr)_150px_90px] md:items-center md:gap-4">
        <div className="min-w-0">
          {renaming ? (
            <RenameInput item={item} />
          ) : (
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={cn('truncate text-sm font-medium', active ? 'text-accent' : 'text-text-primary')} title={item.name}>
                {item.name}
              </span>
              <span className="hidden sm:contents"><AudioBadges item={item} /></span>
              <StatusIcons item={item} />
            </div>
          )}
          {/* Phone / narrow layout: all metadata in one secondary line */}
          <div className="md:hidden flex items-center gap-1.5 mt-0.5 text-[11px] text-text-secondary min-w-0">
            <span className="sm:hidden contents"><AudioBadges item={item} /></span>
            <span className="truncate">
              {[location && `en ${location}`, ex.view === 'trash' ? `Eliminado ${formatShortDate(item.trashedTime)}` : formatShortDate(item.modifiedTime), meta].filter(Boolean).join(' · ')}
            </span>
          </div>
          {location && (
            <div className="hidden md:block text-[11px] text-text-secondary truncate mt-0.5">en {location}</div>
          )}
        </div>
        <div className="hidden md:block text-xs text-text-secondary truncate">
          {ex.view === 'trash' ? formatShortDate(item.trashedTime) : formatShortDate(item.modifiedTime)}
        </div>
        <div className="hidden md:block text-xs text-text-secondary text-right tabular-nums">
          {item.isFolder ? '—' : formatBytes(item.size)}
        </div>
      </div>

      <MoreButton
        item={item}
        className={cn('w-10 h-10 md:w-8 md:h-8 -mr-1', ex.canHover && 'md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100', selected && 'md:opacity-100')}
      />
    </div>
  );
});

// ─── Grid card ──────────────────────────────────────────────────────────────

const GridCard = memo(function GridCard({ item }: { item: DriveItem }) {
  const ex = useExplorer();
  const props = useItemInteractionProps(item);
  const selected = ex.selectedSet.has(item.id);
  const focused = ex.focusId === item.id;
  const isDrop = ex.dropTargetId === item.id;
  const renaming = ex.renamingId === item.id;
  const active = ex.currentTrackId === item.id;

  return (
    <div
      {...props}
      className={cn(
        'group relative flex flex-col rounded-2xl border bg-surface/60 overflow-hidden cursor-default select-none transition-all',
        selected ? 'border-accent ring-2 ring-accent/30 bg-accent/5' : 'border-border/60 hover:border-accent/40 hover:bg-surface',
        focused && ex.canHover && !selected && 'border-accent/50',
        isDrop && 'ring-2 ring-accent border-accent bg-accent/10 scale-[1.02]',
        ex.highlightId === item.id && 'animate-pulse ring-2 ring-accent',
      )}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden">
        {item.isFolder ? (
          <div className="w-full h-full flex items-center justify-center bg-surface-elevated/60">
            <KindIcon item={item} className="w-14 h-14" />
          </div>
        ) : item.kind === 'audio' ? (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-violet-500/20 via-accent/10 to-transparent">
            {ex.view === 'trash' ? <KindIcon item={item} className="w-10 h-10" /> : <PlayButton item={item} className="w-14 h-14" />}
          </div>
        ) : (
          <Thumbnail item={item} size={480} className="w-full h-full" iconClassName="w-10 h-10" />
        )}

        <div className="absolute top-2 left-2">
          {(ex.canHover || ex.selectionMode) && <SelectCheck item={item} visible={ex.selectionMode || ex.selectedIds.length > 1} />}
        </div>
        <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
          {item.starred && <Star className="w-4 h-4 text-amber-400 fill-amber-400 drop-shadow" />}
          <MoreButton
            item={item}
            className={cn('w-8 h-8 bg-surface-elevated/90 backdrop-blur border border-border/50', ex.canHover && 'opacity-0 group-hover:opacity-100 focus:opacity-100', selected && 'opacity-100')}
          />
        </div>
        {item.expiresAt && (
          <div className="absolute bottom-2 left-2" onClick={e => { e.stopPropagation(); ex.setDeleteDialog([item]); }}>
            <RealtimeCountdown expiresAt={item.expiresAt} />
          </div>
        )}
        {item.durationMs ? (
          <span className="absolute bottom-2 right-2 text-[10px] font-mono bg-black/60 text-white px-1.5 py-0.5 rounded">{formatDuration(item.durationMs)}</span>
        ) : null}
      </div>

      <div className="px-3 py-2.5 min-w-0">
        {renaming ? (
          <RenameInput item={item} className="text-xs" />
        ) : (
          <p className={cn('text-[13px] font-medium truncate', active ? 'text-accent' : 'text-text-primary')} title={item.name}>{item.name}</p>
        )}
        <div className="flex items-center gap-1.5 mt-1 text-[11px] text-text-secondary min-w-0">
          {item.kind === 'audio' && (item.bpm || item.musicalKey) ? (
            <AudioBadges item={item} />
          ) : (
            <span className="truncate">
              {item.isFolder ? KIND_LABEL.folder : [formatBytes(item.size), formatShortDate(item.modifiedTime)].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>
        {ex.showLocation && <p className="text-[10px] text-text-secondary/80 truncate mt-0.5">en {ex.locationOf(item)}</p>}
      </div>
    </div>
  );
});

// ─── Headers, empty states ──────────────────────────────────────────────────

function SortHeader({ field, label, className }: { field: SortField; label: string; className?: string }) {
  const ex = useExplorer();
  const active = ex.sortField === field;
  const locked = ex.view === 'recent' || ex.view === 'scheduled' || ex.view === 'trash';
  return (
    <button
      type="button"
      disabled={locked}
      onClick={() => {
        if (active) ex.setSortDir(ex.sortDir === 'asc' ? 'desc' : 'asc');
        else {
          ex.setSortField(field);
          ex.setSortDir(field === 'name' ? 'asc' : 'desc');
        }
      }}
      className={cn('flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider transition-colors disabled:pointer-events-none', active && !locked ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary', className)}
    >
      {label}
      {active && !locked && (ex.sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
    </button>
  );
}

function EmptyState() {
  const ex = useExplorer();
  if (ex.query.trim()) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 px-6">
        <SearchX className="w-10 h-10 text-text-secondary/50 mb-3" />
        <p className="text-sm font-semibold text-text-primary">Sin resultados para “{ex.query.trim()}”</p>
        <p className="text-xs text-text-secondary mt-1 max-w-xs">
          {ex.isSearchingEverywhere ? 'Se ha buscado en todas las carpetas.' : ex.index.status === 'loading' ? 'Buscando también en subcarpetas…' : 'Prueba con otras palabras o quita el filtro de tipo.'}
        </p>
      </div>
    );
  }
  const messages: Record<string, [string, string]> = {
    folder: ['Esta carpeta está vacía', 'Arrastra archivos aquí o usa “Subir”.'],
    recent: ['Aún no hay archivos', 'Los últimos archivos modificados aparecerán aquí.'],
    audio: ['No hay audios', 'Todos los audios del perfil, estén en la carpeta que estén, aparecerán aquí.'],
    starred: ['Nada destacado todavía', 'Marca con estrella lo importante para tenerlo siempre a mano.'],
    scheduled: ['Nada programado', 'Los archivos con autodestrucción aparecerán aquí con su cuenta atrás.'],
    trash: ['La papelera está vacía', 'Lo que elimines se puede restaurar desde aquí.'],
  };
  const [title, text] = messages[ex.view];
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center mb-3">
        <FolderOpen className="w-7 h-7 text-accent" />
      </div>
      <p className="text-sm font-semibold text-text-primary">{ex.typeFilter !== 'all' ? 'Nada de este tipo aquí' : title}</p>
      <p className="text-xs text-text-secondary mt-1 max-w-xs">{ex.typeFilter !== 'all' ? 'Quita el filtro para ver todo.' : text}</p>
      {ex.view === 'folder' && ex.typeFilter === 'all' && (
        <button
          type="button"
          onClick={() => ex.pickFiles()}
          className="mt-4 inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent/90 transition-colors"
        >
          <UploadCloud className="w-4 h-4" /> Subir archivos
        </button>
      )}
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="divide-y divide-border/40">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 h-[56px]">
          <div className="w-9 h-9 rounded-lg bg-surface animate-pulse" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 rounded bg-surface animate-pulse" style={{ width: `${40 + ((i * 17) % 45)}%` }} />
            <div className="h-2.5 w-24 rounded bg-surface/70 animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main view ──────────────────────────────────────────────────────────────

export function ItemsView() {
  const ex = useExplorer();
  const gridRef = useRef<HTMLDivElement>(null);

  // Keep the keyboard focus visible
  useEffect(() => {
    if (!ex.focusId) return;
    const el = ex.containerRef.current?.querySelector(`[data-item-id="${CSS.escape(ex.focusId)}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [ex.focusId, ex.containerRef]);

  // Grid column count for arrow-key navigation
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const measure = () => {
      const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length;
      ex.gridColumnsRef.current = cols || 1;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(grid);
    return () => ro.disconnect();
  }, [ex.viewMode, ex.visibleItems.length, ex.gridColumnsRef]);

  const onBackgroundClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !e.shiftKey && !e.ctrlKey && !e.metaKey) ex.clearSelection();
  };
  const onBackgroundContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    ex.showBackgroundMenu(e.clientX, e.clientY);
  };

  if (ex.error && ex.visibleItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 px-6" onContextMenu={onBackgroundContextMenu}>
        <AlertCircle className="w-10 h-10 text-error mb-3" />
        <p className="text-sm font-semibold text-text-primary">No se pudo cargar</p>
        <p className="text-xs text-text-secondary mt-1 max-w-sm break-words">{ex.error}</p>
        <button type="button" onClick={ex.refresh} className="mt-4 inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-border text-sm font-medium hover:bg-surface transition-colors">
          <RefreshCw className="w-4 h-4" /> Reintentar
        </button>
      </div>
    );
  }

  if (ex.isLoading) return <SkeletonRows />;

  if (ex.visibleItems.length === 0) {
    return <div className="min-h-[320px] h-full" onContextMenu={onBackgroundContextMenu} onClick={onBackgroundClick}><EmptyState /></div>;
  }

  const searchingMore = ex.query.trim() && !ex.isSearchingEverywhere && ex.view === 'folder' && ex.index.status === 'loading';

  if (ex.viewMode === 'grid') {
    return (
      <div className="min-h-full" onClick={onBackgroundClick} onContextMenu={onBackgroundContextMenu}>
        {searchingMore && <SearchingMore />}
        <div
          ref={gridRef}
          role="listbox"
          aria-multiselectable
          aria-label={ex.view === 'folder' ? ex.currentFolderName : VIEW_LABEL[ex.view]}
          onClick={onBackgroundClick}
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3 p-3 md:p-4"
        >
          {ex.visibleItems.map(item => <GridCard key={item.id} item={item} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full flex flex-col" onContextMenu={onBackgroundContextMenu}>
      <div className="hidden md:flex items-center gap-3 px-4 h-9 border-b border-border/60 sticky top-[calc(var(--x-top)+var(--x-toolbar))] z-[15] bg-surface-elevated/95 backdrop-blur">
        {ex.canHover && <span className="w-5 shrink-0" />}
        <span className="w-9 shrink-0" />
        <div className="flex-1 grid grid-cols-[minmax(0,1fr)_150px_90px] gap-4 items-center">
          <SortHeader field="name" label="Nombre" />
          <SortHeader field="modified" label={ex.view === 'trash' ? 'Eliminado' : 'Modificado'} />
          <SortHeader field="size" label="Tamaño" className="justify-end" />
        </div>
        <span className="w-8 shrink-0" />
      </div>
      {searchingMore && <SearchingMore />}
      <div role="listbox" aria-multiselectable aria-label={ex.view === 'folder' ? ex.currentFolderName : VIEW_LABEL[ex.view]}>
        {ex.visibleItems.map(item => <ListRow key={item.id} item={item} />)}
      </div>
      <div className="flex-1 min-h-[80px]" onClick={onBackgroundClick} />
    </div>
  );
}

function SearchingMore() {
  return (
    <div className="flex items-center gap-2 px-4 py-2 text-[11px] text-text-secondary border-b border-border/40">
      <Loader2 className="w-3 h-3 animate-spin" /> Buscando también en las subcarpetas…
    </div>
  );
}
