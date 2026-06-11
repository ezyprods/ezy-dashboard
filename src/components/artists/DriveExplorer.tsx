'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Folder, FileAudio, File as FileIcon, FileImage, FileText, Film, ChevronRight, Loader2, UploadCloud, FolderPlus, ArrowLeft, MoreVertical, Link as LinkIcon, Trash2, Edit3, Plus, ExternalLink, Undo, Download, FolderOpen } from 'lucide-react';
import { WaveformPlayer } from '@/components/projects/WaveformPlayer';
import { useContextMenu } from '@/lib/contexts/ContextMenuContext';
import { customAlert, customConfirm, customPrompt } from '@/lib/dialog';
import { cn } from '@/lib/utils';

interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  webViewLink?: string;
  versions?: DriveItem[];
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

export function DriveExplorer({ rootFolderId, rootName }: { rootFolderId: string, rootName: string }) {
  const [currentFolderId, setCurrentFolderId] = useState(rootFolderId);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([{ id: rootFolderId, name: rootName }]);
  const [items, setItems] = useState<DriveItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const { showMenu } = useContextMenu();

  // Selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);

  // Undo Stack
  const [actionStack, setActionStack] = useState<ActionHistory[]>([]);
  const [toast, setToast] = useState<{ message: string, action?: ActionHistory } | null>(null);

  // Clear selection when changing folder
  useEffect(() => {
    setSelectedIds([]);
    setLastSelectedIndex(null);
  }, [currentFolderId]);

  useEffect(() => {
    fetchItems(currentFolderId);
  }, [currentFolderId]);

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
      // Single click - just select this one, or open if folder
      if (item.mimeType === 'application/vnd.google-apps.folder') {
        navigateTo(item.id, item.name);
      } else {
        setSelectedIds([item.id]);
        setLastSelectedIndex(index);
      }
    }
  };

  const undoLastAction = async () => {
    if (actionStack.length === 0) return;
    const lastAction = actionStack[actionStack.length - 1];
    setActionStack(prev => prev.slice(0, -1));

    setIsLoading(true);
    setToast(null);

    try {
      if (lastAction.type === 'MOVE' && lastAction.oldParentId) {
        for (const item of lastAction.items) {
          await fetch('/api/files', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileId: item.id, newParentId: lastAction.oldParentId, oldParentId: lastAction.newParentId }),
          });
        }
        customAlert(`Deshecho: Se han movido ${lastAction.items.length} elementos de vuelta.`);
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
    } catch (err: any) {
      customAlert('Error al deshacer: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
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
        setSelectedIds([]);
        setLastSelectedIndex(null);
      } else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        undoLastAction();
      }
    };
    
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [selectedIds, items, actionStack]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setIsUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const formData = new FormData();
        formData.append('file', files[i]);
        formData.append('parentId', currentFolderId);
        
        await fetch('/api/files', { method: 'POST', body: formData });
      }
      customAlert('Archivos subidos con éxito');
      fetchItems(currentFolderId);
    } catch (err) {
      customAlert('Error al subir archivos');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);

    // If it's an internal drag, we ignore it here
    const internalItemId = e.dataTransfer.getData('text/plain');
    if (internalItemId) return;

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    
    setIsUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const formData = new FormData();
        formData.append('file', files[i]);
        formData.append('parentId', currentFolderId);
        
        await fetch('/api/files', { method: 'POST', body: formData });
      }
      customAlert('Archivos subidos con éxito');
      fetchItems(currentFolderId);
    } catch (err) {
      customAlert('Error al subir archivos');
    } finally {
      setIsUploading(false);
    }
  };

  const handleItemDragStart = (e: React.DragEvent, itemId: string) => {
    e.stopPropagation();
    const idsToDrag = selectedIds.includes(itemId) ? selectedIds : [itemId];
    e.dataTransfer.setData('text/plain', JSON.stringify(idsToDrag));
  };

  const handleItemDrop = async (e: React.DragEvent, targetFolderId: string) => {
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
        // Fallback for single item dragging
        draggedItemIds = [draggedData];
      }
      
      const validIdsToMove = draggedItemIds.filter(id => id !== targetFolderId);
      if (validIdsToMove.length === 0) return;

      setIsLoading(true);
      const movedItems = items.filter(i => validIdsToMove.includes(i.id));

      for (const fileId of validIdsToMove) {
        await fetch('/api/files', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId, newParentId: targetFolderId, oldParentId: currentFolderId }),
        });
      }
      
      setActionStack(prev => [...prev, {
        type: 'MOVE',
        items: movedItems,
        oldParentId: currentFolderId,
        newParentId: targetFolderId
      }]);
      
      setSelectedIds([]);
      fetchItems(currentFolderId);
    } catch (err: any) { 
      customAlert(err.message); 
      setIsLoading(false);
    }
  };

  const handleCreateFolder = async () => {
    const name = await customPrompt('Nombre de la nueva carpeta:');
    if (!name) return;
    
    try {
      // Usaremos la API que crearemos ahora
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parentId: currentFolderId })
      });
      if (!res.ok) throw new Error('Error al crear la carpeta');
      fetchItems(currentFolderId);
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
      
      setSelectedIds([]);
      fetchItems(currentFolderId);
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
    } catch (e) {
      customAlert('Error al renombrar');
    }
  };

  const getIcon = (mimeType: string) => {
    if (mimeType === 'application/vnd.google-apps.folder') return <Folder className="w-5 h-5 text-accent" />;
    if (mimeType.startsWith('audio/')) return <FileAudio className="w-5 h-5 text-purple-400" />;
    if (mimeType.startsWith('image/')) return <FileImage className="w-5 h-5 text-green-400" />;
    if (mimeType.startsWith('video/')) return <Film className="w-5 h-5 text-red-400" />;
    if (mimeType.includes('pdf')) return <FileText className="w-5 h-5 text-orange-400" />;
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

  return (
    <div 
      className="relative animate-fade-in space-y-6 rounded-xl transition-all"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag Overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-surface/80 backdrop-blur-[2px] rounded-xl border-2 border-dashed border-accent m-0" style={{ margin: 0 }}>
          <div className="bg-surface-elevated p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-4 animate-in zoom-in-95 duration-200">
            <div className="w-20 h-20 bg-accent/10 text-accent rounded-full flex items-center justify-center">
              <UploadCloud className="w-10 h-10 animate-bounce" />
            </div>
            <div className="text-center">
              <h3 className="text-xl font-bold text-text-primary">Suelta los archivos aquí</h3>
              <p className="text-sm text-text-secondary mt-1">Se subirán automáticamente a esta carpeta de Drive</p>
            </div>
          </div>
        </div>
      )}

      {/* Top Bar: Breadcrumbs & Actions */}
      <div className="flex items-center justify-between bg-surface-elevated p-4 rounded-xl border border-border">
        <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap">
          {breadcrumbs.map((crumb, idx) => (
            <div 
              key={crumb.id} 
              className="flex items-center gap-2"
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => {
                // If it's not the current folder, allow drop
                if (idx < breadcrumbs.length - 1) {
                  handleItemDrop(e, crumb.id);
                }
              }}
            >
              <button 
                onClick={() => navigateUp(idx)}
                className={`hover:text-accent transition-colors px-2 py-1 rounded ${idx === breadcrumbs.length - 1 ? 'text-text-primary font-medium' : 'text-text-secondary hover:bg-surface'}`}
              >
                {crumb.name}
              </button>
              {idx < breadcrumbs.length - 1 && <ChevronRight className="w-4 h-4 text-text-secondary" />}
            </div>
          ))}
        </div>
        
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="secondary" size="sm" onClick={handleCreateFolder}>
            <FolderPlus className="w-4 h-4 mr-2" />
            Nueva Carpeta
          </Button>
          <div className="relative">
            <input 
              type="file" 
              multiple 
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
              onChange={handleFileUpload} 
              disabled={isUploading}
            />
            <Button size="sm" disabled={isUploading}>
              {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UploadCloud className="w-4 h-4 mr-2" />}
              Subir Archivos
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>
        ) : groupedItems.length === 0 ? (
          <div className="p-16 text-center text-text-secondary">
            <Folder className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>La carpeta está vacía.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {groupedItems.map((item: any) => {
              const isFolder = item.mimeType === 'application/vnd.google-apps.folder';
              const isAudio = item.mimeType.startsWith('audio/');
              
              return (
                <div 
                  key={item.id}
                  draggable
                  onDragStart={(e) => handleItemDragStart(e, item.id)}
                  onDragOver={isFolder ? (e) => { e.preventDefault(); e.stopPropagation(); } : undefined}
                  onDrop={isFolder ? (e) => handleItemDrop(e, item.id) : undefined}
                  className={cn(
                    "group flex items-center p-3 transition-colors cursor-pointer border-l-2",
                    selectedIds.includes(item.id) 
                      ? "bg-accent/10 border-accent" 
                      : "border-transparent hover:bg-surface-elevated"
                  )}
                  onClick={(e) => handleItemClick(e, groupedItems.indexOf(item), item, groupedItems)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // If right clicking an unselected item, select only it
                    let activeIds = selectedIds;
                    if (!selectedIds.includes(item.id)) {
                      setSelectedIds([item.id]);
                      setLastSelectedIndex(groupedItems.indexOf(item));
                      activeIds = [item.id];
                    }

                    const multiple = activeIds.length > 1;
                    
                    let menuItems: any[] = [];
                    if (multiple) {
                       menuItems = [
                         { label: `Mover ${activeIds.length} elementos...`, icon: 'FolderOpen', action: () => customAlert('Arrastra los elementos a una carpeta para moverlos.') },
                         { separator: true },
                         { label: `Eliminar ${activeIds.length} elementos`, icon: 'Trash2', variant: 'danger', action: () => handleDelete(item.id, false, activeIds) }
                       ];
                    } else if (isFolder) {
                      menuItems = [
                        { label: 'Abrir Carpeta', icon: 'FolderOpen', action: () => navigateTo(item.id, item.name) },
                        { separator: true },
                        { label: 'Renombrar', icon: 'Edit3', action: () => handleRename(item.id, item.name) },
                        { label: 'Copiar Enlace', icon: 'Link', action: () => { navigator.clipboard.writeText(item.webViewLink || ''); customAlert('Enlace copiado'); } },
                        { separator: true },
                        { label: 'Eliminar Carpeta', icon: 'Trash2', variant: 'danger', action: () => handleDelete(item.id, true) }
                      ];
                    } else if (isAudio) {
                      menuItems = [
                        { label: 'Reproducir / Pausar', icon: 'Play', action: () => window.open(item.webViewLink, '_blank') },
                        { label: 'Ver Archivo', icon: 'ExternalLink', action: () => window.open(item.webViewLink, '_blank') },
                        { label: 'Descargar', icon: 'Download', action: () => { window.open(item.webViewLink, '_blank'); } },
                        { label: 'Copiar Enlace', icon: 'Link', action: () => { navigator.clipboard.writeText(item.webViewLink || ''); customAlert('Enlace copiado'); } },
                        { separator: true },
                        { label: 'Renombrar', icon: 'Edit3', action: () => handleRename(item.id, item.name) },
                        { separator: true },
                        { label: 'Eliminar Audio', icon: 'Trash2', variant: 'danger', action: () => handleDelete(item.id, false, activeIds) }
                      ];
                    } else {
                      menuItems = [
                        { label: 'Ver Archivo', icon: 'ExternalLink', action: () => window.open(item.webViewLink, '_blank') },
                        { label: 'Descargar', icon: 'Download', action: () => { window.open(item.webViewLink, '_blank'); } },
                        { label: 'Copiar Enlace', icon: 'Link', action: () => { navigator.clipboard.writeText(item.webViewLink || ''); customAlert('Enlace copiado'); } },
                        { separator: true },
                        { label: 'Renombrar', icon: 'Edit3', action: () => handleRename(item.id, item.name) },
                        { separator: true },
                        { label: 'Eliminar Archivo', icon: 'Trash2', variant: 'danger', action: () => handleDelete(item.id, false, activeIds) }
                      ];
                    }
                    showMenu(e.clientX, e.clientY, menuItems);
                  }}
                >
                  <div className="w-10 flex justify-center shrink-0">
                    {getIcon(item.mimeType)}
                  </div>
                  
                  {!isAudio && (
                    <div className="flex-1 min-w-0 mr-4">
                      <div className="font-medium text-text-primary truncate">{item.name}</div>
                      {!isFolder && item.size && (
                        <div className="text-xs text-text-secondary">
                          {(parseInt(item.size) / (1024 * 1024)).toFixed(2)} MB
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Waveform for audio files directly in explorer */}
                  {isAudio && (
                    <div className="flex-1 mr-4">
                      <WaveformPlayer 
                        fileId={item.id} 
                        fileName={item.name} 
                        versions={item.versions}
                        currentFolderId={currentFolderId}
                        onRefresh={() => fetchItems(currentFolderId)}
                      />
                    </div>
                  )}

                  {!isAudio && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        className="p-2 text-text-secondary hover:text-text-primary rounded hover:bg-surface"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRename(item.id, item.name);
                        }}
                        title="Renombrar"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button 
                        className="p-2 text-text-secondary hover:text-text-primary rounded hover:bg-surface"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(item.webViewLink, '_blank');
                        }}
                        title="Ver en Drive"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                      <button 
                        className="p-2 text-text-secondary hover:text-error rounded hover:bg-surface"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(item.id, isFolder);
                        }}
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
