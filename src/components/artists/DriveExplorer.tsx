'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { Folder, FileAudio, File as FileIcon, FileImage, FileText, Film, ChevronRight, Loader2, UploadCloud, FolderPlus, ArrowLeft, MoreVertical, Link as LinkIcon, Trash2, Edit3, Plus, ExternalLink, Undo, Download, FolderOpen, Play, Pause, Share2, Timer, X } from 'lucide-react';
import { WaveformPlayer } from '@/components/projects/WaveformPlayer';
import { useContextMenu } from '@/lib/contexts/ContextMenuContext';
import { customAlert, customConfirm, customPrompt } from '@/lib/dialog';
import { cn } from '@/lib/utils';
import { useAudio } from '@/lib/contexts/AudioContext';
import { ShareModal } from './ShareModal';
import { DeleteModal } from './DeleteModal';

interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
  webViewLink?: string;
  webContentLink?: string;
  versions?: DriveItem[];
  parentFolderId?: string;
  expiresAt?: number | null;
}

interface Breadcrumb {
  id: string;
  name: string;
}

interface ActionHistory {
  type: 'MOVE' | 'TRASH';
  items: DriveItem[];
  oldParentId?: string;
  newParentId?: string;
}

const formatModificationTime = (timeStr?: string) => {
  if (!timeStr) return '';
  const date = new Date(timeStr);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const d = pad(date.getDate());
  const m = pad(date.getMonth() + 1);
  const y = date.getFullYear();
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${d}/${m}/${y} ${h}:${min}`;
};

export function DriveExplorer({ rootFolderId, rootName }: { rootFolderId: string, rootName: string }) {
  const [currentFolderId, setCurrentFolderId] = useState(rootFolderId);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([{ id: rootFolderId, name: rootName }]);
  const [items, setItems] = useState<DriveItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const { showMenu } = useContextMenu();
  const { currentTrack, isPlaying, playTrack, togglePlay } = useAudio();

  // Modal states
  const [shareModalFile, setShareModalFile] = useState<DriveItem | null>(null);
  const [deleteModalFile, setDeleteModalFile] = useState<DriveItem | null>(null);

  // Recent files state
  const [recentFiles, setRecentFiles] = useState<DriveItem[]>([]);
  const [isRecentLoading, setIsRecentLoading] = useState(true);
  const [folderMap, setFolderMap] = useState<Record<string, { name: string, parentId: string | null }>>({});

  // Selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);

  // Split screen (Extra Panes) states
  interface FolderPane {
    folderId: string;
    folderName: string;
    items: DriveItem[];
    isLoading: boolean;
    isDragOver: boolean;
  }
  const [extraPanes, setExtraPanes] = useState<FolderPane[]>([]);
  const [isRightDropZoneDragOver, setIsRightDropZoneDragOver] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState<'explorer' | 'recent' | 'parallel-0' | 'parallel-1'>('explorer');

  useEffect(() => {
    if (extraPanes.length > 0) {
      if (!activeMobileTab.startsWith('parallel')) {
        setActiveMobileTab('parallel-0');
      }
    } else if (activeMobileTab.startsWith('parallel')) {
      setActiveMobileTab('explorer');
    }
  }, [extraPanes.length, activeMobileTab]);

  const fetchPaneItems = useCallback(async (folderId: string) => {
    try {
      const res = await fetch(`/api/files?folderId=${folderId}`);
      if (!res.ok) throw new Error('Error al cargar elementos del panel secundario');
      const data = await res.json();
      setExtraPanes(prev => prev.map(p => p.folderId === folderId ? { ...p, items: data.items || [], isLoading: false } : p));
    } catch (err) {
      console.error('Error fetching pane items:', err);
      setExtraPanes(prev => prev.map(p => p.folderId === folderId ? { ...p, isLoading: false } : p));
    }
  }, []);

  useEffect(() => {
    extraPanes.forEach(pane => {
      if (pane.isLoading && pane.items.length === 0) {
        fetchPaneItems(pane.folderId);
      }
    });
  }, [extraPanes, fetchPaneItems]);

  const explorerRef = useRef<HTMLDivElement>(null);

  // Undo / Redo Stack
  const [actionStack, setActionStack] = useState<ActionHistory[]>([]);
  const [redoStack, setRedoStack] = useState<ActionHistory[]>([]);

  // Clear selection when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (explorerRef.current && !explorerRef.current.contains(e.target as Node)) {
        setSelectedIds([]);
        setLastSelectedIndex(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Clear selection when changing folder
  useEffect(() => {
    setSelectedIds([]);
    setLastSelectedIndex(null);
  }, [currentFolderId]);

  useEffect(() => {
    fetchItems(currentFolderId);
  }, [currentFolderId]);

  useEffect(() => {
    fetchRecentFiles();
  }, [rootFolderId]);

  const fetchRecentFiles = async () => {
    setIsRecentLoading(true);
    try {
      const res = await fetch(`/api/files?folderId=${rootFolderId}&recursive=true`);
      if (!res.ok) throw new Error('Error al cargar archivos recientes');
      const data = await res.json();

      const allItems = data.items || [];

      // Build folder map
      const foldersOnly = allItems.filter((item: any) => item.mimeType === 'application/vnd.google-apps.folder');
      const map: Record<string, { name: string, parentId: string | null }> = {
        [rootFolderId]: { name: rootName, parentId: null }
      };
      foldersOnly.forEach((f: any) => {
        map[f.id] = { name: f.name, parentId: f.parentFolderId || rootFolderId };
      });
      setFolderMap(map);

      // Filter to files only, sorted by modification time (or created time) descending
      const filesOnly = allItems.filter((item: any) => item.mimeType !== 'application/vnd.google-apps.folder');
      filesOnly.sort((a: any, b: any) => {
        const timeA = new Date(a.modifiedTime || a.createdTime || 0).getTime();
        const timeB = new Date(b.modifiedTime || b.createdTime || 0).getTime();
        return timeB - timeA;
      });
      setRecentFiles(filesOnly);
    } catch (e: any) {
      console.error('Error fetching recent files:', e);
    } finally {
      setIsRecentLoading(false);
    }
  };

  const handleOpenFileLocation = (parentFolderId?: string) => {
    const targetFolderId = parentFolderId || rootFolderId;

    // Rebuild breadcrumbs
    const crumbs: Breadcrumb[] = [];
    let currentId = targetFolderId;

    while (currentId) {
      const folder = folderMap[currentId] || (currentId === rootFolderId ? { name: rootName, parentId: null } : null);
      if (folder) {
        crumbs.unshift({ id: currentId, name: folder.name });
        currentId = folder.parentId as string;
      } else {
        crumbs.unshift({ id: currentId, name: 'Carpeta' });
        break;
      }
    }

    if (crumbs.length === 0 || crumbs[0].id !== rootFolderId) {
      crumbs.unshift({ id: rootFolderId, name: rootName });
    }

    setBreadcrumbs(crumbs);
    setCurrentFolderId(targetFolderId);
  };

  const fetchItems = async (folderId: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/files?folderId=${folderId}`);
      if (!res.ok) throw new Error('Error al cargar archivos');
      const data = await res.json();
      setItems(data.items || []);
    } catch (e: any) {
      customAlert(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const navigateTo = (folderId: string, folderName: string) => {
    setCurrentFolderId(folderId);
    setBreadcrumbs(prev => [...prev, { id: folderId, name: folderName }]);
  };

  const navigateUp = (index: number) => {
    const newCrumbs = breadcrumbs.slice(0, index + 1);
    setBreadcrumbs(newCrumbs);
    setCurrentFolderId(newCrumbs[newCrumbs.length - 1].id);
  };

  const handleItemClick = (e: React.MouseEvent, index: number, item: DriveItem, currentGroupedItems: DriveItem[]) => {
    e.stopPropagation();
    if (e.shiftKey && lastSelectedIndex !== null) {
      // Select range
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const newSelectedIds = currentGroupedItems.slice(start, end + 1).map(i => i.id);
      setSelectedIds(prev => Array.from(new Set([...prev, ...newSelectedIds])));
    } else if (e.ctrlKey || e.metaKey) {
      // Toggle individual
      setSelectedIds(prev =>
        prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id]
      );
      setLastSelectedIndex(index);
    } else {
      // Single click - select and open/play
      if (item.mimeType === 'application/vnd.google-apps.folder') {
        navigateTo(item.id, item.name);
      } else {
        setSelectedIds([item.id]);
        setLastSelectedIndex(index);
        
        if (item.mimeType.startsWith('audio/')) {
          if (currentTrack?.id === item.id) {
            togglePlay();
          } else {
            playTrack({ id: item.id, name: item.name.replace(/\.[^/.]+$/, ''), url: `/api/audio/${item.id}` });
          }
        } else if (item.webViewLink) {
          window.open(item.webViewLink, '_blank');
        }
      }
    }
  };

  const undoLastAction = async () => {
    if (actionStack.length === 0) return;
    const lastAction = actionStack[actionStack.length - 1];
    setActionStack(prev => prev.slice(0, -1));
    setRedoStack(prev => [...prev, lastAction]);

    setIsLoading(true);

    try {
      if (lastAction.type === 'MOVE' && lastAction.oldParentId) {
        for (const item of lastAction.items) {
          await fetch('/api/files', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileId: item.id, newParentId: lastAction.oldParentId, oldParentId: lastAction.newParentId }),
          });
        }
        customAlert(`Deshecho: Se han devuelto ${lastAction.items.length} elementos.`);
      } else if (lastAction.type === 'TRASH') {
        for (const item of lastAction.items) {
          await fetch('/api/files', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileId: item.id, trashed: false }),
          });
        }
        customAlert(`Deshecho: Se han restaurado ${lastAction.items.length} elementos.`);
      }
      fetchItems(currentFolderId);
      fetchRecentFiles();
    } catch (err: any) {
      customAlert('Error al deshacer: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const redoLastAction = async () => {
    if (redoStack.length === 0) return;
    const actionToRedo = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));
    setActionStack(prev => [...prev, actionToRedo]);

    setIsLoading(true);

    try {
      if (actionToRedo.type === 'MOVE' && actionToRedo.newParentId) {
        for (const item of actionToRedo.items) {
          await fetch('/api/files', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileId: item.id, newParentId: actionToRedo.newParentId, oldParentId: actionToRedo.oldParentId }),
          });
        }
        customAlert(`Rehecho: Se han movido ${actionToRedo.items.length} elementos nuevamente.`);
      } else if (actionToRedo.type === 'TRASH') {
        for (const item of actionToRedo.items) {
          await fetch(`/api/files?id=${item.id}`, { method: 'DELETE' });
        }
        customAlert(`Rehecho: Se han vuelto a eliminar ${actionToRedo.items.length} elementos.`);
      }
      fetchItems(currentFolderId);
      fetchRecentFiles();
    } catch (err: any) {
      customAlert('Error al rehacer: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.length > 0) {
          e.preventDefault();
          handleDelete(selectedIds[0], false, selectedIds);
        }
      } else if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setSelectedIds(items.map(i => i.id));
      } else if (e.key === 'Escape') {
        if (selectedIds.length > 0) {
          e.preventDefault();
          setSelectedIds([]);
          setLastSelectedIndex(null);
        }
      } else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        undoLastAction();
      } else if (e.key === 'y' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        redoLastAction();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [selectedIds, items, actionStack, redoStack]);

  const uploadFiles = async (files: FileList | File[], targetFolderId: string) => {
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const formData = new FormData();
        formData.append('file', files[i]);
        formData.append('parentId', targetFolderId);

        await fetch('/api/files', { method: 'POST', body: formData });
      }
      customAlert('Archivos subidos con éxito');
      fetchItems(currentFolderId);
      fetchRecentFiles();
      extraPanes.forEach(pane => fetchPaneItems(pane.folderId));
    } catch (err) {
      customAlert('Error al subir archivos');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      await uploadFiles(files, currentFolderId);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types && e.dataTransfer.types.includes('Files')) {
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (!explorerRef.current?.contains(e.relatedTarget as Node)) {
      setIsDraggingOver(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);

    const internalItemId = e.dataTransfer.getData('text/plain');
    if (internalItemId) return;

    const files = e.dataTransfer.files;
    if (files) {
      await uploadFiles(files, currentFolderId);
    }
  };

  const handleItemDragStart = (e: React.DragEvent, itemId: string) => {
    e.stopPropagation();
    const idsToDrag = selectedIds.includes(itemId) ? selectedIds : [itemId];
    e.dataTransfer.setData('text/plain', JSON.stringify(idsToDrag));
  };

  const handleMoveItems = async (draggedItemIds: string[], targetFolderId: string, sourceFolderId: string) => {
    const validIdsToMove = draggedItemIds.filter(id => id !== targetFolderId);
    if (validIdsToMove.length === 0) return;

    setIsLoading(true);
    setExtraPanes(prev => prev.map(p => ({ ...p, isLoading: true })));

    try {
      let paneItemsAll: DriveItem[] = [];
      extraPanes.forEach(pane => {
        paneItemsAll = paneItemsAll.concat(pane.items);
      });

      const movedItems = items.filter(i => validIdsToMove.includes(i.id))
        .concat(recentFiles.filter(i => validIdsToMove.includes(i.id)))
        .concat(paneItemsAll.filter(i => validIdsToMove.includes(i.id)));

      for (const fileId of validIdsToMove) {
        await fetch('/api/files', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId, newParentId: targetFolderId, oldParentId: sourceFolderId }),
        });
      }

      setActionStack(prev => [...prev, {
        type: 'MOVE',
        items: movedItems,
        oldParentId: sourceFolderId,
        newParentId: targetFolderId
      }]);
      setRedoStack([]);

      setSelectedIds([]);
      fetchItems(currentFolderId);
      extraPanes.forEach(pane => fetchPaneItems(pane.folderId));
      fetchRecentFiles();
    } catch (err: any) {
      customAlert(err.message);
    } finally {
      setIsLoading(false);
      setExtraPanes(prev => prev.map(p => ({ ...p, isLoading: false })));
    }
  };

  const handleItemDrop = (e: React.DragEvent, targetFolderId: string, sourceFolderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    try {
      const draggedData = e.dataTransfer.getData('text/plain');
      if (!draggedData) return;

      let draggedItemIds: string[] = [];
      try {
        draggedItemIds = JSON.parse(draggedData);
      } catch {
        draggedItemIds = [draggedData];
      }

      handleMoveItems(draggedItemIds, targetFolderId, sourceFolderId);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRightDropZoneDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsRightDropZoneDragOver(false);

    try {
      const draggedData = e.dataTransfer.getData('text/plain');
      if (!draggedData) return;

      let draggedItemIds: string[] = [];
      try {
        draggedItemIds = JSON.parse(draggedData);
      } catch {
        draggedItemIds = [draggedData];
      }

      if (draggedItemIds.length === 1) {
        const folderId = draggedItemIds[0];

        let folderItem = items.find(i => i.id === folderId) || recentFiles.find(i => i.id === folderId);
        if (!folderItem) {
          for (const pane of extraPanes) {
            const found = pane.items.find(i => i.id === folderId);
            if (found) {
              folderItem = found;
              break;
            }
          }
        }

        if (folderItem && folderItem.mimeType === 'application/vnd.google-apps.folder') {
          if (extraPanes.length >= 2) {
            customAlert('El número máximo de paneles paralelos es 2 (4 paneles en pantalla en total).');
            return;
          }
          if (extraPanes.some(p => p.folderId === folderId)) {
            customAlert('Esta carpeta ya está abierta en un panel paralelo.');
            return;
          }
          const newPane: FolderPane = {
            folderId,
            folderName: folderItem.name,
            items: [],
            isLoading: true,
            isDragOver: false
          };
          setExtraPanes(prev => [...prev, newPane]);
        } else {
          customAlert('Arrastra una carpeta a esta zona para abrir la vista en paralelo.');
        }
      } else {
        customAlert('Solo puedes abrir una carpeta a la vez en paralelo.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateFolder = async () => {
    const name = await customPrompt('Nombre de la nueva carpeta:');
    if (!name) return;

    try {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parentId: currentFolderId })
      });
      if (!res.ok) throw new Error('Error al crear la carpeta');
      fetchItems(currentFolderId);
      fetchRecentFiles();
    } catch (err: any) {
      customAlert(err.message);
    }
  };

  const handleDelete = async (itemId: string, isFolder: boolean, multipleIds?: string[]) => {
    const idsToDelete = multipleIds && multipleIds.length > 0 ? multipleIds : [itemId];
    const message = idsToDelete.length > 1
      ? `¿Enviar ${idsToDelete.length} elementos a la papelera?`
      : `¿Enviar a la papelera?`;

    if (!await customConfirm(message)) return;
    setIsLoading(true);
    try {
      const trashedItems = items.filter(i => idsToDelete.includes(i.id));
      for (const id of idsToDelete) {
        await fetch(`/api/files?id=${id}`, { method: 'DELETE' });
      }

      setActionStack(prev => [...prev, {
        type: 'TRASH',
        items: trashedItems
      }]);
      setRedoStack([]);

      setSelectedIds([]);
      fetchItems(currentFolderId);
      fetchRecentFiles();
    } catch (e) {
      customAlert('Error al enviar a la papelera');
      setIsLoading(false);
    }
  };

  const handleRename = async (itemId: string, currentName: string) => {
    const newName = await customPrompt('Nuevo nombre:', currentName);
    if (!newName || newName === currentName) return;
    try {
      await fetch('/api/files', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: itemId, name: newName })
      });
      fetchItems(currentFolderId);
      fetchRecentFiles();
    } catch (e) {
      customAlert('Error al renombrar');
    }
  };

  const getIcon = (mimeType: string, name: string) => {
    if (name.toLowerCase().endsWith('.flp')) {
      return (
        <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0 fill-[#ff793f]">
          <title>FL Studio Project</title>
          {/* Leaf / Stem */}
          <path d="M12 2c1.2 1.5 1.5 3 .5 4.5 1.5-1 2.2-2.5 1.5-4.5z" fill="#2ed573" />
          {/* Fruit Body */}
          <path d="M12 5.5c-3.5 0-6 2-6 5.5 0 3.2 2 6.5 6 11 4-4.5 6-7.8 6-11 0-3.5-2.5-5.5-6-5.5z" />
          <ellipse cx="12" cy="11" rx="1.5" ry="2" fill="#ffa502" opacity="0.7" />
        </svg>
      );
    }
    if (mimeType === 'application/vnd.google-apps.folder') return <Folder className="w-5 h-5 text-accent" />;
    if (mimeType.startsWith('audio/')) return <FileAudio className="w-5 h-5 text-purple-400" />;
    if (mimeType.startsWith('image/')) return <FileImage className="w-5 h-5 text-green-400" />;
    if (mimeType.startsWith('video/')) return <Film className="w-5 h-5 text-red-400" />;
    if (mimeType.includes('pdf')) return <FileText className="w-5 h-5 text-orange-400" />;
    if (
      mimeType.includes('document') ||
      mimeType.includes('word') ||
      mimeType === 'application/vnd.google-apps.document'
    ) return <FileText className="w-5 h-5 text-blue-400" />;
    if (
      mimeType.includes('sheet') ||
      mimeType.includes('excel') ||
      mimeType === 'application/vnd.google-apps.spreadsheet'
    ) return <FileText className="w-5 h-5 text-emerald-400" />;
    if (
      mimeType.includes('presentation') ||
      mimeType.includes('powerpoint') ||
      mimeType === 'application/vnd.google-apps.presentation'
    ) return <FileText className="w-5 h-5 text-yellow-500" />;
    if (mimeType === 'text/plain') return <FileText className="w-5 h-5 text-gray-300" />;
    return <FileIcon className="w-5 h-5 text-text-secondary" />;
  };

  // Sort and group
  const groupedItems = (() => {
    const audioItems = items.filter(i => i.mimeType.startsWith('audio/'));
    const nonAudioItems = items.filter(i => !i.mimeType.startsWith('audio/'));

    const audioGroups = new Map<string, typeof items>();
    audioItems.forEach(item => {
      const nameWithoutExt = item.name.replace(/\.[^/.]+$/, "");
      const baseName = nameWithoutExt.replace(/([ _-](v\d+|mix\s*\d+))$/i, '').trim();
      if (!audioGroups.has(baseName)) audioGroups.set(baseName, []);
      audioGroups.get(baseName)!.push(item);
    });

    const finalItems = [...nonAudioItems];
    audioGroups.forEach((versions, baseName) => {
      versions.sort((a, b) => a.name.localeCompare(b.name));
      finalItems.push({
        ...versions[0],
        versions: versions.length > 1 ? versions : undefined
      } as any);
    });

    return finalItems.sort((a, b) => {
      const isAFolder = a.mimeType === 'application/vnd.google-apps.folder';
      const isBFolder = b.mimeType === 'application/vnd.google-apps.folder';
      if (isAFolder && !isBFolder) return -1;
      if (!isAFolder && isBFolder) return 1;
      return a.name.localeCompare(b.name);
    });
  })();

  const navigatePaneTo = (paneIndex: number, folderId: string, folderName: string) => {
    setExtraPanes(prev => prev.map((p, idx) => idx === paneIndex ? { ...p, folderId, folderName, isLoading: true, items: [] } : p));
  };

  const closePane = (paneIndex: number) => {
    setExtraPanes(prev => prev.filter((_, idx) => idx !== paneIndex));
  };

  return (
    <div ref={explorerRef} className="animate-fade-in space-y-6 transition-all w-full">
      {/* Mobile Tabs */}
      <div className="flex lg:hidden bg-surface-elevated p-1.5 rounded-xl border border-border overflow-x-auto gap-1 shadow-sm">
        <button
          onClick={() => setActiveMobileTab('explorer')}
          className={cn(
            "flex-1 py-2.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap px-4",
            activeMobileTab === 'explorer' ? "bg-accent text-white shadow-md" : "text-text-secondary hover:bg-surface hover:text-text-primary"
          )}
        >
          Explorador
        </button>
        <button
          onClick={() => setActiveMobileTab('recent')}
          className={cn(
            "flex-1 py-2.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap px-4",
            activeMobileTab === 'recent' ? "bg-accent text-white shadow-md" : "text-text-secondary hover:bg-surface hover:text-text-primary"
          )}
        >
          Recientes
        </button>
        {extraPanes.map((pane, idx) => (
          <button
            key={pane.folderId}
            onClick={() => setActiveMobileTab(`parallel-${idx}` as any)}
            className={cn(
              "flex-1 py-2.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap px-4",
              activeMobileTab === `parallel-${idx}` ? "bg-accent text-white shadow-md" : "text-text-secondary hover:bg-surface hover:text-text-primary"
            )}
          >
            {pane.folderName}
          </button>
        ))}
      </div>

      {/* ── Desktop: all panels in a single flex row ── */}
      <div
        className="flex flex-col lg:flex-row lg:flex-nowrap gap-4 items-start w-full overflow-x-auto pb-4 px-1"
        style={{ scrollbarWidth: 'thin' }}
      >
        {/* ── Column 1: Archivos Recientes (fixed width, shrink-0) ── */}
        <div
          className={cn(
            "bg-surface-elevated rounded-2xl border border-border p-5 flex flex-col lg:min-h-[550px] transition-all duration-300 w-full",
            "flex-1 min-w-0",
            activeMobileTab === 'recent' ? "flex animate-fade-in" : "hidden lg:flex"
          )}
        >
          <h3 className="text-md font-bold text-text-primary mb-4 flex items-center gap-2 shrink-0">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse shrink-0" />
            Archivos Recientes
          </h3>

          <div className="flex-1 overflow-y-auto max-h-[510px] pr-1 space-y-2">
            {isRecentLoading ? (
              <div className="p-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-accent" /></div>
            ) : recentFiles.length === 0 ? (
              <div className="p-8 text-center text-text-secondary text-sm">
                No hay archivos en este perfil.
              </div>
            ) : (
              recentFiles.map((item: any) => {
                const isAudio = item.mimeType.startsWith('audio/');
                const isThisTrackActive = currentTrack?.id === item.id;
                const isThisTrackPlaying = isThisTrackActive && isPlaying;

                return (
                  <div
                    key={item.id}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      const openUrl = item.webViewLink || `/api/files/${item.id}?inline=true`;
                      window.open(openUrl, '_blank');
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isAudio) {
                        if (isThisTrackActive) {
                          togglePlay();
                        } else {
                          playTrack({ id: item.id, name: item.name.replace(/\.[^/.]+$/, ''), url: `/api/audio/${item.id}` });
                        }
                      } else {
                        const openUrl = item.webViewLink || `/api/files/${item.id}?inline=true`;
                        window.open(openUrl, '_blank');
                      }
                    }}
                    className="relative p-3 bg-surface rounded-xl border border-border/60 hover:border-accent/40 hover:bg-surface-elevated/70 transition-all flex items-center gap-3 group cursor-pointer overflow-hidden"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {isAudio ? (
                        <button
                          className={cn(
                            'w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 shadow-sm',
                            isThisTrackActive ? 'bg-accent text-white shadow-accent/40' : 'bg-surface border border-border text-text-primary hover:border-accent hover:text-accent'
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isThisTrackActive) {
                              togglePlay();
                            } else {
                              playTrack({ id: item.id, name: item.name.replace(/\.[^/.]+$/, ''), url: `/api/audio/${item.id}` });
                            }
                          }}
                        >
                          {isThisTrackPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
                        </button>
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-surface-elevated flex items-center justify-center shrink-0 border border-border/50">
                          {getIcon(item.mimeType, item.name)}
                        </div>
                      )}

                      <div className="flex-1 min-w-0 pr-2">
                        <div className={cn("text-xs font-bold flex items-center gap-1.5", isThisTrackActive ? "text-accent" : "text-text-primary")} title={item.name}>
                          <span className="truncate block">{item.name}</span>
                          {item.expiresAt && <span title={`Expira: ${new Date(item.expiresAt).toLocaleString()}`}><Timer className="w-3 h-3 text-accent opacity-70 shrink-0" /></span>}
                        </div>
                        <div className="text-[10px] text-text-secondary mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono bg-surface-elevated px-1.5 py-0.5 rounded border border-border/30">{formatModificationTime(item.modifiedTime || item.createdTime)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Action buttons on hover */}
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all bg-surface-elevated/95 backdrop-blur-md p-1 rounded-lg shadow-sm border border-border/50 translate-x-0 lg:translate-x-2 lg:group-hover:translate-x-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleOpenFileLocation(item.parentFolderId); }}
                        className="p-1.5 text-text-secondary hover:text-accent hover:bg-surface rounded-md transition-colors"
                        title="Abrir ubicación"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setShareModalFile(item); }}
                        className="p-1.5 text-text-secondary hover:text-accent hover:bg-surface rounded-md transition-colors"
                        title="Compartir"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteModalFile(item); }}
                        className="p-1.5 text-text-secondary hover:text-error hover:bg-surface rounded-md transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── Column 2: Main Explorer (flex-1, elastic – takes all remaining space) ── */}
        <div
          className={cn(
            "flex-1 min-w-0 space-y-4 transition-all duration-300",
            activeMobileTab === 'explorer' ? "block" : "hidden lg:block"
          )}
        >
          {/* Top Bar: Breadcrumbs & Actions */}
          <div className="flex items-center justify-between bg-surface-elevated p-4 rounded-xl border border-border gap-2">
            <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap flex-1 min-w-0">
              {breadcrumbs.map((crumb, idx) => (
                <div
                  key={crumb.id}
                  className="flex items-center gap-2"
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => {
                    if (idx < breadcrumbs.length - 1) {
                      handleItemDrop(e, crumb.id, currentFolderId);
                    }
                  }}
                >
                  <button
                    onClick={() => navigateUp(idx)}
                    className={`hover:text-accent transition-colors px-2 py-1 rounded ${idx === breadcrumbs.length - 1 ? 'text-text-primary font-medium' : 'text-text-secondary hover:bg-surface'}`}
                  >
                    {crumb.name}
                  </button>
                  {idx < breadcrumbs.length - 1 && <ChevronRight className="w-4 h-4 text-text-secondary shrink-0" />}
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCreateFolder}
                className="h-8 text-xs gap-1.5"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                Nueva carpeta
              </Button>

              <label className="cursor-pointer shrink-0">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white hover:bg-accent/90 text-xs font-semibold transition-colors shadow-md shadow-accent/10 h-8">
                  <UploadCloud className="w-3.5 h-3.5" />
                  Subir archivo
                </span>
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      uploadFiles(Array.from(e.target.files), currentFolderId);
                    }
                  }}
                />
              </label>
            </div>
          </div>

          {/* Drag & Drop Main Explorer Window */}
          <div
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingOver(true); }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingOver(false);
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                uploadFiles(Array.from(e.dataTransfer.files), currentFolderId);
              } else {
                try {
                  const draggedData = e.dataTransfer.getData('text/plain');
                  if (!draggedData) return;
                  let draggedItemIds: string[] = [];
                  try {
                    draggedItemIds = JSON.parse(draggedData);
                  } catch {
                    draggedItemIds = [draggedData];
                  }
                  if (breadcrumbs.length > 1) {
                    const parentFolder = breadcrumbs[breadcrumbs.length - 2];
                    handleMoveItems(draggedItemIds, parentFolder.id, currentFolderId);
                  }
                } catch (err) {
                  console.error(err);
                }
              }
            }}
            className={cn(
              "relative bg-surface-elevated rounded-2xl border transition-all duration-300 min-h-[470px] overflow-hidden",
              isDraggingOver ? "border-accent bg-accent/5 ring-2 ring-accent/15 scale-[0.995]" : "border-border"
            )}
          >
            {isUploading && (
              <div className="absolute inset-0 bg-background/80 backdrop-blur-md z-55 flex flex-col items-center justify-center p-4 text-center">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-4">
                  <Loader2 className="w-6 h-6 animate-spin text-accent" />
                </div>
                <h3 className="font-bold text-text-primary text-sm">Subiendo archivos a Google Drive</h3>
                <p className="text-xs text-text-secondary mt-1">Este proceso puede tardar unos segundos...</p>
              </div>
            )}

            {isLoading ? (
              <div className="p-16 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>
            ) : items.length === 0 ? (
              <div className="p-20 text-center text-text-secondary">
                <Folder className="w-12 h-12 mx-auto mb-4 opacity-40 text-accent" />
                <p className="font-medium text-sm text-text-primary">Esta carpeta está vacía</p>
                <p className="text-xs text-text-secondary mt-1">Arrastra archivos aquí o haz clic en "Subir archivo" para comenzar.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {groupedItems.map((item: any, idx) => {
                  const isFolder = item.mimeType === 'application/vnd.google-apps.folder';
                  const isAudio = item.mimeType.startsWith('audio/');

                  return (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={(e) => handleItemDragStart(e, item.id)}
                      onDragOver={isFolder ? (e) => { e.preventDefault(); e.stopPropagation(); } : undefined}
                      onDrop={isFolder ? (e) => handleItemDrop(e, item.id, currentFolderId) : undefined}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (isFolder) {
                          navigateTo(item.id, item.name);
                        } else if (item.webViewLink) {
                          window.open(item.webViewLink, '_blank');
                        }
                      }}
                      className={cn(
                        "group flex items-center p-3 transition-colors cursor-pointer hover:bg-surface/60",
                        selectedIds.includes(item.id) && "bg-accent/5 hover:bg-accent/10"
                      )}
                      onClick={(e) => handleItemClick(e, idx, item, groupedItems)}
                    >
                      {isAudio ? (
                        <div className="flex-1 min-w-0 w-full flex items-center pr-2">
                          <WaveformPlayer
                            fileId={item.id}
                            fileName={item.name}
                            versions={item.versions}
                            currentFolderId={currentFolderId}
                            onRefresh={() => {
                              fetchItems(currentFolderId);
                              fetchRecentFiles();
                            }}
                            modifiedTime={item.modifiedTime || item.createdTime}
                          />
                        </div>
                      ) : (
                        <>
                          <div className="w-10 flex justify-center shrink-0">
                            {getIcon(item.mimeType, item.name)}
                          </div>

                          <div className="flex-1 min-w-0 mr-4 flex flex-col justify-center">
                            <div className="font-medium text-text-primary truncate text-sm flex items-center gap-2">
                              {item.name}
                              {item.expiresAt && <span title={`Expira: ${new Date(item.expiresAt).toLocaleString()}`}><Timer className="w-3.5 h-3.5 text-accent opacity-70 shrink-0" /></span>}
                            </div>
                            {!isFolder && (
                              <div className="text-[10px] text-text-secondary mt-0.5 flex items-center gap-1.5 flex-wrap">
                                {item.size && <span>{(parseInt(item.size) / (1024 * 1024)).toFixed(2)} MB</span>}
                                {item.size && <span>•</span>}
                                <span className="font-mono bg-surface px-1.5 py-0.5 rounded border border-border/30">{formatModificationTime(item.modifiedTime || item.createdTime)}</span>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity shrink-0">
                            <button
                              className="p-1.5 text-text-secondary hover:text-accent rounded-md hover:bg-surface transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                setShareModalFile(item);
                              }}
                              title="Compartir"
                            >
                              <Share2 className="w-4 h-4" />
                            </button>
                            {!isFolder && (
                              <a
                                href={item.webContentLink || item.webViewLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                download={item.name}
                                onClick={(e) => e.stopPropagation()}
                                className="p-1.5 text-text-secondary hover:text-text-primary rounded-md hover:bg-surface transition-colors"
                                title="Descargar"
                              >
                                <Download className="w-4 h-4" />
                              </a>
                            )}
                            <button
                              className="p-1.5 text-text-secondary hover:text-error rounded-md hover:bg-surface transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteModalFile(item);
                              }}
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Columns 3 & 4: Dynamic Parallel Panels (extra panes) ── */}
        {extraPanes.map((pane, idx) => (
          <div
            key={pane.folderId}
            className={cn(
              "space-y-4 animate-slide-in transition-all duration-300 w-full",
              "flex-1 min-w-0",
              activeMobileTab === `parallel-${idx}` ? "block" : "hidden lg:block"
            )}
          >
            {/* Header: Folder name & Close */}
            <div className="flex items-center justify-between bg-surface-elevated p-4 rounded-xl border border-border shadow-sm">
              <div className="flex items-center gap-2 overflow-hidden">
                <Folder className="w-5 h-5 text-accent shrink-0" />
                <span className="font-bold text-text-primary truncate text-sm">
                  {pane.folderName}
                </span>
              </div>
              <button
                onClick={() => closePane(idx)}
                className="p-1.5 text-text-secondary hover:bg-error/10 hover:text-error rounded-md transition-colors shrink-0"
                title="Cerrar vista paralela"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Pane content */}
            <div
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setExtraPanes(prev => prev.map((p, i) => i === idx ? { ...p, isDragOver: true } : p)); }}
              onDragLeave={() => setExtraPanes(prev => prev.map((p, i) => i === idx ? { ...p, isDragOver: false } : p))}
              onDrop={(e) => {
                e.preventDefault();
                setExtraPanes(prev => prev.map((p, i) => i === idx ? { ...p, isDragOver: false } : p));
                try {
                  const draggedData = e.dataTransfer.getData('text/plain');
                  if (!draggedData) return;
                  let draggedItemIds: string[] = [];
                  try {
                    draggedItemIds = JSON.parse(draggedData);
                  } catch {
                    draggedItemIds = [draggedData];
                  }
                  handleMoveItems(draggedItemIds, pane.folderId, currentFolderId);
                } catch (err) {
                  console.error(err);
                }
              }}
              className={cn(
                "relative bg-surface rounded-2xl border overflow-hidden min-h-[470px] transition-all duration-200",
                pane.isDragOver ? "border-accent bg-accent/5 ring-2 ring-accent/20" : "border-border"
              )}
            >
              {pane.isLoading ? (
                <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>
              ) : pane.items.length === 0 ? (
                <div className="p-16 text-center text-text-secondary text-sm">
                  <Folder className="w-12 h-12 mx-auto mb-4 opacity-40 text-accent" />
                  <p className="font-medium">La carpeta está vacía.</p>
                  <p className="text-xs mt-1 text-text-secondary/70">Arrastra archivos aquí.</p>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {pane.items.map((item: any) => {
                    const isFolder = item.mimeType === 'application/vnd.google-apps.folder';
                    const isAudio = item.mimeType.startsWith('audio/');

                    return (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={(e) => handleItemDragStart(e, item.id)}
                        onDragOver={isFolder ? (e) => { e.preventDefault(); e.stopPropagation(); } : undefined}
                        onDrop={isFolder ? (e) => handleItemDrop(e, item.id, pane.folderId) : undefined}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          if (isFolder) {
                            navigatePaneTo(idx, item.id, item.name);
                          } else if (item.webViewLink) {
                            window.open(item.webViewLink, '_blank');
                          }
                        }}
                        className="group relative flex items-center p-3 transition-colors cursor-pointer hover:bg-surface-elevated/80"
                      >
                        {isAudio ? (
                          <div className="flex-1 min-w-0 w-full flex items-center pr-2">
                            <WaveformPlayer
                              fileId={item.id}
                              fileName={item.name}
                              versions={item.versions}
                              currentFolderId={pane.folderId}
                              onRefresh={() => {
                                fetchPaneItems(pane.folderId);
                                fetchItems(currentFolderId);
                                fetchRecentFiles();
                              }}
                              modifiedTime={item.modifiedTime || item.createdTime}
                            />
                          </div>
                        ) : (
                          <>
                            <div className="w-10 flex justify-center shrink-0">
                              {getIcon(item.mimeType, item.name)}
                            </div>

                            <div className="flex-1 min-w-0 mr-14 flex flex-col justify-center">
                              <div className="font-medium text-text-primary truncate text-xs flex items-center gap-2">
                                {item.name}
                                {item.expiresAt && <span title={`Expira: ${new Date(item.expiresAt).toLocaleString()}`}><Timer className="w-3.5 h-3.5 text-accent opacity-70 shrink-0" /></span>}
                              </div>
                              {!isFolder && (
                                <div className="text-[9px] text-text-secondary mt-0.5 flex items-center gap-1.5 flex-wrap">
                                  <span className="font-mono bg-surface px-1 py-0.5 rounded border border-border/30">{formatModificationTime(item.modifiedTime || item.createdTime)}</span>
                                </div>
                              )}
                            </div>

                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all bg-surface-elevated/95 backdrop-blur-md p-1 rounded-lg shadow-sm border border-border/50 translate-x-0 lg:translate-x-2 lg:group-hover:translate-x-0">
                              <button
                                className="p-1.5 text-text-secondary hover:text-accent rounded-md hover:bg-surface"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShareModalFile(item);
                                }}
                                title="Compartir"
                              >
                                <Share2 className="w-3.5 h-3.5" />
                              </button>
                              {!isFolder && (
                                <a
                                  href={item.webContentLink || item.webViewLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  download={item.name}
                                  onClick={(e) => e.stopPropagation()}
                                  className="p-1.5 text-text-secondary hover:text-text-primary rounded-md hover:bg-surface"
                                  title="Descargar"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </a>
                              )}
                              <button
                                className="p-1.5 text-text-secondary hover:text-error rounded-md hover:bg-surface"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteModalFile(item);
                                }}
                                title="Eliminar"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* ── Vista Paralela drop zone: always anchored to the far right, hidden at max 4 panels ── */}
        {extraPanes.length < 2 && (
          <div
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsRightDropZoneDragOver(true); }}
            onDragLeave={() => setIsRightDropZoneDragOver(false)}
            onDrop={handleRightDropZoneDrop}
            className={cn(
              "hidden lg:flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl transition-all duration-300 cursor-pointer select-none shrink-0 group lg:min-h-[550px] lg:w-14",
              isRightDropZoneDragOver
                ? "bg-accent/15 border-accent text-accent shadow-lg shadow-accent/10 scale-[1.02]"
                : "bg-surface-elevated/30 border-border/60 hover:bg-surface-elevated/60 hover:border-accent/40 text-text-secondary hover:text-accent"
            )}
            title="Arrastra una carpeta aquí para abrir en vista dividida (hasta 4 columnas)"
          >
            <FolderOpen className="w-5 h-5 group-hover:scale-110 transition-transform shrink-0" />
            <div
              className="text-[9px] font-bold uppercase tracking-widest text-center"
              style={{ writingMode: 'vertical-lr' }}
            >
              VISTA PARALELA
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {shareModalFile && (
        <ShareModal
          isOpen={true}
          onClose={() => setShareModalFile(null)}
          fileId={shareModalFile.id}
          fileName={shareModalFile.name}
          webViewLink={shareModalFile.webViewLink}
          webContentLink={shareModalFile.webContentLink}
        />
      )}

      {deleteModalFile && (
        <DeleteModal
          isOpen={true}
          onClose={() => setDeleteModalFile(null)}
          fileId={deleteModalFile.id}
          fileName={deleteModalFile.name}
          currentExpiration={deleteModalFile.expiresAt}
          onDeleted={() => {
            fetchItems(currentFolderId);
            fetchRecentFiles();
          }}
        />
      )}

    </div>
  );
}
