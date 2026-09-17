'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useAudioControls } from '@/lib/contexts/AudioContext';
import { useContextMenu, type MenuItem } from '@/lib/contexts/ContextMenuContext';
import { useGlobalDragDrop } from '@/lib/contexts/GlobalDragDropContext';
import { customConfirm, customPrompt } from '@/lib/dialog';
import {
  addToTrash, apiCopy, apiCreateFolder, apiDeleteForever, apiSetExpiration, apiShareWith, apiTrash, apiUpdate,
  findItem, getKnownPath, insertItems, isInside, loadFolder, loadIndex, loadTrash, patchItems, readJson,
  rememberPath, removeFromTrash, removeItems, resolvePath, runPool, useFolder, useIndex, useTrash,
} from './driveStore';
import {
  driveUrl, formatBytes, getExtension, getKind, isHiddenItem, KIND_LABEL, matchesQuery, matchesTypeFilter,
  normalizeItem, sortItems, stripExtension, FOLDER_COLORS,
} from './fileKinds';
import { canNativeShare, copyText, downloadFiles, isMac, nativeShare, useMediaQuery, usePreference } from './explorerUtils';
import {
  FOLDER_MIME, type Crumb, type DriveItem, type ExplorerScope, type ExplorerView, type SortDir, type SortField,
  type TypeFilter, type ViewMode,
} from './types';

export const VIEWS: ExplorerView[] = ['folder', 'recent', 'audio', 'starred', 'scheduled', 'trash'];

export const VIEW_LABEL: Record<ExplorerView, string> = {
  folder: 'Archivos',
  recent: 'Recientes',
  audio: 'Audios',
  starred: 'Destacados',
  scheduled: 'Eliminación programada',
  trash: 'Papelera',
};

export const INTERNAL_DRAG_TYPE = 'application/x-ezy-drive-items';

interface UndoEntry {
  id: number;
  label: string;
  run: () => Promise<void>;
}

export interface ExplorerProps {
  rootId: string;
  rootName: string;
  scope: ExplorerScope;
}

const MOD = () => (isMac() ? '⌘' : 'Ctrl+');

