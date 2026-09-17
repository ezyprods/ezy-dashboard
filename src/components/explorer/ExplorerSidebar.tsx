'use client';

import React, { useEffect, useState } from 'react';
import { ChevronRight, Clock, AudioWaveform, Star, Timer, Trash2, HardDrive, Loader2, Home } from 'lucide-react';
import { cn } from '@/lib/utils';
import { findItem, loadFolder, useFolder } from './driveStore';
import { formatBytes, KindIcon } from './fileKinds';
import { useExplorer, VIEW_LABEL } from './useExplorerController';
import type { DriveItem, ExplorerView } from './types';

const QUICK_VIEWS: { view: ExplorerView; icon: React.ElementType; countKey?: 'audio' | 'starred' | 'scheduled' | 'trash' }[] = [
  { view: 'recent', icon: Clock },
  { view: 'audio', icon: AudioWaveform, countKey: 'audio' },
  { view: 'starred', icon: Star, countKey: 'starred' },
  { view: 'scheduled', icon: Timer, countKey: 'scheduled' },
  { view: 'trash', icon: Trash2 },
];

function TreeNode({ item, depth }: { item: Pick<DriveItem, 'id' | 'name' | 'parentId' | 'folderColor'>; depth: number }) {
  const ex = useExplorer();
  const isCurrent = ex.view === 'folder' && ex.folderId === item.id;
  const onPath = ex.view === 'folder' && ex.crumbs.some(c => c.id === item.id);
  const [expanded, setExpanded] = useState(onPath || depth === 0);
  const entry = useFolder(expanded ? item.id : null);
  const children = entry.items.filter(i => i.isFolder).sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
  const knownEmpty = entry.status === 'ready' && children.length === 0;

  useEffect(() => {
    if (onPath) setExpanded(true);
  }, [onPath]);

  const drop = ex.getFolderDropProps(item.id, { springLoad: false });
  const isRoot = item.id === ex.rootId;

  return (
    <div>
      <div
        {...drop}
        role="treeitem"
        aria-expanded={knownEmpty ? undefined : expanded}
        aria-selected={isCurrent}
        onClick={() => ex.openFolder(item)}
        onContextMenu={e => {
          e.preventDefault();
          e.stopPropagation();
          if (isRoot) {
            ex.showBackgroundMenu(e.clientX, e.clientY);
            return;
          }
          const full = findItem(item.id);
          if (full) ex.showItemMenu(e.clientX, e.clientY, full);
        }}
        onMouseEnter={() => { if (!expanded) loadFolder(item.id); }}
        className={cn(
          'group flex items-center gap-1 h-9 lg:h-8 pr-2 rounded-lg cursor-pointer select-none text-sm transition-colors',
          isCurrent ? 'bg-accent/15 text-text-primary font-semibold' : 'text-text-secondary hover:bg-surface hover:text-text-primary',
          ex.dropTargetId === item.id && 'bg-accent/20 ring-2 ring-accent text-text-primary',
        )}
        style={{ paddingLeft: 4 + depth * 14 }}
      >
        <button
          type="button"
          onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
          className={cn('w-6 h-6 flex items-center justify-center rounded shrink-0 hover:bg-surface-elevated', knownEmpty && 'invisible')}
          aria-label={expanded ? 'Contraer' : 'Expandir'}
          tabIndex={-1}
        >
          {entry.status === 'loading' && expanded && children.length === 0
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <ChevronRight className={cn('w-3.5 h-3.5 transition-transform', expanded && 'rotate-90')} />}
        </button>
        {isRoot
          ? <Home className="w-4 h-4 shrink-0 text-accent" />
          : <KindIcon item={{ kind: 'folder', folderColor: item.folderColor, extension: '' }} className="w-4 h-4 shrink-0" />}
        <span className="truncate ml-1">{item.name}</span>
      </div>
      {expanded && children.length > 0 && (
        <div role="group">
          {children.map(child => <TreeNode key={child.id} item={child} depth={depth + 1} />)}
        </div>
      )}
    </div>
  );
}

export function ExplorerSidebarContent() {
  const ex = useExplorer();
  const c = ex.counts;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-2 pt-3 pb-2 space-y-0.5">
        <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-text-secondary/70">Accesos rápidos</p>
        {QUICK_VIEWS.map(({ view, icon: Icon, countKey }) => {
          const active = ex.view === view;
          const count = countKey ? c[countKey] : 0;
          return (
            <button
              key={view}
              type="button"
              onClick={() => ex.setView(view)}
              className={cn(
                'w-full flex items-center gap-2.5 h-10 lg:h-9 px-2.5 rounded-lg text-sm transition-colors',
                active ? 'bg-accent/15 text-text-primary font-semibold' : 'text-text-secondary hover:bg-surface hover:text-text-primary',
              )}
            >
              <Icon className={cn('w-4 h-4 shrink-0', active && 'text-accent', view === 'starred' && active && 'fill-accent/30')} />
              <span className="flex-1 text-left truncate">{VIEW_LABEL[view]}</span>
              {c.ready && count > 0 && (
                <span className={cn('text-[10px] font-bold px-1.5 py-px rounded-full', view === 'scheduled' ? 'bg-warning/15 text-warning' : 'bg-surface text-text-secondary')}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mx-3 border-t border-border/50" />

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 py-2" role="tree" aria-label="Carpetas">
        <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-text-secondary/70">Carpetas</p>
        <TreeNode item={{ id: ex.rootId, name: ex.rootName, parentId: null }} depth={0} />
      </div>

      <div className="px-4 py-3 border-t border-border/50 text-[11px] text-text-secondary flex items-center gap-2">
        <HardDrive className="w-3.5 h-3.5 shrink-0" />
        {c.ready ? (
          <span className="truncate">{c.files} archivos · {c.folders} carpetas · {formatBytes(c.bytes)}</span>
        ) : (
          <span className="flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Analizando…</span>
        )}
      </div>
    </div>
  );
}
