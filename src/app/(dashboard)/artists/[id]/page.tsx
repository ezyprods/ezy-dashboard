'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Button } from "@/components/ui/Button";
import { ArrowLeft, RefreshCw, Folder, Mail, Phone, Settings, AlertCircle, Loader2, Plus, Disc, MoreVertical, Calendar, FolderPlus, ExternalLink, Headphones } from "lucide-react";
import type { Artist, Project } from '@/types';
import { PROJECT_TYPE_LABELS, STATUS_CONFIG } from '@/lib/constants';
import { useProjects } from '@/lib/hooks/useProjects';
import { NewProjectModal } from '@/components/projects/NewProjectModal';
import { NotesEditor } from '@/components/notes/NotesEditor';
import { getProjectTypeIcon } from '@/lib/utils';
import { ArtistReleasesTab } from '@/components/artists/ArtistReleasesTab';
import { ArtistMatricesTab } from '@/components/artists/ArtistMatricesTab';
import { ArtistPaymentsTab } from '@/components/artists/ArtistPaymentsTab';
import { useContextMenu } from '@/lib/contexts/ContextMenuContext';
import * as LucideIcons from 'lucide-react';
import { customAlert, customConfirm, customPrompt } from '@/lib/dialog';


export default function ArtistDetailPage() {
  const params = useParams();
  const router = useRouter();
  const artistId = params.id as string;
  const { showMenu } = useContextMenu();
  
  const [artist, setArtist] = useState<Artist | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState('projects');
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);

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
    <div className="space-y-6 animate-fade-in pb-20">
      <NewProjectModal isOpen={isNewProjectModalOpen} onClose={() => setIsNewProjectModalOpen(false)} artistId={artistId} />

      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/artists')} className="text-text-secondary hover:text-text-primary">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-2xl font-bold text-text-primary">Perfil del Artista</h1>
      </div>

      {/* Header Profile */}
      <div className="glass rounded-xl p-8 border border-border relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-accent/10 blur-[80px] rounded-full pointer-events-none" />
        
        <div className="flex flex-col md:flex-row items-start md:items-center gap-6 relative z-10">
          <div className="w-24 h-24 rounded-full bg-surface-elevated border-2 border-border flex items-center justify-center text-3xl font-bold overflow-hidden shadow-xl shrink-0">
            {artist.photoUrl ? (
              <img src={artist.photoUrl} alt={artist.name || '?'} className="w-full h-full object-cover" />
            ) : (
              (artist.name || '?').charAt(0)
            )}
          </div>
          
          <div className="flex-1 space-y-3">
            <div>
              <h2 className="text-3xl font-bold text-text-primary">{artist.name}</h2>
              <div className="flex items-center gap-3 mt-2 text-text-secondary text-sm">
                {artist.email && <span className="flex items-center gap-1"><Mail className="w-4 h-4" /> {artist.email}</span>}
                {artist.phone && <span className="flex items-center gap-1"><Phone className="w-4 h-4" /> {artist.phone}</span>}
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              {Array.isArray(artist.genre) ? artist.genre.map(g => (
                <span key={g} className="px-2.5 py-1 rounded-md text-xs font-semibold bg-surface border border-border text-text-secondary uppercase tracking-wider">
                  {g}
                </span>
              )) : typeof artist.genre === 'string' && (
                <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-surface border border-border text-text-secondary uppercase tracking-wider">
                  {artist.genre}
                </span>
              )}
            </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-6">
                <div className="flex gap-2">
                  <button
                    onClick={() => setActiveTab('projects')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'projects' ? 'bg-surface-elevated text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-surface/50'}`}
                  >
                    Proyectos
                  </button>
                  <button
                    onClick={() => setActiveTab('notes')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'notes' ? 'bg-surface-elevated text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-surface/50'}`}
                  >
                    Notas
                  </button>
                  <button
                    onClick={() => setActiveTab('files')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'files' ? 'bg-surface-elevated text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-surface/50'}`}
                  >
                    Archivos Drive
                  </button>
                </div>
                <div className="flex flex-col items-end gap-2 mt-6 sm:mt-0">
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="border-accent text-accent hover:bg-accent/10"
                      onClick={() => {
                        const url = `${window.location.origin}/portal/${artistId}`;
                        navigator.clipboard.writeText(url);
                        customAlert('¡Enlace del portal copiado al portapapeles!');
                      }}
                    >
                      Copiar Enlace Portal
                    </Button>
                    <a href={`/portal/${artistId}`} target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-1.5 rounded-md bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors flex items-center gap-1.5 font-medium h-9">
                      Ver
                    </a>
                    <Button variant="secondary" size="sm" onClick={() => router.push(`/artists/${artistId}/previews`)} className="shrink-0 h-9">
                      <Headphones className="w-4 h-4 mr-2" /> Gestor Previews
                    </Button>
                    <Button size="sm" onClick={() => setIsNewProjectModalOpen(true)} className="shrink-0 h-9">
                      <FolderPlus className="w-4 h-4 mr-2" /> Nuevo Proyecto
                    </Button>
                  </div>
                  <p className="text-[10px] text-text-secondary italic text-right max-w-xs">
                    * El portal es una vista unificada para el artista. Muestra los proyectos en progreso, audios y facturación automáticamente.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-border/50 px-2 overflow-x-auto mt-8">
        {(['projects', 'matrices', 'files', 'notes', 'payments'] as const).map(tab => (
          <button 
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 border-b-2 transition-colors whitespace-nowrap capitalize ${
              activeTab === tab 
                ? 'border-accent text-text-primary font-medium' 
                : 'border-transparent text-text-secondary hover:text-text-primary font-medium'
            }`}
          >
            {tab === 'projects' ? 'Proyectos' : tab === 'matrices' ? 'Matrices' : tab === 'files' ? 'Archivos' : tab === 'notes' ? 'Notas' : 'Pagos'}
          </button>
        ))}
      </div>

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
                const status = STATUS_CONFIG[project.status === 'active' ? 'in_progress' : project.status];
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
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            showMenu(rect.left, rect.bottom + 8, [
                              {
                                label: 'Abrir proyecto',
                                icon: 'FolderOpen',
                                action: () => router.push(`/projects/${project.id}`)
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

      {/* Tab Content: Notes */}
      {activeTab === 'notes' && (
        <div className="animate-fade-in space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold">Bloc de Notas</h3>
            <p className="text-sm text-text-secondary">Guarda referencias, acordes, progreso...</p>
          </div>
          <div className="animate-fade-in">
            <NotesEditor endpoint={`/api/artists/${artistId}/notes`} />
          </div>
        </div>
      )}

      {/* Tab Content: Matrices */}
      {activeTab === 'matrices' && (
        <ArtistMatricesTab artistId={artistId} artistName={artist?.name} />
      )}

      {/* Tab Content: Payments */}
      {activeTab === 'payments' && (
        <ArtistPaymentsTab artistId={artistId} />
      )}

      {/* Tab Content: Placeholder for others */}
      {activeTab !== 'projects' && activeTab !== 'notes' && activeTab !== 'matrices' && activeTab !== 'payments' && (
        <div className="glass rounded-xl p-12 text-center text-text-secondary border border-border animate-fade-in">
          <h3 className="text-lg font-medium text-text-primary mb-2 capitalize">Módulo de {activeTab}</h3>
          <p className="max-w-md mx-auto">Esta sección se está construyendo actualmente.</p>
        </div>
      )}
    </div>
  );
}
