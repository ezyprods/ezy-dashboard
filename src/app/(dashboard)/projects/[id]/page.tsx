'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from "@/components/ui/Button";
import { ArrowLeft, Folder, FileAudio, File as FileIcon, FileImage, FileText, Film, UploadCloud, Loader2, Music, CheckSquare, Send, DollarSign, ExternalLink, FolderOpen, Headphones } from "lucide-react";
import { WaveformPlayer } from '@/components/projects/WaveformPlayer';
import { ProductionGridBoard } from '@/components/projects/ProductionGrid';
import { TimeTrackerWidget } from '@/components/projects/TimeTrackerWidget';
import { ProjectPaymentsWidget } from '@/components/projects/ProjectPaymentsWidget';
import { useContextMenu } from '@/lib/contexts/ContextMenuContext';
import { useAudio } from '@/lib/contexts/AudioContext';
import { Play, Download, Eye, Copy, ExternalLink as ExternalLinkIcon, Settings2 } from 'lucide-react';

import { FolderStatusPicker } from '@/components/projects/FolderStatusPicker';
import { CustomSortModal } from '@/components/projects/CustomSortModal';
import { STATUS_CONFIG } from '@/lib/constants';

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const { showMenu } = useContextMenu();
  const { playTrack } = useAudio();
  
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('files');
  const [uploadingTo, setUploadingTo] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{key: 'name'|'date'|'size'|'custom', direction: 'asc'|'desc'}>({key: 'name', direction: 'asc'});
  const [sortModalFolder, setSortModalFolder] = useState<any | null>(null);

  const handleSaveCustomOrder = async (orderedFileIds: string[]) => {
    if (!sortModalFolder || !data?.project) return;
    try {
      const customFileOrders = data.project.customFileOrders || {};
      customFileOrders[sortModalFolder.id] = orderedFileIds;
      
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customFileOrders })
      });
      if (!res.ok) throw new Error('Failed to save order');
      
      // Update local state
      setData({
        ...data,
        project: {
          ...data.project,
          customFileOrders
        }
      });
    } catch (e) {
      console.error(e);
      alert('Error guardando el orden personalizado');
    } finally {
      setSortModalFolder(null);
    }
  };

  useEffect(() => {
    fetchProject();
  }, [projectId]);

  const fetchProject = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) throw new Error('Error cargando el proyecto');
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (folderId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingTo(folderId);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('parentId', folderId);

    try {
      const res = await fetch('/api/files', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('Error subiendo archivo');
      await fetchProject(); // Recargar archivos
    } catch (err) {
      alert('Error subiendo el archivo');
    } finally {
      setUploadingTo(null);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>;
  }

  if (error || !data) {
    return (
      <div className="glass p-8 rounded-xl text-center border-error/20">
        <h2 className="text-xl font-bold mb-2">Error</h2>
        <p className="text-text-secondary mb-6">{error}</p>
        <Button onClick={() => router.back()}>Volver</Button>
      </div>
    );
  }

  const { project, folders } = data;

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="text-text-secondary hover:text-text-primary">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">{project.title}</h1>
            <p className="text-text-secondary text-sm uppercase tracking-widest">{project.type}</p>
          </div>
        </div>
        
        <div className="w-full md:w-80">
          <TimeTrackerWidget projectId={projectId} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-border/50 px-6 overflow-x-auto mt-6">
        {(['files', 'grid', 'payments'] as const).map(tab => (
          <button 
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 border-b-2 transition-colors whitespace-nowrap capitalize ${
              activeTab === tab 
                ? 'border-accent text-text-primary font-medium' 
                : 'border-transparent text-text-secondary hover:text-text-primary font-medium'
            }`}
          >
            {tab === 'files' ? 'Archivos' : tab === 'grid' ? 'Matriz' : 'Pagos'}
          </button>
        ))}
      </div>

      {/* Tab: Files */}
      {activeTab === 'files' && (
        <div className="space-y-8 animate-fade-in">
          {folders.map((folder: any) => (
            <div key={folder.id} className="glass rounded-xl border border-border overflow-hidden">
              <div 
                className="flex justify-between items-center p-4 border-b border-border bg-surface/50"
                onContextMenu={(e) => {
                  e.preventDefault();
                  showMenu(e.clientX, e.clientY, [
                    {
                      label: 'Copiar ID de carpeta',
                      icon: 'Copy',
                      action: () => navigator.clipboard.writeText(folder.id)
                    },
                    {
                      label: 'Personalizar orden',
                      icon: 'Settings2',
                      action: () => setSortModalFolder(folder)
                    }
                  ]);
                }}
              >
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Folder className="w-5 h-5 text-accent" />
                    <h3 className="font-bold text-lg">{folder.name}</h3>
                  </div>
                  
                  <FolderStatusPicker
                    currentStatus={data?.project?.folderStatuses?.[folder.id] || ''}
                    statusConfig={STATUS_CONFIG}
                    onStatusChange={async (newStatus) => {
                      const customStatuses = data?.project?.folderStatuses || {};
                      if (!newStatus) {
                        delete customStatuses[folder.id];
                      } else {
                        customStatuses[folder.id] = newStatus;
                      }
                      
                      try {
                        const res = await fetch(`/api/projects/${projectId}`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ folderStatuses: customStatuses })
                        });
                        if (!res.ok) throw new Error('Error');
                        setData({
                          ...data,
                          project: { ...data.project, folderStatuses: customStatuses }
                        });
                      } catch (err) {
                        alert('Error guardando el estado');
                      }
                    }}
                  />
                </div>
                
                <div className="flex items-center gap-4">
                  <select
                    className="bg-surface border border-border rounded-md text-sm px-2 py-1.5 focus:outline-none focus:border-accent text-text-primary"
                    value={`${sortConfig.key}-${sortConfig.direction}`}
                    onChange={(e) => {
                      const [key, direction] = e.target.value.split('-') as ['name'|'date'|'size', 'asc'|'desc'];
                      setSortConfig({ key, direction });
                    }}
                  >
                    <option value="name-asc">Nombre (A-Z)</option>
                    <option value="name-desc">Nombre (Z-A)</option>
                    <option value="date-desc">Fecha (Más nuevos)</option>
                    <option value="date-asc">Fecha (Más antiguos)</option>
                    <option value="size-desc">Tamaño (Mayor a menor)</option>
                    <option value="custom-asc">Orden personalizado</option>
                  </select>
                  {sortConfig.key === 'custom' && (
                    <Button variant="ghost" size="sm" onClick={() => setSortModalFolder(folder)}>
                      <Settings2 className="w-4 h-4 mr-2" />
                      Personalizar Orden
                    </Button>
                  )}

                  <div>
                    <input 
                      type="file" 
                      id={`upload-${folder.id}`} 
                      className="hidden" 
                      onChange={(e) => handleFileUpload(folder.id, e)}
                    />
                    <label htmlFor={`upload-${folder.id}`}>
                      <Button variant="secondary" size="sm" className="cursor-pointer" asChild>
                        <span>
                          {uploadingTo === folder.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UploadCloud className="w-4 h-4 mr-2" />}
                          Subir Archivo
                        </span>
                      </Button>
                    </label>
                  </div>
                </div>
              </div>
              
              <div className="p-4">
                {folder.files.length === 0 ? (
                  <p className="text-text-secondary text-sm text-center py-4">La carpeta está vacía.</p>
                ) : (
                  <div className="space-y-3">
                    {[...folder.files].sort((a: any, b: any) => {
                      if (sortConfig.key === 'name') {
                        return sortConfig.direction === 'asc' 
                          ? a.name.localeCompare(b.name)
                          : b.name.localeCompare(a.name);
                      } else if (sortConfig.key === 'date') {
                        return sortConfig.direction === 'desc'
                          ? new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime()
                          : new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime();
                      } else if (sortConfig.key === 'size') {
                        return sortConfig.direction === 'desc'
                          ? Number(b.size || 0) - Number(a.size || 0)
                          : Number(a.size || 0) - Number(b.size || 0);
                      } else if (sortConfig.key === 'custom') {
                        const order = data?.project?.customFileOrders?.[folder.id] || [];
                        const indexA = order.indexOf(a.id);
                        const indexB = order.indexOf(b.id);
                        if (indexA === -1 && indexB === -1) return 0;
                        if (indexA === -1) return 1;
                        if (indexB === -1) return -1;
                        return indexA - indexB;
                      }
                      return 0;
                    }).map((file: any) => {
                      const isAudio = file.mimeType?.startsWith('audio/');
                      return isAudio ? (
                        <WaveformPlayer 
                          key={file.id} 
                          fileId={file.id} 
                          fileName={file.name} 
                          onContextMenu={(e) => {
                            e.preventDefault();
                            showMenu(e.clientX, e.clientY, [
                              {
                                label: 'Reproducir',
                                icon: 'Play',
                                action: () => {
                                  playTrack({
                                    id: file.id,
                                    name: file.name.replace(/\.[^/.]+$/, ''),
                                    url: `/api/audio/${file.id}`,
                                    artistName: project.title
                                  });
                                }
                              },
                              {
                                label: 'Ver en Drive',
                                icon: 'ExternalLink',
                                action: () => window.open(file.webViewLink, '_blank')
                              },
                              {
                                label: 'Descargar',
                                icon: 'Download',
                                action: () => {
                                  if (file.webContentLink) {
                                    window.open(file.webContentLink, '_blank');
                                  } else {
                                    window.open(`/api/audio/${file.id}`, '_blank');
                                  }
                                }
                              }
                            ]);
                          }}
                        />
                      ) : (
                        <div 
                          key={file.id} 
                          className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface-elevated/50 hover:border-accent/30 transition-colors"
                          onContextMenu={(e) => {
                            e.preventDefault();
                            showMenu(e.clientX, e.clientY, [
                              {
                                label: 'Ver archivo',
                                icon: 'Eye',
                                action: () => window.open(file.webViewLink, '_blank')
                              },
                              {
                                label: 'Copiar enlace',
                                icon: 'Copy',
                                action: () => {
                                  navigator.clipboard.writeText(file.webViewLink);
                                  // Optional: toast success
                                }
                              }
                            ]);
                          }}
                        >
                          <div className="flex items-center gap-3">
                            {file.mimeType?.startsWith('image/') ? <FileImage className="w-5 h-5 text-accent-secondary" /> :
                             file.mimeType?.startsWith('video/') ? <Film className="w-5 h-5 text-warning" /> :
                             file.mimeType === 'application/pdf' ? <FileText className="w-5 h-5 text-error" /> :
                             <FileIcon className="w-5 h-5 text-text-secondary" />}
                            <div>
                              <span className="text-sm font-medium">{file.name}</span>
                              {file.size && <span className="text-[10px] text-text-secondary ml-2">{(Number(file.size) / 1024 / 1024).toFixed(1)} MB</span>}
                            </div>
                          </div>
                          <a href={file.webViewLink} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline flex items-center gap-1"><ExternalLink className="w-3 h-3" /> Drive</a>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Grid (Matrix) */}
      {activeTab === 'grid' && (
        <ProductionGridBoard projectId={projectId} />
      )}

      {/* Tab: Payments */}
      {activeTab === 'payments' && (
        <ProjectPaymentsWidget projectId={projectId} initialBudget={project.budget || 0} artistId={project.artistId} />
      )}
      
      {sortModalFolder && (
        <CustomSortModal 
          folderName={sortModalFolder.name} 
          files={sortModalFolder.files} 
          onClose={() => setSortModalFolder(null)} 
          onSave={handleSaveCustomOrder} 
        />
      )}
    </div>
  );
}
