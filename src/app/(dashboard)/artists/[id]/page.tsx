'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Button } from "@/components/ui/Button";
import { ArrowLeft, RefreshCw, Folder, Mail, Phone, Settings, AlertCircle, Loader2, Plus, Disc, MoreVertical, Calendar, FolderPlus, ExternalLink, Headphones, Copy } from "lucide-react";
import type { Artist, Project } from '@/types';
import { PROJECT_TYPE_LABELS, STATUS_CONFIG } from '@/lib/constants';
import { useProjects } from '@/lib/hooks/useProjects';
import { FolderStatusPicker } from '@/components/projects/FolderStatusPicker';
import { CustomSortModal } from '@/components/projects/CustomSortModal';
import { DriveExplorer } from '@/components/artists/DriveExplorer';
import { ArtistPortalTab } from '@/components/artists/ArtistPortalTab';
import { NewProjectModal } from '@/components/projects/NewProjectModal';
import { getProjectTypeIcon } from '@/lib/utils';
import { ArtistReleasesTab } from '@/components/artists/ArtistReleasesTab';
import { ArtistMatricesTab } from '@/components/artists/ArtistMatricesTab';
import { ArtistCampaignsTab } from '@/components/artists/ArtistCampaignsTab';
import { EditArtistModal } from "@/components/artists/EditArtistModal";
import { useContextMenu } from '@/lib/contexts/ContextMenuContext';
import * as LucideIcons from 'lucide-react';
import { customAlert, customConfirm, customPrompt } from '@/lib/dialog';
import { ArtistAvatar } from "@/components/ui/ArtistAvatar";


