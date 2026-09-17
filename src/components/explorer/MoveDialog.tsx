'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, ChevronLeft, FolderPlus, Loader2, Home, Search } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';
import { customPrompt } from '@/lib/dialog';
import { toast } from 'sonner';
import { apiCreateFolder, getKnownPath, insertItems, isInside, loadFolder, useFolder } from './driveStore';
import { KindIcon, normalizeForSearch, normalizeItem } from './fileKinds';
import { useExplorer } from './useExplorerController';
import { FOLDER_MIME, type Crumb } from './types';

export function MoveDialog() {
  const ex = useExplorer();
  const dialog = ex.moveDialog;
  const [trail, setTrail] = useState<Crumb[]>([{ id: ex.rootId, name: ex.rootName }]);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!dialog) return;
    // Start in the folder that contains the items (or the one being browsed)
    const startId = dialog.items[0]?.parentId || ex.folderId;
    setTrail(getKnownPath(startId, ex.rootId, ex.rootName) || ex.crumbs);
    setFilter('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialog]);

  const current = trail[trail.length - 1];
  const entry = useFolder(dialog ? current.id : null);
  const movingIds = useMemo(() => new Set(dialog?.items.map(i => i.id) || []), [dialog]);

  const folders = useMemo(() => {
    const q = normalizeForSearch(filter.trim());
    return entry.items
      .filter(i => i.isFolder && (!q || normalizeForSearch(i.name).includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
  }, [entry.items, filter]);

  if (!dialog) return null;

  const mode = dialog.mode;
  const count = dialog.items.length;
  const sameParent = dialog.items.every(i => i.parentId === current.id);
  const intoItself = dialog.items.some(i => i.isFolder && (current.id === i.id || isInside(current.id, i.id, ex.rootId) || trail.some(c => c.id === i.id)));
  const disabled = busy || intoItself || (mode === 'move' && sameParent);

  const enter = (crumb: Crumb) => {
    setTrail(prev => [...prev, crumb]);
    setFilter('');
  };

  const createHere = async () => {
    const name = (await customPrompt('Nombre de la nueva carpeta', 'Nueva carpeta', 'Nueva carpeta'))?.trim();
    if (!name) return;
    setBusy(true);
    try {
      const id = await apiCreateFolder(name, current.id);
      const now = new Date().toISOString();
      insertItems([normalizeItem({ id, name, mimeType: FOLDER_MIME, createdTime: now, modifiedTime: now, parentFolderId: current.id }, current.id)], ex.rootId);
      enter({ id, name });
    } catch (err: any) {
      toast.error(`No se pudo crear la carpeta: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    const items = dialog.items;
    ex.setMoveDialog(null);
    try {
      if (mode === 'move') await ex.performMove(items, current.id);
      else await ex.performCopy(items, current.id);
    } finally {
      setBusy(false);
    }
  };

  const title = mode === 'move'
    ? `Mover ${count === 1 ? `"${dialog.items[0].name}"` : `${count} elementos`}`
    : `Copiar ${count === 1 ? `"${dialog.items[0].name}"` : `${count} archivos`}`;

  return (
    <Modal isOpen onClose={() => ex.setMoveDialog(null)} title={title} description="Elige la carpeta de destino" className="md:max-w-xl">
      <div className="flex flex-col gap-3 -mt-1">
        {/* Location bar */}
        <div className="flex items-center gap-1 min-w-0">
          <button
            type="button"
            onClick={() => setTrail(prev => (prev.length > 1 ? prev.slice(0, -1) : prev))}
            disabled={trail.length <= 1}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-text-secondary hover:bg-surface disabled:opacity-30 shrink-0"
            aria-label="Atrás"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center min-w-0 overflow-x-auto scrollbar-hide text-sm">
            {trail.map((c, i) => (
              <React.Fragment key={c.id}>
                {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-text-secondary/50 shrink-0" />}
                <button
                  type="button"
                  onClick={() => setTrail(trail.slice(0, i + 1))}
                  className={cn('px-1.5 py-1 rounded-md whitespace-nowrap', i === trail.length - 1 ? 'font-semibold text-text-primary' : 'text-text-secondary hover:bg-surface')}
                >
                  {i === 0 ? <span className="inline-flex items-center gap-1"><Home className="w-3.5 h-3.5" />{c.name}</span> : c.name}
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>

        {entry.items.filter(i => i.isFolder).length > 8 && (
          <div className="relative">
            <Search className="w-4 h-4 text-text-secondary absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filtrar carpetas…"
              className="w-full h-10 bg-surface border border-border rounded-xl pl-9 pr-3 text-sm focus:outline-none focus:border-accent"
            />
          </div>
        )}

        {/* Folder list */}
        <div className="rounded-xl border border-border/60 overflow-y-auto overscroll-contain h-[min(46dvh,360px)]">
          {entry.status === 'loading' && entry.items.length === 0 ? (
            <div className="h-full flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-accent" /></div>
          ) : folders.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6 text-sm text-text-secondary">
              {filter ? 'Ninguna carpeta coincide' : 'No hay subcarpetas aquí'}
            </div>
          ) : (
            folders.map(folder => {
              const blocked = movingIds.has(folder.id);
              return (
                <button
                  key={folder.id}
                  type="button"
                  disabled={blocked}
                  onClick={() => enter({ id: folder.id, name: folder.name })}
                  onMouseEnter={() => loadFolder(folder.id)}
                  className="w-full flex items-center gap-3 px-3 min-h-[48px] text-left border-b border-border/40 last:border-b-0 hover:bg-surface disabled:opacity-40 disabled:pointer-events-none"
                >
                  <KindIcon item={folder} className="w-5 h-5 shrink-0" />
                  <span className="flex-1 truncate text-sm text-text-primary">{folder.name}</span>
                  {blocked ? <span className="text-[11px] text-text-secondary">Seleccionada</span> : <ChevronRight className="w-4 h-4 text-text-secondary" />}
                </button>
              );
            })
          )}
        </div>

        {intoItself && <p className="text-xs text-error">No puedes mover una carpeta dentro de sí misma.</p>}

        <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2 pt-1">
          <button
            type="button"
            onClick={createHere}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 h-11 sm:h-10 px-3 rounded-xl text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface sm:mr-auto"
          >
            <FolderPlus className="w-4 h-4" /> Nueva carpeta aquí
          </button>
          <button type="button" onClick={() => ex.setMoveDialog(null)} className="h-11 sm:h-10 px-4 rounded-xl border border-border text-sm font-medium hover:bg-surface">
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={disabled}
            className="h-11 sm:h-10 px-5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent/90 disabled:opacity-40 disabled:pointer-events-none inline-flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === 'move' ? (sameParent ? 'Ya está aquí' : `Mover a "${current.name}"`) : `Copiar a "${current.name}"`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
