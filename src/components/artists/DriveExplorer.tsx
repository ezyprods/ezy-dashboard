'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Folder, FileAudio, File as FileIcon, FileImage, FileText, ChevronRight, Loader2, UploadCloud, FolderPlus, ArrowLeft, MoreVertical, Link as LinkIcon, Trash2, Edit3, Plus } from 'lucide-react';
import { WaveformPlayer } from '@/components/projects/WaveformPlayer';
import { useContextMenu } from '@/lib/contexts/ContextMenuContext';
import { customAlert, customConfirm, customPrompt } from '@/lib/dialog';

interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  webViewLink?: string;
}

interface Breadcrumb {
  id: string;
  name: string;
}

export function DriveExplorer({ rootFolderId, rootName }: { rootFolderId: string, rootName: string }) {
  const [currentFolderId, setCurrentFolderId] = useState(rootFolderId);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([{ id: rootFolderId, name: rootName }]);
  const [items, setItems] = useState<DriveItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const { showMenu } = useContextMenu();

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

  const handleDelete = async (itemId: string, isFolder: boolean) => {
    if (!await customConfirm(`¿Eliminar de Drive de forma permanente?`)) return;
    try {
      await fetch(`/api/files?id=${itemId}`, { method: 'DELETE' });
      fetchItems(currentFolderId);
    } catch (e) {
      customAlert('Error al eliminar');
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

  // Sort: folders first
  const sortedItems = [...items].sort((a, b) => {
    const isAFolder = a.mimeType === 'application/vnd.google-apps.folder';
    const isBFolder = b.mimeType === 'application/vnd.google-apps.folder';
    if (isAFolder && !isBFolder) return -1;
    if (!isAFolder && isBFolder) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="animate-fade-in space-y-6">
      {/* Top Bar: Breadcrumbs & Actions */}
      <div className="flex items-center justify-between bg-surface-elevated p-4 rounded-xl border border-border">
        <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap">
          {breadcrumbs.map((crumb, idx) => (
            <div key={crumb.id} className="flex items-center gap-2">
              <button 
                onClick={() => navigateUp(idx)}
                className={`hover:text-accent transition-colors ${idx === breadcrumbs.length - 1 ? 'text-text-primary font-medium' : 'text-text-secondary'}`}
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
        ) : sortedItems.length === 0 ? (
          <div className="p-16 text-center text-text-secondary">
            <Folder className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>La carpeta está vacía.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {sortedItems.map(item => {
              const isFolder = item.mimeType === 'application/vnd.google-apps.folder';
              const isAudio = item.mimeType.startsWith('audio/');
              
              return (
                <div 
                  key={item.id}
                  className="group flex items-center p-3 hover:bg-surface-elevated transition-colors cursor-pointer"
                  onClick={() => isFolder ? navigateTo(item.id, item.name) : window.open(item.webViewLink, '_blank')}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    showMenu(rect.left + e.nativeEvent.offsetX, rect.top + e.nativeEvent.offsetY, [
                      {
                        label: isFolder ? 'Abrir' : 'Ver en Drive',
                        icon: isFolder ? 'FolderOpen' : 'ExternalLink',
                        action: () => isFolder ? navigateTo(item.id, item.name) : window.open(item.webViewLink, '_blank')
                      },
                      { separator: true },
                      {
                        label: 'Renombrar',
                        icon: 'Edit3',
                        action: () => handleRename(item.id, item.name)
                      },
                      {
                        label: 'Copiar Enlace',
                        icon: 'LinkIcon',
                        action: () => {
                          navigator.clipboard.writeText(item.webViewLink || '');
                          customAlert('Enlace copiado');
                        }
                      },
                      { separator: true },
                      {
                        label: 'Eliminar',
                        icon: 'Trash2',
                        variant: 'danger',
                        action: () => handleDelete(item.id, isFolder)
                      }
                    ]);
                  }}
                >
                  <div className="w-10 flex justify-center shrink-0">
                    {getIcon(item.mimeType)}
                  </div>
                  
                  <div className="flex-1 min-w-0 mr-4">
                    <div className="font-medium text-text-primary truncate">{item.name}</div>
                    {!isFolder && item.size && (
                      <div className="text-xs text-text-secondary">
                        {(parseInt(item.size) / (1024 * 1024)).toFixed(2)} MB
                      </div>
                    )}
                  </div>
                  
                  {/* Waveform for audio files directly in explorer */}
                  {isAudio && (
                    <div className="flex-1 hidden md:block mr-4 opacity-50 group-hover:opacity-100 transition-opacity">
                      <WaveformPlayer fileId={item.id} />
                    </div>
                  )}

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
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