export function useExplorerController({ rootId, rootName, scope }: ExplorerProps) {
  const searchParams = useSearchParams();
  const { showMenu } = useContextMenu();
  const { currentTrack, isPlaying, playTrack, togglePlay } = useAudioControls();

  // ─── Layout & preferences ────────────────────────────────────────────────
  const isXL = useMediaQuery('(min-width: 1280px)');
  const isLg = useMediaQuery('(min-width: 1024px)');
  const canHover = useMediaQuery('(hover: hover) and (pointer: fine)', true);
  const [viewMode, setViewMode] = usePreference<ViewMode>('viewMode', 'list');
  const [sortField, setSortField] = usePreference<SortField>('sortField', 'modified');
  const [sortDir, setSortDir] = usePreference<SortDir>('sortDir', 'desc');
  const [sidebarCollapsed, setSidebarCollapsed] = usePreference<boolean>('sidebarCollapsed', false);
  const [inspectorVisible, setInspectorVisible] = usePreference<boolean>('inspector', true);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [query, setQuery] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ─── URL state (browser back/forward walks the folder history) ──────────
  const urlView = searchParams.get('view') as ExplorerView | null;
  const view: ExplorerView = urlView && VIEWS.includes(urlView) ? urlView : 'folder';
  const folderId = (view === 'folder' && searchParams.get('folderId')) || rootId;
  const urlHighlight = searchParams.get('fileId') || searchParams.get('highlight');

  const setUrl = useCallback((params: { folderId?: string | null; view?: ExplorerView | null; highlight?: string | null }, mode: 'push' | 'replace' = 'push') => {
    const url = new URL(window.location.href);
    const sp = url.searchParams;
    if ('folderId' in params) {
      if (params.folderId && params.folderId !== rootId) sp.set('folderId', params.folderId);
      else sp.delete('folderId');
    }
    if ('view' in params) {
      if (params.view && params.view !== 'folder') sp.set('view', params.view);
      else sp.delete('view');
    }
    if ('highlight' in params) {
      sp.delete('highlight');
      if (params.highlight) sp.set('fileId', params.highlight);
      else sp.delete('fileId');
    }
    const qs = sp.toString();
    const next = `${url.pathname}${qs ? `?${qs}` : ''}${url.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next === current) return;
    if (mode === 'push') window.history.pushState(null, '', next);
    else window.history.replaceState(null, '', next);
  }, [rootId]);

  // ─── Data ────────────────────────────────────────────────────────────────
  const folderEntry = useFolder(view === 'folder' ? folderId : null);
  // The recursive index powers search-everywhere, recents, the audio library, starred…
  // It is loaded once the visible folder is on screen so the first paint stays fast.
  const needsIndexNow = view !== 'folder' || query.trim().length > 0;
  const [indexEnabled, setIndexEnabled] = useState(false);
  useEffect(() => {
    if (indexEnabled) return;
    if (needsIndexNow) { setIndexEnabled(true); return; }
    if (folderEntry.status === 'ready' || folderEntry.status === 'error') {
      const t = setTimeout(() => setIndexEnabled(true), 1200);
      return () => clearTimeout(t);
    }
  }, [indexEnabled, needsIndexNow, folderEntry.status]);
  const index = useIndex(rootId, indexEnabled);
  const trash = useTrash(rootId, view === 'trash');

  // Revalidate when coming back to the tab, and after uploads made anywhere in the app
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      loadFolder(folderId);
      if (indexEnabled) loadIndex(rootId);
    };
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const onRefresh = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        loadFolder(folderId, { force: true });
        loadIndex(rootId, { force: true });
      }, 700);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('recentfiles:refresh', onRefresh);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('recentfiles:refresh', onRefresh);
      if (debounce) clearTimeout(debounce);
    };
  }, [folderId, rootId, indexEnabled]);

  // ─── Breadcrumbs ─────────────────────────────────────────────────────────
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: rootId, name: rootName }]);
  const resolvingRef = useRef<string | null>(null);
  useEffect(() => {
    const known = getKnownPath(folderId, rootId, rootName);
    if (known) {
      setCrumbs(known);
      return;
    }
    setCrumbs(prev => (prev[prev.length - 1]?.id === folderId ? prev : [{ id: rootId, name: rootName }, { id: folderId, name: '…' }]));
    if (resolvingRef.current === folderId) return;
    resolvingRef.current = folderId;
    resolvePath(folderId, rootId, rootName)
      .then(trail => {
        if (resolvingRef.current === folderId) setCrumbs(trail);
      })
      .catch(() => {
        if (resolvingRef.current !== folderId) return;
        toast.error('Esa carpeta no existe o no pertenece a este perfil');
        setUrl({ folderId: null, highlight: null }, 'replace');
      })
      .finally(() => {
        if (resolvingRef.current === folderId) resolvingRef.current = null;
      });
  }, [folderId, rootId, rootName, index.items, setUrl]);

  // Special folders: the artist's "Bounces" folder (where Smart Upload stores bounces) and
  // the personal project's "01_Bounces_y_Demos".
  const rootEntry = useFolder(rootId);
  const bouncesFolder = useMemo(() => {
    const folders = rootEntry.items.filter(i => i.isFolder);
    return folders.find(f => /^bounces?$/i.test(f.name.trim()))
      || folders.find(f => /bounce/i.test(f.name))
      || null;
  }, [rootEntry.items]);
  const starredFolders = useMemo(
    () => index.items.filter(i => i.isFolder && i.starred).sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true })),
    [index.items],
  );

  const currentFolderName = view === 'folder' ? (crumbs[crumbs.length - 1]?.name || rootName) : VIEW_LABEL[view];

  // ─── Visible items ───────────────────────────────────────────────────────
  const trimmedQuery = query.trim();
  const indexHasData = index.items.length > 0;
  const isSearchingEverywhere = view === 'folder' && !!trimmedQuery && indexHasData;

  const { visibleItems, showLocation, isLoading, error } = useMemo(() => {
    let base: DriveItem[] = [];
    let loading = false;
    let err: string | undefined;
    let location = false;

    const indexLoading = index.status !== 'ready' && index.status !== 'error' && !indexHasData;

    switch (view) {
      case 'folder':
        if (trimmedQuery && indexHasData) {
          base = index.items;
          location = true;
        } else {
          base = folderEntry.items;
          loading = (folderEntry.status === 'loading' || folderEntry.status === 'idle') && folderEntry.items.length === 0;
          err = folderEntry.status === 'error' ? folderEntry.error : undefined;
        }
        break;
      case 'recent':
      case 'audio':
      case 'starred':
      case 'scheduled':
        base = index.items.filter(i =>
          view === 'recent' ? !i.isFolder :
          view === 'audio' ? i.kind === 'audio' :
          view === 'starred' ? i.starred :
          !!i.expiresAt
        );
        loading = indexLoading;
        err = index.status === 'error' && !indexHasData ? index.error : undefined;
        location = true;
        break;
      case 'trash':
        base = trash.items;
        loading = trash.status !== 'ready' && trash.status !== 'error' && trash.items.length === 0;
        err = trash.status === 'error' ? trash.error : undefined;
        location = true;
        break;
    }

    let list = base.filter(i => matchesTypeFilter(i, typeFilter) && (!trimmedQuery || matchesQuery(i, trimmedQuery)));

    if (view === 'recent') {
      list = sortItems(list, 'modified', 'desc', false).slice(0, 200);
    } else if (view === 'scheduled') {
      list = [...list].sort((a, b) => (a.expiresAt ?? 0) - (b.expiresAt ?? 0));
    } else if (view === 'trash') {
      list = [...list].sort((a, b) => new Date(b.trashedTime || 0).getTime() - new Date(a.trashedTime || 0).getTime());
    } else {
      list = sortItems(list, sortField, sortDir, true);
    }

    return { visibleItems: list, showLocation: location, isLoading: loading, error: err };
  }, [view, trimmedQuery, index.items, index.status, index.error, indexHasData, folderEntry, trash, typeFilter, sortField, sortDir]);

  const locationOf = useCallback((item: DriveItem): string => {
    if (!item.parentId) return '';
    if (item.parentId === rootId) return rootName;
    return findItem(item.parentId)?.name || '';
  }, [rootId, rootName]);

  const counts = useMemo(() => {
    const files = index.items.filter(i => !i.isFolder);
    return {
      ready: indexHasData,
      files: files.length,
      folders: index.items.length - files.length,
      bytes: files.reduce((sum, f) => sum + (f.size || 0), 0),
      audio: files.filter(f => f.kind === 'audio').length,
      starred: index.items.filter(i => i.starred).length,
      scheduled: index.items.filter(i => i.expiresAt).length,
      trash: trash.items.length,
    };
  }, [index.items, indexHasData, trash.items.length]);

  // ─── Selection ───────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const anchorRef = useRef<string | null>(null);

  useEffect(() => {
    setSelectedIds([]);
    setFocusId(null);
    anchorRef.current = null;
    setSelectionMode(false);
  }, [folderId, view]);

  // Drop ids that disappeared (deleted, moved, filtered out)
  useEffect(() => {
    const ids = new Set(visibleItems.map(i => i.id));
    setSelectedIds(prev => (prev.every(id => ids.has(id)) ? prev : prev.filter(id => ids.has(id))));
  }, [visibleItems]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedItems = useMemo(() => visibleItems.filter(i => selectedSet.has(i.id)), [visibleItems, selectedSet]);

  const selectOnly = useCallback((id: string) => {
    setSelectedIds([id]);
    setFocusId(id);
    anchorRef.current = id;
  }, []);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
    setFocusId(id);
    anchorRef.current = id;
  }, []);

  const selectRange = useCallback((toId: string, additive: boolean) => {
    const anchor = anchorRef.current ?? toId;
    const a = visibleItems.findIndex(i => i.id === anchor);
    const b = visibleItems.findIndex(i => i.id === toId);
    if (a < 0 || b < 0) return selectOnly(toId);
    const range = visibleItems.slice(Math.min(a, b), Math.max(a, b) + 1).map(i => i.id);
    setSelectedIds(prev => (additive ? Array.from(new Set([...prev, ...range])) : range));
    setFocusId(toId);
  }, [visibleItems, selectOnly]);

  const selectAll = useCallback(() => {
    setSelectedIds(visibleItems.map(i => i.id));
  }, [visibleItems]);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
    setSelectionMode(false);
  }, []);

  // ─── Deep link highlight (?fileId=) ──────────────────────────────────────
  const [highlightId, setHighlightId] = useState<string | null>(null);
  useEffect(() => {
    if (!urlHighlight) return;
    if (visibleItems.some(i => i.id === urlHighlight)) {
      selectOnly(urlHighlight);
      setHighlightId(urlHighlight);
      setUrl({ highlight: null }, 'replace');
      const t = setTimeout(() => setHighlightId(null), 2600);
      return () => clearTimeout(t);
    }
  }, [urlHighlight, visibleItems, selectOnly, setUrl]);

  // ─── Modal state ─────────────────────────────────────────────────────────
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [shareItem, setShareItem] = useState<DriveItem | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<DriveItem[] | null>(null);
  const [moveDialog, setMoveDialog] = useState<{ items: DriveItem[]; mode: 'move' | 'copy' } | null>(null);
  const [detailsSheetId, setDetailsSheetId] = useState<string | null>(null);
  const [miniDawItem, setMiniDawItem] = useState<DriveItem | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<string>(rootId);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gridColumnsRef = useRef(1);

  // ─── Undo ────────────────────────────────────────────────────────────────
  const undoStack = useRef<UndoEntry[]>([]);
  const undoSeq = useRef(0);

  const runUndo = useCallback(async (entry: UndoEntry) => {
    undoStack.current = undoStack.current.filter(e => e.id !== entry.id);
    const t = toast.loading('Deshaciendo…');
    try {
      await entry.run();
      toast.success(`Deshecho: ${entry.label}`, { id: t });
    } catch (err: any) {
      toast.error(`No se pudo deshacer: ${err.message}`, { id: t });
    }
  }, []);

  const notify = useCallback((message: string, undo?: { label: string; run: () => Promise<void> }) => {
    if (!undo) {
      toast.success(message);
      return;
    }
    const entry: UndoEntry = { id: ++undoSeq.current, ...undo };
    undoStack.current = [...undoStack.current.slice(-29), entry];
    toast.success(message, { action: { label: 'Deshacer', onClick: () => runUndo(entry) }, duration: 7000 });
  }, [runUndo]);

  const undoLast = useCallback(() => {
    const entry = undoStack.current[undoStack.current.length - 1];
    if (!entry) {
      toast('No hay nada que deshacer');
      return;
    }
    runUndo(entry);
  }, [runUndo]);

  const describe = (items: DriveItem[]) => (items.length === 1 ? `"${items[0].name}"` : `${items.length} elementos`);

  // ─── Navigation ──────────────────────────────────────────────────────────
  /** After changing folder, bring the top of the explorer back into view if the page was scrolled past it. */
  const scrollExplorerIntoView = useCallback(() => {
    const el = containerRef.current;
    const main = document.getElementById('app-main');
    if (!el || !main) return;
    const top = el.getBoundingClientRect().top - main.getBoundingClientRect().top;
    const stickyTop = parseFloat(getComputedStyle(el).getPropertyValue('--x-top')) || 0;
    if (top < stickyTop) main.scrollBy({ top: top - stickyTop - 8, behavior: 'smooth' });
  }, []);

  const folderHref = useCallback((id: string) => {
    if (scope.type === 'artist') return `/artists/${scope.artistId}?tab=files${id !== rootId ? `&folderId=${id}` : ''}`;
    return `/personal-projects/${scope.projectId}?tab=files${id !== rootId ? `&folderId=${id}` : ''}`;
  }, [scope, rootId]);

  const openFolder = useCallback((target: Pick<DriveItem, 'id' | 'name' | 'parentId'> | Crumb, highlight?: string) => {
    const parentId = 'parentId' in target ? target.parentId : null;
    if (parentId) {
      const parentPath = getKnownPath(parentId, rootId, rootName);
      if (parentPath) rememberPath(target.id, [...parentPath, { id: target.id, name: target.name }]);
    }
    setQuery('');
    setDrawerOpen(false);
    setUrl({ folderId: target.id, view: 'folder', highlight: highlight ?? null });
    scrollExplorerIntoView();
  }, [rootId, rootName, setUrl, scrollExplorerIntoView]);

  const openFolderById = useCallback((id: string) => {
    if (id === rootId) return openFolder({ id: rootId, name: rootName });
    const item = findItem(id);
    openFolder(item || { id, name: 'Carpeta' });
  }, [openFolder, rootId, rootName]);

  const goUp = useCallback(() => {
    if (view !== 'folder') return setUrl({ view: 'folder', folderId: null });
    if (crumbs.length > 1) openFolder(crumbs[crumbs.length - 2]);
  }, [view, crumbs, openFolder, setUrl]);

  const setView = useCallback((next: ExplorerView) => {
    setQuery('');
    setTypeFilter('all');
    setDrawerOpen(false);
    setUrl({ view: next, folderId: null, highlight: null });
  }, [setUrl]);

  const openBounces = useCallback(async () => {
    if (bouncesFolder) return openFolder(bouncesFolder);
    if (rootEntry.status !== 'ready') {
      await loadFolder(rootId, { force: true });
    }
    const name = scope.type === 'personal' ? '01_Bounces_y_Demos' : 'Bounces';
    const ok = await customConfirm(
      `Todavía no existe la carpeta "${name}" en ${rootName}. La Subida inteligente guarda ahí los bounces. ¿Quieres crearla ahora?`,
      'Crear carpeta de bounces',
    );
    if (!ok) return;
    try {
      const id = await apiCreateFolder(name, rootId);
      const now = new Date().toISOString();
      insertItems([normalizeItem({ id, name, mimeType: FOLDER_MIME, createdTime: now, modifiedTime: now, parentFolderId: rootId }, rootId)], rootId);
      openFolder({ id, name, parentId: rootId });
    } catch (err: any) {
      toast.error(`No se pudo crear la carpeta: ${err.message}`);
    }
  }, [bouncesFolder, rootEntry.status, rootId, rootName, scope.type, openFolder]);

  const revealInFolder = useCallback((item: DriveItem) => {
    if (!item.parentId) return;
    openFolder({ id: item.parentId, name: locationOf(item) || 'Carpeta', parentId: findItem(item.parentId)?.parentId ?? null }, item.id);
  }, [openFolder, locationOf]);

  // ─── Opening & previewing ────────────────────────────────────────────────
  const play = useCallback((item: DriveItem) => {
    if (currentTrack?.id === item.id) {
      togglePlay();
      return;
    }
    const parentPath = (item.parentId && getKnownPath(item.parentId, rootId, rootName)) || [{ id: rootId, name: rootName }];
    const base = scope.type === 'artist' ? [{ name: 'Artistas', url: '/artists' }] : [{ name: 'Proyectos personales', url: '/personal-projects' }];
    playTrack({
      id: item.id,
      name: stripExtension(item.name),
      url: `/api/audio/${item.id}`,
      pathSegments: [...base, ...parentPath.map(c => ({ name: c.name, url: folderHref(c.id) })), { name: stripExtension(item.name) }],
      bpm: item.bpm,
      musicalKey: item.musicalKey,
    });
  }, [currentTrack?.id, togglePlay, playTrack, rootId, rootName, scope.type, folderHref]);

  const preview = useCallback((item: DriveItem) => {
    if (item.isFolder) return;
    setPreviewId(item.id);
  }, []);

  const open = useCallback((item: DriveItem) => {
    if (view === 'trash') {
      setPreviewId(item.isFolder ? null : item.id);
      return;
    }
    if (item.isFolder) return openFolder(item);
    if (item.kind === 'audio') return play(item);
    preview(item);
  }, [view, openFolder, play, preview]);

  const openDetails = useCallback((item?: DriveItem) => {
    if (item) selectOnly(item.id);
    if (isXL) {
      setInspectorVisible(true);
    } else {
      setDetailsSheetId(item ? item.id : '__folder__');
    }
  }, [isXL, selectOnly, setInspectorVisible]);

  // ─── Mutations ───────────────────────────────────────────────────────────
  const commitRename = useCallback(async (item: DriveItem, rawName: string) => {
    setRenamingId(null);
    const name = rawName.trim();
    if (!name || name === item.name) return;
    const oldName = item.name;
    const patch = (n: string) => patchItems([item.id], { name: n, kind: getKind(item.mimeType, n), extension: getExtension(n) });
    patch(name);
    try {
      await apiUpdate(item.id, { name });
      notify(`Renombrado a "${name}"`, {
        label: 'renombrar',
        run: async () => {
          patch(oldName);
          await apiUpdate(item.id, { name: oldName });
        },
      });
    } catch (err: any) {
      patch(oldName);
      toast.error(`No se pudo renombrar: ${err.message}`);
    }
  }, [notify]);

  const startRename = useCallback((item: DriveItem) => {
    selectOnly(item.id);
    setRenamingId(item.id);
  }, [selectOnly]);

  const performMove = useCallback(async (items: DriveItem[], targetId: string) => {
    const intoItself = items.filter(i => i.isFolder && isInside(targetId, i.id, rootId));
    if (intoItself.length > 0) {
      toast.error('No puedes mover una carpeta dentro de sí misma');
    }
    const valid = items.filter(i => i.parentId !== targetId && !intoItself.includes(i));
    if (valid.length === 0) return;

    const targetName = targetId === rootId ? rootName : (findItem(targetId)?.name || 'la carpeta');
    const originals = valid.map(i => ({ ...i }));
    removeItems(valid.map(i => i.id));
    insertItems(valid.map(i => ({ ...i, parentId: targetId })), rootId);
    setSelectedIds([]);

    const failures = await runPool(originals, 4, i => apiUpdate(i.id, { newParentId: targetId, oldParentId: i.parentId }));
    const failedIds = new Set(failures.map(f => f.item.id));
    if (failures.length > 0) {
      const failed = originals.filter(i => failedIds.has(i.id));
      removeItems(failed.map(i => i.id));
      insertItems(failed, rootId);
      toast.error(`No se pudieron mover ${failures.length} elemento(s): ${failures[0].error.message}`);
    }
    const moved = originals.filter(i => !failedIds.has(i.id));
    if (moved.length === 0) return;
    loadFolder(targetId, { force: true });

    notify(`${describe(moved)} movido${moved.length > 1 ? 's' : ''} a "${targetName}"`, {
      label: 'mover',
      run: async () => {
        removeItems(moved.map(i => i.id));
        insertItems(moved, rootId);
        const undoFailures = await runPool(moved, 4, i => apiUpdate(i.id, { newParentId: i.parentId, oldParentId: targetId }));
        if (undoFailures.length) throw undoFailures[0].error;
      },
    });
  }, [rootId, rootName, notify]);

  const performCopy = useCallback(async (items: DriveItem[], targetId?: string) => {
    const files = items.filter(i => !i.isFolder);
    if (files.length === 0) {
      toast.error('Google Drive no permite duplicar carpetas');
      return;
    }
    const t = toast.loading(files.length === 1 ? 'Creando copia…' : `Copiando ${files.length} archivos…`);
    const created: DriveItem[] = [];
    const failures = await runPool(files, 3, async (file) => {
      const raw = await apiCopy(file.id, targetId || file.parentId || undefined);
      created.push(normalizeItem(raw, targetId || file.parentId));
    });
    insertItems(created, rootId);
    if (failures.length) {
      toast.error(`No se pudieron copiar ${failures.length} archivo(s)`, { id: t });
    } else {
      toast.success(created.length === 1 ? `Copia creada: "${created[0].name}"` : `${created.length} copias creadas`, { id: t });
    }
    if (created.length && (!targetId || targetId === folderId)) {
      setSelectedIds(created.map(c => c.id));
    }
  }, [rootId, folderId]);

  const trashItems = useCallback(async (items: DriveItem[]) => {
    if (items.length === 0) return;
    const originals = items.map(i => ({ ...i }));
    const ids = originals.map(i => i.id);
    removeItems(ids);
    setSelectedIds([]);
    if (previewId && ids.includes(previewId)) setPreviewId(null);

    const failures = await runPool(originals, 4, i => apiTrash(i.id));
    const failedIds = new Set(failures.map(f => f.item.id));
    if (failures.length) {
      insertItems(originals.filter(i => failedIds.has(i.id)), rootId);
      toast.error(`No se pudieron eliminar ${failures.length} elemento(s): ${failures[0].error.message}`);
    }
    const done = originals.filter(i => !failedIds.has(i.id));
    if (done.length === 0) return;
    addToTrash(rootId, done);
    notify(`${describe(done)} movido${done.length > 1 ? 's' : ''} a la papelera`, {
      label: 'eliminar',
      run: async () => {
        const undoFailures = await runPool(done, 4, i => apiUpdate(i.id, { trashed: false }));
        const restored = done.filter(i => !undoFailures.some(f => f.item.id === i.id));
        removeFromTrash(restored.map(i => i.id));
        insertItems(restored, rootId);
        if (undoFailures.length) throw undoFailures[0].error;
      },
    });
  }, [rootId, notify, previewId]);

  const restoreItems = useCallback(async (items: DriveItem[]) => {
    if (items.length === 0) return;
    removeFromTrash(items.map(i => i.id));
    setSelectedIds([]);
    const failures = await runPool(items, 4, i => apiUpdate(i.id, { trashed: false }));
    const failedIds = new Set(failures.map(f => f.item.id));
    const restored = items.filter(i => !failedIds.has(i.id));
    insertItems(restored.map(i => ({ ...i, trashedTime: undefined })), rootId);
    if (failures.length) {
      loadTrash(rootId, { force: true });
      toast.error(`No se pudieron restaurar ${failures.length} elemento(s)`);
    }
    if (restored.length) {
      toast.success(`${describe(restored)} restaurado${restored.length > 1 ? 's' : ''}`, {
        action: restored.length === 1 && restored[0].parentId
          ? { label: 'Ver', onClick: () => revealInFolder(restored[0]) }
          : undefined,
      });
      if (restored.some(i => i.isFolder)) loadIndex(rootId, { force: true });
    }
  }, [rootId, revealInFolder]);

  const deleteForever = useCallback(async (items: DriveItem[]) => {
    if (items.length === 0) return;
    const ok = await customConfirm(
      `${describe(items)} se eliminará${items.length > 1 ? 'n' : ''} para siempre de Google Drive. Esta acción no se puede deshacer.`,
      'Eliminar definitivamente',
    );
    if (!ok) return;
    removeFromTrash(items.map(i => i.id));
    setSelectedIds([]);
    const failures = await runPool(items, 4, i => apiDeleteForever(i.id));
    if (failures.length) {
      loadTrash(rootId, { force: true });
      toast.error(`No se pudieron eliminar ${failures.length} elemento(s)`);
    } else {
      toast.success(`${describe(items)} eliminado${items.length > 1 ? 's' : ''} definitivamente`);
    }
  }, [rootId]);

  const toggleStar = useCallback(async (items: DriveItem[]) => {
    if (items.length === 0) return;
    const value = !items.every(i => i.starred);
    const ids = items.map(i => i.id);
    patchItems(ids, { starred: value });
    const failures = await runPool(items, 4, i => apiUpdate(i.id, { starred: value }));
    if (failures.length) {
      patchItems(failures.map(f => f.item.id), { starred: !value });
      toast.error('No se pudo actualizar destacados');
      return;
    }
    notify(value ? `${describe(items)} añadido a destacados` : `${describe(items)} quitado de destacados`, {
      label: value ? 'destacar' : 'quitar destacado',
      run: async () => {
        patchItems(ids, i => ({ starred: items.find(o => o.id === i.id)?.starred ?? !value }));
        await runPool(items, 4, i => apiUpdate(i.id, { starred: i.starred }));
      },
    });
  }, [notify]);

  const setFolderColor = useCallback(async (items: DriveItem[], color: string) => {
    const folders = items.filter(i => i.isFolder);
    if (folders.length === 0) return;
    const previous = new Map(folders.map(f => [f.id, f.folderColor]));
    patchItems(folders.map(f => f.id), { folderColor: color });
    const failures = await runPool(folders, 4, f => apiUpdate(f.id, { folderColorRgb: color }));
    if (failures.length) {
      patchItems(failures.map(f => f.item.id), i => ({ folderColor: previous.get(i.id) }));
      toast.error('No se pudo cambiar el color');
    }
  }, []);

  const cancelSchedule = useCallback(async (items: DriveItem[]) => {
    const scheduled = items.filter(i => i.expiresAt);
    if (scheduled.length === 0) return;
    const previous = new Map(scheduled.map(i => [i.id, i.expiresAt]));
    patchItems(scheduled.map(i => i.id), { expiresAt: null });
    const failures = await runPool(scheduled, 4, i => apiSetExpiration(i.id, null));
    if (failures.length) {
      patchItems(failures.map(f => f.item.id), i => ({ expiresAt: previous.get(i.id) ?? null }));
      toast.error('No se pudo cancelar la eliminación programada');
      return;
    }
    toast.success(scheduled.length === 1 ? 'Eliminación programada cancelada' : `Cancelada la eliminación de ${scheduled.length} archivos`);
  }, []);

  const createFolder = useCallback(async (parentId: string = folderId) => {
    const name = (await customPrompt('Nombre de la nueva carpeta', 'Nueva carpeta', 'Nueva carpeta'))?.trim();
    if (!name) return;
    const t = toast.loading('Creando carpeta…');
    try {
      const id = await apiCreateFolder(name, parentId);
      const now = new Date().toISOString();
      insertItems([normalizeItem({ id, name, mimeType: FOLDER_MIME, createdTime: now, modifiedTime: now, parentFolderId: parentId }, parentId)], rootId);
      toast.success(`Carpeta "${name}" creada`, {
        id: t,
        action: { label: 'Abrir', onClick: () => openFolder({ id, name, parentId }) },
      });
      if (parentId === folderId && view === 'folder') {
        selectOnly(id);
        setHighlightId(id);
        setTimeout(() => setHighlightId(null), 2200);
      }
    } catch (err: any) {
      toast.error(`No se pudo crear la carpeta: ${err.message}`, { id: t });
    }
  }, [folderId, rootId, view, openFolder, selectOnly]);

  const download = useCallback(async (items: DriveItem[]) => {
    const files = items.filter(i => !i.isFolder);
    const folderItems = items.filter(i => i.isFolder);
    let nested: DriveItem[] = [];

    if (folderItems.length > 0) {
      const t = toast.loading('Preparando la descarga…');
      try {
        for (const folder of folderItems) {
          if (indexHasData && isInside(folder.id, rootId, rootId)) {
            nested.push(...index.items.filter(i => !i.isFolder && i.parentId && isInside(i.parentId, folder.id, rootId)));
          } else {
            const data = await readJson(await fetch(`/api/files?folderId=${encodeURIComponent(folder.id)}&recursive=true`));
            nested.push(...(data.items || []).filter((r: any) => !isHiddenItem(r)).map((r: any) => normalizeItem(r, folder.id)).filter((i: DriveItem) => !i.isFolder));
          }
        }
      } catch (err: any) {
        toast.error(`No se pudo leer la carpeta: ${err.message}`, { id: t });
        return;
      }
      toast.dismiss(t);
      nested = nested.filter((f, i, arr) => arr.findIndex(x => x.id === f.id) === i);
      if (nested.length === 0 && files.length === 0) {
        toast.info('No hay archivos que descargar');
        return;
      }
      if (nested.length > 0) {
        const total = nested.reduce((s, f) => s + (f.size || 0), 0);
        const ok = await customConfirm(
          `Se descargarán ${nested.length} archivo${nested.length > 1 ? 's' : ''}${total ? ` (${formatBytes(total)})` : ''} de ${folderItems.length === 1 ? `"${folderItems[0].name}"` : `${folderItems.length} carpetas`}. Se guardan sueltos, sin la estructura de carpetas. Para un ZIP con subcarpetas usa "Abrir en Google Drive".`,
          'Descargar carpeta',
        );
        if (!ok) return;
      }
    }
    downloadFiles([...files, ...nested]);
  }, [index.items, indexHasData, rootId]);

  const openInDrive = useCallback((item: DriveItem) => {
    window.open(driveUrl(item), '_blank', 'noopener,noreferrer');
  }, []);

  const copyLinks = useCallback((items: DriveItem[]) => {
    if (items.length === 0) return;
    copyText(items.map(driveUrl).join('\n'), items.length === 1 ? 'Enlace copiado' : `${items.length} enlaces copiados`);
  }, []);

  const copyDownloadLink = useCallback((item: DriveItem) => {
    copyText(`${window.location.origin}/api/files/${item.id}?download=true`, 'Enlace de descarga directa copiado');
  }, []);

  const shareNative = useCallback(async (item: DriveItem) => {
    const ok = await nativeShare(item.name, driveUrl(item));
    if (!ok) copyLinks([item]);
  }, [copyLinks]);

  const artistEmail = scope.type === 'artist' ? scope.artistEmail : undefined;
  const shareWithArtist = useCallback(async (items: DriveItem[]) => {
    if (!artistEmail || items.length === 0) return;
    const ok = await customConfirm(
      `${describe(items)} se compartirá${items.length > 1 ? 'n' : ''} en modo lectura con ${artistEmail}. Google le enviará un email con el enlace.`,
      'Compartir con el artista',
    );
    if (!ok) return;
    const t = toast.loading('Compartiendo…');
    const failures = await runPool(items, 3, i => apiShareWith(i.id, artistEmail));
    const doneIds = items.filter(i => !failures.some(f => f.item.id === i.id)).map(i => i.id);
    patchItems(doneIds, { shared: true });
    if (failures.length) toast.error(`No se pudo compartir ${failures.length} elemento(s)`, { id: t });
    else toast.success(`Compartido con ${artistEmail}`, { id: t });
  }, [artistEmail]);

  // ─── Upload ──────────────────────────────────────────────────────────────
  const { openSmartUpload } = useGlobalDragDrop();
  const openUpload = useCallback((files: File[], targetFolderId: string = folderId) => {
    if (files.length === 0) return;
    const targetName = targetFolderId === rootId ? rootName : (findItem(targetFolderId)?.name || currentFolderName);
    openSmartUpload({
      files,
      targetType: scope.type,
      artistId: scope.type === 'artist' ? scope.artistId : undefined,
      personalProjectId: scope.type === 'personal' ? scope.projectId : undefined,
      // At the root the Smart Upload routes files automatically (bounces → Bounces, projects…);
      // inside a folder everything goes exactly where the user is.
      folderId: targetFolderId === rootId ? undefined : targetFolderId,
      folderName: targetFolderId === rootId ? undefined : targetName,
      onFinished: () => {
        loadFolder(targetFolderId, { force: true });
        loadIndex(rootId, { force: true });
      },
    });
  }, [folderId, rootId, rootName, currentFolderName, scope, openSmartUpload]);

  const pickFiles = useCallback((targetFolderId: string = folderId) => {
    uploadTargetRef.current = targetFolderId;
    fileInputRef.current?.click();
  }, [folderId]);

  const onFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length) openUpload(files, uploadTargetRef.current);
  }, [openUpload]);

  const refresh = useCallback(() => {
    if (view === 'trash') loadTrash(rootId, { force: true });
    else if (view === 'folder' && !trimmedQuery) loadFolder(folderId, { force: true });
    loadIndex(rootId, { force: true });
  }, [view, rootId, folderId, trimmedQuery]);

  // ─── Menus ───────────────────────────────────────────────────────────────
  const showColorMenu = useCallback((x: number, y: number, items: DriveItem[]) => {
    const current = items.length === 1 ? items[0].folderColor : undefined;
    showMenu(x, y, [
      { heading: 'Color de carpeta' },
      ...FOLDER_COLORS.map(c => ({
        label: c.label,
        icon: 'Circle',
        iconClassName: 'fill-current',
        iconColor: c.value,
        checked: current === c.value,
        action: () => setFolderColor(items, c.value),
      })),
    ]);
  }, [showMenu, setFolderColor]);

  const buildItemMenu = useCallback((targets: DriveItem[], pos: { x: number; y: number }): MenuItem[] => {
    const single = targets.length === 1 ? targets[0] : null;
    const files = targets.filter(t => !t.isFolder);
    const allFolders = targets.every(t => t.isFolder);
    const mod = MOD();

    if (view === 'trash') {
      return [
        { heading: single ? single.name : `${targets.length} elementos` },
        ...(single && !single.isFolder ? [{ label: 'Vista previa', icon: 'Eye', action: () => preview(single) }] : []),
        { label: 'Restaurar', icon: 'RotateCcw', action: () => restoreItems(targets) },
        { separator: true },
        { label: 'Eliminar definitivamente', icon: 'Trash2', variant: 'danger' as const, action: () => deleteForever(targets) },
      ];
    }

    const menu: MenuItem[] = [{ heading: single ? single.name : `${targets.length} elementos seleccionados` }];
    if (!canHover && !selectionMode) {
      menu.push({ label: 'Seleccionar', icon: 'ListChecks', action: () => { setSelectionMode(true); setSelectedIds(targets.map(t => t.id)); } });
    }

    if (single) {
      if (single.isFolder) {
        menu.push({ label: 'Abrir', icon: 'FolderOpen', shortcut: 'Intro', action: () => openFolder(single) });
      } else if (single.kind === 'audio') {
        const playing = currentTrack?.id === single.id && isPlaying;
        menu.push({ label: playing ? 'Pausar' : 'Reproducir', icon: 'Play', shortcut: 'Espacio', action: () => play(single) });
        menu.push({ label: 'Editar en Mini-DAW', icon: 'Scissors', action: () => setMiniDawItem(single) });
      } else {
        menu.push({ label: 'Vista previa', icon: 'Eye', shortcut: 'Espacio', action: () => preview(single) });
      }
      if (view !== 'folder' || trimmedQuery) {
        menu.push({ label: 'Mostrar en su carpeta', icon: 'FolderInput', action: () => revealInFolder(single) });
      }
      menu.push({ separator: true });
    }

    menu.push({
      label: files.length === targets.length && targets.length > 1 ? `Descargar ${targets.length} archivos` : allFolders ? 'Descargar contenido' : 'Descargar',
      icon: 'Download',
      action: () => download(targets),
    });
    if (single) menu.push({ label: 'Abrir en Google Drive', icon: 'HardDrive', action: () => openInDrive(single) });
    menu.push({ separator: true });

    if (single) menu.push({ label: 'Compartir y permisos…', icon: 'Share2', action: () => setShareItem(single) });
    if (artistEmail) menu.push({ label: 'Compartir con el artista', icon: 'Mail', action: () => shareWithArtist(targets) });
    if (single && canNativeShare()) menu.push({ label: 'Enviar enlace…', icon: 'Send', action: () => shareNative(single) });
    menu.push({ label: targets.length > 1 ? 'Copiar enlaces' : 'Copiar enlace', icon: 'Link', action: () => copyLinks(targets) });
    if (single && !single.isFolder) menu.push({ label: 'Copiar enlace de descarga', icon: 'Copy', action: () => copyDownloadLink(single) });
    menu.push({ separator: true });

    if (single) menu.push({ label: 'Renombrar', icon: 'Edit3', shortcut: 'F2', action: () => startRename(single) });
    menu.push({ label: 'Mover a…', icon: 'ArrowRightLeft', action: () => setMoveDialog({ items: targets, mode: 'move' }) });
    if (files.length === targets.length) {
      menu.push({ label: files.length > 1 ? 'Duplicar archivos' : 'Hacer una copia', icon: 'CopyPlus', action: () => performCopy(targets) });
      menu.push({ label: 'Copiar a…', icon: 'FolderInput', action: () => setMoveDialog({ items: targets, mode: 'copy' }) });
    }
    const allStarred = targets.every(t => t.starred);
    menu.push({ label: allStarred ? 'Quitar de destacados' : 'Añadir a destacados', icon: allStarred ? 'StarOff' : 'Star', action: () => toggleStar(targets) });
    if (allFolders) menu.push({ label: 'Color de carpeta…', icon: 'Palette', action: () => setTimeout(() => showColorMenu(pos.x, pos.y, targets), 0) });
    if (single) menu.push({ label: 'Detalles', icon: 'Info', shortcut: `${mod}I`, action: () => openDetails(single) });
    menu.push({ separator: true });

    if (files.length > 0) {
      const scheduled = files.filter(f => f.expiresAt);
      if (scheduled.length === files.length) {
        menu.push({ label: 'Cancelar eliminación programada', icon: 'Undo', action: () => cancelSchedule(files) });
      }
      menu.push({ label: scheduled.length ? 'Cambiar eliminación programada…' : 'Programar eliminación…', icon: 'Timer', action: () => setDeleteDialog(files) });
    }
    menu.push({ label: 'Mover a la papelera', icon: 'Trash2', variant: 'danger', shortcut: 'Supr', action: () => trashItems(targets) });
    return menu;
  }, [view, trimmedQuery, currentTrack?.id, isPlaying, artistEmail, canHover, selectionMode, preview, restoreItems, deleteForever, openFolder, play, revealInFolder, download, openInDrive, shareWithArtist, shareNative, copyLinks, copyDownloadLink, startRename, performCopy, toggleStar, showColorMenu, openDetails, cancelSchedule, trashItems]);

  const showItemMenu = useCallback((x: number, y: number, item: DriveItem) => {
    let targets: DriveItem[];
    if (selectedSet.has(item.id) && selectedIds.length > 1) {
      targets = selectedItems;
    } else {
      targets = [item];
      selectOnly(item.id);
    }
    showMenu(x, y, buildItemMenu(targets, { x, y }));
  }, [selectedSet, selectedIds.length, selectedItems, selectOnly, showMenu, buildItemMenu]);

  const showSortMenu = useCallback((x: number, y: number) => {
    const option = (field: SortField, label: string): MenuItem => ({
      label,
      checked: sortField === field,
      action: () => {
        if (sortField === field) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
        else {
          setSortField(field);
          setSortDir(field === 'name' || field === 'type' ? 'asc' : 'desc');
        }
      },
    });
    showMenu(x, y, [
      { heading: 'Ordenar por' },
      option('name', 'Nombre'),
      option('modified', 'Última modificación'),
      option('size', 'Tamaño'),
      option('type', 'Tipo'),
      { separator: true },
      { label: 'Ascendente', icon: 'ArrowUpDown', checked: sortDir === 'asc', action: () => setSortDir('asc') },
      { label: 'Descendente', icon: 'ArrowUpDown', checked: sortDir === 'desc', action: () => setSortDir('desc') },
    ]);
  }, [showMenu, sortField, sortDir, setSortField, setSortDir]);

  const showBackgroundMenu = useCallback((x: number, y: number) => {
    const mod = MOD();
    if (view === 'trash') {
      showMenu(x, y, [
        { heading: 'Papelera' },
        { label: 'Actualizar', icon: 'RefreshCw', action: refresh },
        { label: 'Seleccionar todo', icon: 'ListChecks', shortcut: `${mod}A`, action: selectAll, disabled: visibleItems.length === 0 },
        { separator: true },
        { label: 'Vaciar papelera', icon: 'Trash2', variant: 'danger', disabled: trash.items.length === 0, action: () => deleteForever(trash.items) },
      ]);
      return;
    }
    const folderItem: DriveItem | null = view === 'folder'
      ? (findItem(folderId) || normalizeItem({ id: folderId, name: currentFolderName, mimeType: FOLDER_MIME }, null))
      : null;
    showMenu(x, y, [
      { heading: currentFolderName },
      ...(view === 'folder' ? [
        { label: 'Nueva carpeta', icon: 'FolderPlus', action: () => createFolder() },
        { label: 'Subir archivos', icon: 'UploadCloud', action: () => pickFiles() },
        { separator: true },
      ] : []),
      { label: 'Actualizar', icon: 'RefreshCw', action: refresh },
      ...(!canHover ? [{ label: 'Seleccionar varios', icon: 'CheckSquare', disabled: visibleItems.length === 0, action: () => setSelectionMode(true) }] : []),
      { label: 'Seleccionar todo', icon: 'ListChecks', shortcut: canHover ? `${mod}A` : undefined, disabled: visibleItems.length === 0, action: () => { if (!canHover) setSelectionMode(true); selectAll(); } },
      { label: viewMode === 'list' ? 'Ver como cuadrícula' : 'Ver como lista', icon: viewMode === 'list' ? 'LayoutGrid' : 'List', action: () => setViewMode(viewMode === 'list' ? 'grid' : 'list') },
      { label: 'Ordenar…', icon: 'ArrowUpDown', action: () => setTimeout(() => showSortMenu(x, y), 0) },
      ...(folderItem ? [
        { separator: true },
        { label: 'Abrir carpeta en Google Drive', icon: 'HardDrive', action: () => openInDrive(folderItem) },
        { label: 'Copiar enlace de la carpeta', icon: 'Link', action: () => copyLinks([folderItem]) },
        { label: 'Compartir carpeta…', icon: 'Share2', action: () => setShareItem(folderItem) },
      ] : []),
      ...(canHover ? [{ separator: true }, { label: 'Atajos de teclado', icon: 'Keyboard', shortcut: '?', action: () => setShortcutsOpen(true) }] : []),
    ]);
  }, [view, showMenu, refresh, selectAll, visibleItems.length, trash.items, deleteForever, folderId, currentFolderName, createFolder, pickFiles, viewMode, setViewMode, showSortMenu, openInDrive, copyLinks, canHover]);

  // ─── Pointer interactions on items ───────────────────────────────────────
  const pointerTypeRef = useRef<string>('mouse');

  const onItemPointerDown = useCallback((e: React.PointerEvent) => {
    pointerTypeRef.current = e.pointerType;
  }, []);

  const onItemClick = useCallback((e: React.MouseEvent, item: DriveItem) => {
    if (renamingId === item.id) return;
    const touch = pointerTypeRef.current !== 'mouse';
    if (touch) {
      if (selectionMode) toggleSelected(item.id);
      else open(item);
      return;
    }
    if (e.shiftKey) selectRange(item.id, e.ctrlKey || e.metaKey);
    else if (e.ctrlKey || e.metaKey) toggleSelected(item.id);
    else selectOnly(item.id);
  }, [renamingId, selectionMode, toggleSelected, open, selectRange, selectOnly]);

  const onItemDoubleClick = useCallback((e: React.MouseEvent, item: DriveItem) => {
    if (pointerTypeRef.current !== 'mouse' || renamingId === item.id) return;
    e.preventDefault();
    open(item);
  }, [open, renamingId]);

  const onItemContextMenu = useCallback((e: React.MouseEvent, item: DriveItem) => {
    e.preventDefault();
    e.stopPropagation();
    if (renamingId === item.id) return;
    showItemMenu(e.clientX, e.clientY, item);
  }, [showItemMenu, renamingId]);

  // ─── Drag & drop ─────────────────────────────────────────────────────────
  const dragIdsRef = useRef<string[] | null>(null);
  const springRef = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [fileDragOver, setFileDragOver] = useState(false);

  const clearSpring = () => {
    if (springRef.current) clearTimeout(springRef.current.timer);
    springRef.current = null;
  };

  const onItemDragStart = useCallback((e: React.DragEvent, item: DriveItem) => {
    if (view === 'trash' || renamingId) {
      e.preventDefault();
      return;
    }
    const ids = selectedSet.has(item.id) ? selectedIds : [item.id];
    if (!selectedSet.has(item.id)) selectOnly(item.id);
    dragIdsRef.current = ids;
    e.dataTransfer.effectAllowed = 'copyMove';
    e.dataTransfer.setData(INTERNAL_DRAG_TYPE, JSON.stringify(ids));
    if (ids.length === 1 && !item.isFolder) {
      // Lets the file be dropped onto the desktop / WhatsApp Web / other apps (Chromium)
      const src = item.kind === 'audio' ? `/api/audio/${item.id}` : `/api/files/${item.id}?download=true`;
      e.dataTransfer.setData('DownloadURL', `${item.mimeType}:${item.name}:${window.location.origin}${src}`);
    }
    e.dataTransfer.setData('text/uri-list', ids.map(id => driveUrl(findItem(id) || item)).join('\n'));
    if (ids.length > 1) {
      const ghost = document.createElement('div');
      ghost.textContent = `${ids.length} elementos`;
      ghost.style.cssText = 'position:fixed;top:-100px;left:-100px;padding:6px 12px;border-radius:999px;background:#6c5ce7;color:#fff;font:600 12px Inter,sans-serif;';
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 10, 10);
      setTimeout(() => ghost.remove(), 0);
    }
  }, [view, renamingId, selectedSet, selectedIds, selectOnly]);

  const onDragEnd = useCallback(() => {
    dragIdsRef.current = null;
    clearSpring();
    setDropTargetId(null);
  }, []);

  /** Props for anything that accepts drops into a folder (rows, tree nodes, breadcrumbs). */
  const getFolderDropProps = useCallback((targetFolderId: string, opts: { springLoad?: boolean } = {}) => ({
    onDragOver: (e: React.DragEvent) => {
      const internal = dragIdsRef.current;
      const hasFiles = e.dataTransfer.types.includes('Files');
      if (!internal && !hasFiles) return;
      if (internal && internal.includes(targetFolderId)) return;
      if (view === 'trash') return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = internal ? 'move' : 'copy';
      setDropTargetId(prev => (prev === targetFolderId ? prev : targetFolderId));
      if (opts.springLoad && internal && targetFolderId !== folderId && springRef.current?.id !== targetFolderId) {
        clearSpring();
        springRef.current = { id: targetFolderId, timer: setTimeout(() => openFolderById(targetFolderId), 1100) };
      }
    },
    onDragLeave: (e: React.DragEvent) => {
      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
      setDropTargetId(prev => (prev === targetFolderId ? null : prev));
      if (springRef.current?.id === targetFolderId) clearSpring();
    },
    onDrop: (e: React.DragEvent) => {
      const internal = dragIdsRef.current;
      const files = Array.from(e.dataTransfer.files || []);
      if (!internal && files.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      clearSpring();
      setDropTargetId(null);
      setFileDragOver(false);
      dragIdsRef.current = null;
      if (internal) {
        const items = internal.map(id => findItem(id)).filter(Boolean) as DriveItem[];
        performMove(items, targetFolderId);
      } else {
        openUpload(files, targetFolderId);
      }
    },
  }), [view, folderId, openFolderById, performMove, openUpload]);

  /** The whole content area accepts files from the computer (into the open folder). */
  const containerDropProps = useMemo(() => ({
    onDragOver: (e: React.DragEvent) => {
      if (dragIdsRef.current || !e.dataTransfer.types.includes('Files') || view !== 'folder' || trimmedQuery) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      if (!fileDragOver) setFileDragOver(true);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (e.currentTarget.contains(e.relatedTarget as Node)) return;
      setFileDragOver(false);
    },
    onDrop: (e: React.DragEvent) => {
      setFileDragOver(false);
      if (dragIdsRef.current) return;
      const files = Array.from(e.dataTransfer.files || []);
      if (files.length === 0 || view !== 'folder') return;
      e.preventDefault();
      openUpload(files, folderId);
    },
  }), [view, trimmedQuery, fileDragOver, folderId, openUpload]);

  // Global dragend safety net (drop outside the window, Esc during drag…)
  useEffect(() => {
    const reset = () => {
      dragIdsRef.current = null;
      clearSpring();
      setDropTargetId(null);
      setFileDragOver(false);
    };
    window.addEventListener('dragend', reset);
    window.addEventListener('drop', reset);
    return () => {
      window.removeEventListener('dragend', reset);
      window.removeEventListener('drop', reset);
    };
  }, []);

  // ─── Keyboard ────────────────────────────────────────────────────────────
  const typeaheadRef = useRef<{ text: string; timer: ReturnType<typeof setTimeout> | null }>({ text: '', timer: null });

  const moveFocus = useCallback((delta: number, extend: boolean) => {
    if (visibleItems.length === 0) return;
    const currentIndex = focusId ? visibleItems.findIndex(i => i.id === focusId) : -1;
    const nextIndex = currentIndex < 0 ? (delta > 0 ? 0 : visibleItems.length - 1) : Math.max(0, Math.min(visibleItems.length - 1, currentIndex + delta));
    const next = visibleItems[nextIndex];
    if (extend) selectRange(next.id, false);
    else selectOnly(next.id);
  }, [visibleItems, focusId, selectRange, selectOnly]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (!containerRef.current?.contains(target)) return; // events bubbling from portals (modals)
    if (target.closest('input, textarea, select, [contenteditable="true"]')) {
      if (e.key === 'Escape' && target === searchInputRef.current) {
        if (query) setQuery('');
        else searchInputRef.current?.blur();
      }
      if (e.key === 'ArrowDown' && target === searchInputRef.current && visibleItems.length) {
        e.preventDefault();
        containerRef.current?.focus();
        selectOnly(visibleItems[0].id);
      }
      return;
    }

    // A focused toolbar button / link keeps its native Enter & Space behaviour
    if ((e.key === 'Enter' || e.key === ' ') && target !== containerRef.current && target.closest('button, a, [role="button"]')) return;

    const mod = e.ctrlKey || e.metaKey;
    const focused = focusId ? visibleItems.find(i => i.id === focusId) : undefined;
    const targets = selectedItems.length ? selectedItems : (focused ? [focused] : []);
    const cols = viewMode === 'grid' ? Math.max(1, gridColumnsRef.current) : 1;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (mod && focused) open(focused);
        else moveFocus(cols, e.shiftKey);
        return;
      case 'ArrowUp':
        e.preventDefault();
        if (mod || e.altKey) goUp();
        else moveFocus(-cols, e.shiftKey);
        return;
      case 'ArrowRight':
        if (viewMode === 'grid') { e.preventDefault(); moveFocus(1, e.shiftKey); }
        return;
      case 'ArrowLeft':
        if (viewMode === 'grid') { e.preventDefault(); moveFocus(-1, e.shiftKey); }
        return;
      case 'Home':
        e.preventDefault();
        if (visibleItems[0]) selectOnly(visibleItems[0].id);
        return;
      case 'End':
        e.preventDefault();
        if (visibleItems.length) selectOnly(visibleItems[visibleItems.length - 1].id);
        return;
      case 'Enter':
        if (focused) { e.preventDefault(); open(focused); }
        return;
      case ' ':
        if (focused) {
          e.preventDefault();
          if (focused.kind === 'audio') play(focused);
          else if (focused.isFolder) open(focused);
          else preview(focused);
        }
        return;
      case 'F2':
        if (focused && view !== 'trash') { e.preventDefault(); startRename(focused); }
        return;
      case 'Delete':
        if (targets.length) { e.preventDefault(); view === 'trash' ? deleteForever(targets) : trashItems(targets); }
        return;
      case 'Backspace':
        if (mod && targets.length) { e.preventDefault(); view === 'trash' ? deleteForever(targets) : trashItems(targets); }
        else if (!mod) { e.preventDefault(); goUp(); }
        return;
      case 'Escape':
        if (selectedIds.length || selectionMode) { e.preventDefault(); clearSelection(); }
        else if (query) { e.preventDefault(); setQuery(''); }
        return;
      case '/':
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      case '?':
        e.preventDefault();
        setShortcutsOpen(true);
        return;
    }

    if (mod) {
      const key = e.key.toLowerCase();
      if (key === 'a') { e.preventDefault(); selectAll(); }
      else if (key === 'z' && !e.shiftKey) { e.preventDefault(); undoLast(); }
      else if (key === 'i' && focused) { e.preventDefault(); openDetails(focused); }
      else if (key === 'f') { e.preventDefault(); searchInputRef.current?.focus(); }
      return;
    }

    if (e.altKey) return;
    if (e.key.length === 1 && /\S/.test(e.key)) {
      // Type-ahead: jump to the first item whose name starts with the typed letters
      const ta = typeaheadRef.current;
      ta.text += e.key.toLowerCase();
      if (ta.timer) clearTimeout(ta.timer);
      ta.timer = setTimeout(() => { ta.text = ''; }, 800);
      const hit = visibleItems.find(i => i.name.toLowerCase().startsWith(ta.text));
      if (hit) selectOnly(hit.id);
    }
  }, [query, visibleItems, selectOnly, focusId, selectedItems, viewMode, open, moveFocus, goUp, play, preview, view, startRename, deleteForever, trashItems, selectedIds.length, selectionMode, clearSelection, selectAll, undoLast, openDetails, toggleStar]);

  const onContainerPointerDown = useCallback((e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (!containerRef.current?.contains(target)) return; // pointer events bubbling from portals (modals)
    if (target.closest('input, textarea, select, button, a, [contenteditable="true"]')) return;
    if (!containerRef.current?.contains(document.activeElement)) {
      containerRef.current?.focus({ preventScroll: true });
    }
  }, []);

  const inspectorItem = selectedItems.length === 1 ? selectedItems[0] : null;

  return {
    // identity
    rootId, rootName, scope, artistEmail,
    // layout
    isXL, isLg, canHover, viewMode, setViewMode, sidebarCollapsed, setSidebarCollapsed,
    inspectorVisible, setInspectorVisible, drawerOpen, setDrawerOpen,
    // navigation
    view, setView, folderId, crumbs, currentFolderName, openFolder, openFolderById, goUp, revealInFolder, folderHref,
    bouncesFolder, starredFolders, openBounces,
    // data
    folderEntry, index, trash, visibleItems, showLocation, isLoading, error, counts, locationOf, isSearchingEverywhere,
    query, setQuery, typeFilter, setTypeFilter, sortField, setSortField, sortDir, setSortDir,
    // selection
    selectedIds, selectedSet, selectedItems, focusId, selectionMode, setSelectionMode, selectOnly, toggleSelected,
    selectAll, clearSelection, highlightId, inspectorItem,
    // modals
    renamingId, setRenamingId, previewId, setPreviewId, shareItem, setShareItem, deleteDialog, setDeleteDialog,
    moveDialog, setMoveDialog, detailsSheetId, setDetailsSheetId, miniDawItem, setMiniDawItem,
    shortcutsOpen, setShortcutsOpen,
    // actions
    open, play, preview, openDetails, commitRename, startRename, performMove, performCopy, trashItems, restoreItems,
    deleteForever, toggleStar, setFolderColor, cancelSchedule, createFolder, download, openInDrive, copyLinks,
    copyDownloadLink, shareNative, shareWithArtist, openUpload, pickFiles, onFileInputChange, refresh,
    undoLast, notify,
    // menus
    showItemMenu, showBackgroundMenu, showSortMenu, showColorMenu, buildItemMenu,
    // interactions
    onItemPointerDown, onItemClick, onItemDoubleClick, onItemContextMenu, onItemDragStart, onDragEnd,
    getFolderDropProps, containerDropProps, dropTargetId, fileDragOver, onKeyDown, onContainerPointerDown,
    // audio
    currentTrackId: currentTrack?.id ?? null, isPlaying,
    // refs
    fileInputRef, searchInputRef, containerRef, gridColumnsRef,
    // helpers
    kindLabel: KIND_LABEL,
  };
}

export type ExplorerController = ReturnType<typeof useExplorerController>;

const ExplorerContext = createContext<ExplorerController | null>(null);

export function ExplorerProvider({ value, children }: { value: ExplorerController; children: React.ReactNode }) {
  return <ExplorerContext.Provider value={value}>{children}</ExplorerContext.Provider>;
}

export function useExplorer(): ExplorerController {
  const ctx = useContext(ExplorerContext);
  if (!ctx) throw new Error('useExplorer must be used inside <FileExplorer>');
  return ctx;
}