export default function ArtistDetailPage() {
  const params = useParams();
  const router = useRouter();
  const artistId = params.id as string;
  const { showMenu } = useContextMenu();
  
  const [artist, setArtist] = useState<Artist | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState('files');
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [isEditArtistModalOpen, setIsEditArtistModalOpen] = useState(false);

  const { projects, isLoading: projectsLoading, fetchProjects } = useProjects(artistId);

  const handleDeleteProject = async (projectId: string) => {
    if (!await customConfirm('¿Estás seguro de que quieres eliminar este proyecto y su carpeta en Google Drive de forma permanente?')) return;
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al eliminar el proyecto');
      customAlert('Proyecto eliminado con éxito');
      fetchProjects();
    } catch (err: any) {
      customAlert(err.message);
    }
  };

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const tab = searchParams.get('tab');
    if (tab && ['files', 'projects', 'campaigns', 'matrices', 'portal'].includes(tab)) {
      setActiveTab(tab);
    }
    fetchArtist();
  }, [artistId]);

  const fetchArtist = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/artists/${artistId}`);
      if (!res.ok) throw new Error('Error cargando el artista');
      const data = await res.json();
      setArtist(data.artist);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch(`/api/artists/${artistId}/sync`, { method: 'POST' });
      if (!res.ok) throw new Error('Error sincronizando la carpeta');
      await fetchArtist();
    } catch (err: any) {
      customAlert(err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>;
  }

  if (error || !artist) {
    return (
      <div className="glass p-8 rounded-xl text-center border-error/20">
        <AlertCircle className="w-12 h-12 text-error mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">Error</h2>
        <p className="text-text-secondary mb-6">{error || 'Artista no encontrado'}</p>
        <Button onClick={() => router.push('/artists')}>Volver a Artistas</Button>
      </div>
    );
  }

  const isOldFolder = false; // Ya no hay carpetas antiguas, todo se auto-sincroniza

  return (
    <div className="space-y-6 animate-fade-in">
      <NewProjectModal isOpen={isNewProjectModalOpen} onClose={() => setIsNewProjectModalOpen(false)} artistId={artistId} />
      {artist && (
        <EditArtistModal
          isOpen={isEditArtistModalOpen}
          onClose={(saved, optimisticData) => {
            setIsEditArtistModalOpen(false);
            if (saved && optimisticData) {
              setArtist(prev => prev ? { ...prev, ...optimisticData } : null);
            }
          }}
          artist={artist}
        />
      )}

      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/artists')} className="text-text-secondary hover:text-text-primary">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-2xl font-bold text-text-primary">Perfil del Artista</h1>
      </div>

      {/* Header Profile */}
      <div className="glass rounded-xl p-4 md:p-5 border border-border relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-accent/10 blur-[80px] rounded-full pointer-events-none" />
        
        <div className="flex flex-col gap-4 relative z-10 w-full">
          
          {/* Left side: Avatar + Info */}
          <div className="flex items-center gap-3 min-w-0">
            <ArtistAvatar name={artist.name || '?'} photoUrl={artist.photoUrl} size="md" className="w-10 h-10 md:w-12 md:h-12" />
            
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-text-primary truncate">{artist.name}</h2>
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-text-secondary text-xs">
                {artist.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {artist.email}</span>}
                {artist.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {artist.phone}</span>}
              </div>
            </div>
          </div>
          
          {/* Right side: Actions */}
          <div className="flex items-center gap-1.5 md:gap-2 overflow-x-auto pb-1 scrollbar-hide w-full">
            <Button variant="outline" size="sm" onClick={() => setIsEditArtistModalOpen(true)} className="h-8 text-xs shrink-0 px-2 md:px-3">
              <LucideIcons.Edit3 className="w-3.5 h-3.5 mr-1.5" />
              Editar Perfil
            </Button>
            <div className="flex items-center h-8 rounded-md border border-accent/30 bg-accent/5 overflow-hidden shrink-0">
              <a
                href={`/portal/${artistId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 h-full flex items-center text-xs font-medium text-accent hover:bg-accent hover:text-white transition-colors"
                title="Ver Portal"
              >
                Portal Artista
              </a>
              <div className="w-[1px] h-4 bg-accent/20" />
              <button
                onClick={() => {
                  const url = `${window.location.origin}/portal/${artistId}`;
                  navigator.clipboard.writeText(url);
                  customAlert('¡Enlace del portal copiado al portapapeles!');
                }}
                className="px-3 h-full flex items-center text-xs font-medium text-accent hover:bg-accent hover:text-white transition-colors"
                title="Copiar Enlace Portal"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
            <a 
              href={`https://drive.google.com/drive/folders/${artistId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 shrink-0 h-8 text-xs px-3 bg-blue-500/10 text-blue-500 border border-blue-500/30 hover:bg-blue-500/20 hover:text-blue-500"
              title="Abrir carpeta en Google Drive"
            >
              <LucideIcons.HardDrive className="w-3.5 h-3.5 mr-1.5" /> Drive
            </a>
            <Button variant="secondary" size="sm" onClick={() => router.push(`/artists/${artistId}/previews`)} className="shrink-0 h-8 text-xs px-3">
              <Headphones className="w-3.5 h-3.5 mr-1.5" /> Gestor Previews
            </Button>
            <Button size="sm" onClick={() => setIsNewProjectModalOpen(true)} className="shrink-0 h-8 text-xs px-3">
              <FolderPlus className="w-3.5 h-3.5 mr-1.5" /> Nuevo Proyecto
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-3 md:gap-6 border-b border-border/50 px-1 overflow-x-auto mt-4 md:mt-8 scrollbar-hide sticky top-0 z-30 bg-background/95 backdrop-blur-md pt-2">
        {(['files', 'projects', 'campaigns', 'matrices', 'portal'] as const).map(tab => (
          <button 
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 pt-1 border-b-2 transition-colors whitespace-nowrap capitalize text-sm min-h-[44px] flex items-end ${
              activeTab === tab 
                ? 'border-accent text-text-primary font-medium' 
                : 'border-transparent text-text-secondary hover:text-text-primary font-medium'
            }`}
          >
            {tab === 'files' ? 'Archivos' : tab === 'projects' ? 'Proyectos' : tab === 'campaigns' ? 'Campañas' : tab === 'matrices' ? 'Matrices' : 'Portal'}
          </button>
        ))}
      </div>

      {/* Tab Content: Campaigns */}
      {activeTab === 'campaigns' && (
        <ArtistCampaignsTab artistId={artistId} projects={projects} />
      )}

      {/* Tab Content: Projects */}
      {activeTab === 'projects' && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold">Proyectos Activos</h3>
            <Button onClick={() => setIsNewProjectModalOpen(true)} disabled={isOldFolder} title={isOldFolder ? "Sincroniza el artista primero" : ""}>
              <Plus className="w-4 h-4 mr-2" /> Nuevo Proyecto
            </Button>
          </div>

          {projectsLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>
          ) : projects.length === 0 ? (
            <div className="glass rounded-xl p-12 text-center text-text-secondary border border-dashed border-border">
              <Disc className="w-12 h-12 mb-4 mx-auto opacity-50" />
              <p>No hay proyectos para este artista.</p>
                <Button variant="link" onClick={() => setIsNewProjectModalOpen(true)}>Crear el primer proyecto</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map(project => {
                const status = STATUS_CONFIG[project.status === 'active' ? 'in_progress' : project.status] || STATUS_CONFIG['not_started'];
                return (
                   <Link 
                    key={project.id} 
                    href={`/projects/${project.id}`}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      showMenu(e.clientX, e.clientY, [
                        {
                          label: 'Abrir proyecto',
                          icon: 'FolderOpen',
                          action: () => router.push(`/projects/${project.id}`)
                        },
                        {
                          label: 'Descargar carpeta completa',
                          icon: 'Download',
                          action: () => {
                            if (project.driveUrl) {
                              window.open(project.driveUrl, '_blank');
                              customAlert('Se abrirá Drive. Haz clic en "Descargar" arriba a la derecha.');
                            } else {
                              customAlert('El enlace no está disponible. Sincroniza el artista.');
                            }
                          }
                        },
                        {
                          label: 'Copiar ID de carpeta',
                          icon: 'Copy',
                          action: () => {
                            navigator.clipboard.writeText(project.id);
                            customAlert('ID de carpeta copiado');
                          }
                        },
                        {
                          label: 'Enlace Google Drive',
                          icon: 'ExternalLink',
                          action: () => {
                            const url = `https://drive.google.com/drive/folders/${project.id}`;
                            navigator.clipboard.writeText(url);
                            customAlert('Enlace de Drive copiado al portapapeles');
                          }
                        },
                        {
                          label: 'Eliminar Proyecto',
                          icon: 'Trash2',
                          variant: 'danger',
                          action: () => handleDeleteProject(project.id)
                        }
                      ]);
                    }}
                    className="bg-surface-elevated rounded-xl p-5 border border-border card-hover block group cursor-pointer"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2">
                        {(() => {
                          const iconName = getProjectTypeIcon(project.type);
                          const IconComponent = (LucideIcons as any)[iconName] || Folder;
                          return <IconComponent className="w-4 h-4 text-accent" />;
                        })()}
                        <span className="text-[10px] uppercase font-bold text-text-secondary tracking-widest">
                          {PROJECT_TYPE_LABELS[project.type] || project.type}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button 
                          className="text-text-secondary hover:text-accent p-1 rounded hover:bg-surface"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const url = `https://drive.google.com/drive/folders/${project.id}`;
                            navigator.clipboard.writeText(url);
                            customAlert('Enlace de Drive copiado al portapapeles');
                          }}
                          title="Copiar enlace a Drive"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          className="text-text-secondary hover:text-text-primary p-1 rounded hover:bg-surface"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            showMenu(rect.left, rect.bottom + 8, [
                              {
                                label: 'Abrir proyecto',
                                icon: 'FolderOpen',
                                action: () => router.push(`/projects/${project.id}`)
                              },
                              {
                                label: 'Descargar carpeta completa',
                                icon: 'Download',
                                action: () => {
                                  if (project.driveUrl) {
                                    window.open(project.driveUrl, '_blank');
                                    customAlert('Se abrirá Drive. Haz clic en "Descargar" arriba a la derecha.');
                                  } else {
                                    customAlert('El enlace no está disponible. Sincroniza el artista.');
                                  }
                                }
                              },
                              {
                                label: 'Copiar ID de carpeta',
                                icon: 'Copy',
                                action: () => {
                                  navigator.clipboard.writeText(project.id);
                                  customAlert('ID de carpeta copiado');
                                }
                              },
                              {
                                label: 'Enlace Google Drive',
                                icon: 'ExternalLink',
                                action: () => {
                                  const url = `https://drive.google.com/drive/folders/${project.id}`;
                                  navigator.clipboard.writeText(url);
                                  customAlert('Enlace de Drive copiado al portapapeles');
                                }
                              },
                              {
                                label: 'Eliminar Proyecto',
                                icon: 'Trash2',
                                variant: 'danger',
                                action: () => handleDeleteProject(project.id)
                              }
                            ]);
                          }}
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    
                    <h4 className="text-lg font-bold text-text-primary mb-1 group-hover:text-accent transition-colors">
                      {project.title}
                    </h4>
                    
                    <div className="flex items-center justify-between mt-4">
                      <div className="flex items-center gap-2 text-xs text-text-secondary">
                        <Folder className="w-3.5 h-3.5" />
                        <span>Sincronizado con Drive</span>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ backgroundColor: status?.bgColor, color: status?.color }}>
                        {status?.label || 'Desconocido'}
                      </span>
                    </div>

                    {project.deliveryDate && (
                      <div className="mt-4 pt-3 border-t border-border/50 flex items-center gap-2 text-xs text-text-secondary">
                        <Calendar className="w-3.5 h-3.5 text-warning" />
                        <span>Entrega: {new Date(project.deliveryDate).toLocaleDateString()}</span>
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab Content: Matrices */}
      {activeTab === 'matrices' && (
        <ArtistMatricesTab artistId={artistId} artistName={artist?.name} />
      )}

      {/* Tab Content: Files (Drive Explorer) */}
      {activeTab === 'files' && (
        <DriveExplorer rootFolderId={artist?.driveFolderId || artistId} rootName={artist?.name || 'Archivos'} artistEmail={artist?.email} artistId={artistId} />
      )}

      {/* Tab Content: Portal */}
      {activeTab === 'portal' && (
        <ArtistPortalTab artistId={artistId} artistName={artist?.name} />
      )}

      {/* Tab Content: Placeholder for others */}
      {activeTab !== 'projects' && activeTab !== 'matrices' && activeTab !== 'files' && activeTab !== 'portal' && (
        <div className="glass rounded-xl p-12 text-center text-text-secondary border border-border animate-fade-in">
          <h3 className="text-lg font-medium text-text-primary mb-2 capitalize">Módulo de {activeTab}</h3>
          <p className="max-w-md mx-auto">Esta sección se está construyendo actualmente.</p>
        </div>
      )}
    </div>
  );
}
