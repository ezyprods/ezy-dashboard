'use client';

import { useState, useRef } from 'react';
import { Button } from "@/components/ui/Button";
import { Plus, Search, LayoutGrid, List as ListIcon, Filter, Share2, UploadCloud } from "lucide-react";
import { useArtists } from "@/lib/hooks/useArtists";
import { SERVICE_LABELS } from "@/lib/constants";
import { NewArtistModal } from "@/components/artists/NewArtistModal";
import { Input } from "@/components/ui/Input";
import { useRouter } from 'next/navigation';
import { cn } from "@/lib/utils";
import { customAlert, customConfirm, customPrompt } from '@/lib/dialog';
import { useContextMenu } from '@/lib/contexts/ContextMenuContext';
import { useGlobalDragDrop } from '@/lib/contexts/GlobalDragDropContext';
import { EditArtistModal } from "@/components/artists/EditArtistModal";
import { MoreVertical } from "lucide-react";


export default function ArtistsPage() {
  const { artists, activeArtists, archivedArtists, isLoading, error } = useArtists();
  const [isNewArtistModalOpen, setIsNewArtistModalOpen] = useState(false);
  const router = useRouter();
  const { showMenu } = useContextMenu();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'name-asc' | 'name-desc'>('recent');
  const [hoveredArtistId, setHoveredArtistId] = useState<string | null>(null);
  const dragCounters = useRef<Record<string, number>>({});
  const { isDraggingFiles, triggerUploadForArtist } = useGlobalDragDrop();
  const [editingArtist, setEditingArtist] = useState<any | null>(null);

  const handleDeleteArtist = async (artistId: string, artistName: string) => {
    if (!await customConfirm(`¿Estás seguro de que quieres eliminar a ${artistName}? Esto borrará su configuración.`)) return;
    try {
      const res = await fetch(`/api/artists/${artistId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al eliminar el artista');
      customAlert('Artista eliminado correctamente');
      window.location.reload(); // Quick refresh
    } catch (e: any) {
      customAlert(e.message);
    }
  };

  const handleArtistDragEnter = (e: React.DragEvent, artistId: string) => {
    e.preventDefault();
    dragCounters.current[artistId] = (dragCounters.current[artistId] || 0) + 1;
    setHoveredArtistId(artistId);
  };

  const handleArtistDragLeave = (e: React.DragEvent, artistId: string) => {
    dragCounters.current[artistId] = (dragCounters.current[artistId] || 1) - 1;
    if (dragCounters.current[artistId] <= 0) {
      dragCounters.current[artistId] = 0;
      setHoveredArtistId(prev => prev === artistId ? null : prev);
    }
  };

  const handleArtistDrop = (e: React.DragEvent, artistId: string) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounters.current[artistId] = 0;
    setHoveredArtistId(null);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      triggerUploadForArtist(files, artistId);
    }
  };

  const filteredArtists = activeArtists
    .filter(artist => 
      artist.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      artist.genre?.some(g => g.toLowerCase().includes(searchQuery.toLowerCase()))
    )
    .sort((a, b) => {
      if (sortBy === 'name-asc') return a.name.localeCompare(b.name);
      if (sortBy === 'name-desc') return b.name.localeCompare(a.name);
      
      // Default: recent (last accessed via localStorage, fallback to updatedAt)
      let accessedA = 0, accessedB = 0;
      if (typeof window !== 'undefined') {
        const storedA = localStorage.getItem(`accessed_${a.id}`);
        const storedB = localStorage.getItem(`accessed_${b.id}`);
        accessedA = storedA ? parseInt(storedA, 10) : (a.updatedAt ? new Date(a.updatedAt).getTime() : 0);
        accessedB = storedB ? parseInt(storedB, 10) : (b.updatedAt ? new Date(b.updatedAt).getTime() : 0);
      } else {
        accessedA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        accessedB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      }
      return accessedB - accessedA;
    });

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <NewArtistModal 
        isOpen={isNewArtistModalOpen} 
        onClose={() => setIsNewArtistModalOpen(false)} 
      />
      {editingArtist && (
        <EditArtistModal
          isOpen={!!editingArtist}
          onClose={() => setEditingArtist(null)}
          artist={editingArtist}
        />
      )}

      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Artistas</h1>
          <p className="text-text-secondary mt-1">
            Gestiona los artistas con los que trabajas y sus carpetas de Drive.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <Button onClick={() => setIsNewArtistModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Artista
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 glass rounded-xl p-2 border border-border">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
          <Input 
            placeholder="Buscar artista por nombre o género..." 
            className="pl-9 bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 px-2 w-full sm:w-auto border-t sm:border-t-0 sm:border-l border-border pt-2 sm:pt-0">
          <select 
            className="bg-surface border border-border text-text-secondary text-sm rounded-lg px-2 py-1.5 focus:outline-none focus:border-accent"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'recent' | 'name-asc' | 'name-desc')}
          >
            <option value="recent">Recientes</option>
            <option value="name-asc">Nombre (A-Z)</option>
            <option value="name-desc">Nombre (Z-A)</option>
          </select>
          <div className="flex items-center bg-surface-elevated rounded-lg p-1 ml-1">
            <button 
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-surface shadow-sm text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-surface shadow-sm text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
            >
              <ListIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Drag hint banner removed as requested */}

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="flex flex-col items-center text-text-secondary">
            <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin mb-4" />
            <p>Cargando artistas...</p>
          </div>
        </div>
      ) : error ? (
        <div className="glass rounded-xl p-8 border border-error/20 text-center">
          <p className="text-error font-medium mb-2">Error al cargar los artistas</p>
          <p className="text-text-secondary text-sm">{error}</p>
        </div>
      ) : filteredArtists.length === 0 ? (
        <div className="glass rounded-xl p-12 border border-dashed border-border text-center flex flex-col items-center">
          <div className="w-16 h-16 bg-surface-elevated rounded-full flex items-center justify-center mb-4">
            <Search className="w-6 h-6 text-text-secondary" />
          </div>
          <h3 className="text-lg font-medium text-text-primary mb-1">No se encontraron artistas</h3>
          <p className="text-text-secondary mb-6 max-w-sm">
            {searchQuery ? 'Prueba a buscar con otro término o género.' : 'Aún no tienes ningún artista creado en tu Drive.'}
          </p>
          {!searchQuery && (
            <Button onClick={() => setIsNewArtistModalOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Añadir tu primer artista
            </Button>
          )}
        </div>
      ) : (
        <div className={
          viewMode === 'grid' 
            ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4" 
            : "space-y-3"
        }>
          {filteredArtists.map((artist) => (
            <div 
              key={artist.id} 
              onClick={() => {
                if (isDraggingFiles) return; // don't navigate while dragging
                if (typeof window !== 'undefined') {
                  localStorage.setItem(`accessed_${artist.id}`, Date.now().toString());
                }
                router.push(`/artists/${artist.id}`);
              }}
              onDragEnter={(e) => handleArtistDragEnter(e, artist.id)}
              onDragLeave={(e) => handleArtistDragLeave(e, artist.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleArtistDrop(e, artist.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                showMenu(e.clientX, e.clientY, [
                  { label: 'Ver Perfil', icon: 'User', action: () => router.push(`/artists/${artist.id}`) },
                  { label: 'Editar Perfil', icon: 'Edit3', action: () => setEditingArtist(artist) },
                  { label: 'Portal del Artista', icon: 'ExternalLink', action: () => window.open(`/portal/${artist.id}`, '_blank') },
                  { label: 'Copiar Enlace Portal', icon: 'Copy', action: () => {
                    navigator.clipboard.writeText(`${window.location.origin}/portal/${artist.id}`);
                    customAlert('Enlace copiado');
                  }},
                  { separator: true },
                  { label: 'Eliminar', icon: 'Trash2', variant: 'danger', action: () => handleDeleteArtist(artist.id, artist.name) },
                ]);
              }}
              data-context="artist"
              data-artist-id={artist.id}
              className={`bg-surface-elevated border card-hover cursor-pointer group rounded-xl overflow-hidden relative transition-all duration-150 ${
                viewMode === 'list' ? 'flex items-center p-4 gap-6' : 'p-4 flex flex-col gap-3'
              } ${
                hoveredArtistId === artist.id
                  ? 'border-accent ring-2 ring-accent/30 scale-[1.02] shadow-lg shadow-accent/10'
                  : 'border-border'
              }`}
            >
              {/* Drop-over label */}
              {hoveredArtistId === artist.id && (
                <div className="absolute inset-0 bg-accent/10 backdrop-blur-[1px] z-10 flex items-center justify-center rounded-xl pointer-events-none">
                  <div className="flex items-center gap-2 bg-accent text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg">
                    <UploadCloud className="w-4 h-4" />
                    Subir a {artist.name}
                  </div>
                </div>
              )}
              <div className={cn("flex items-center", viewMode === 'list' ? "gap-6 flex-1" : "gap-3")}>
                <div className={cn(
                  "rounded-full bg-surface border-2 border-border flex items-center justify-center overflow-hidden shrink-0",
                  viewMode === 'grid' ? "w-12 h-12" : "w-10 h-10 border-none"
                )}>
                  {artist.photoUrl ? (
                    <img src={artist.photoUrl} alt={artist.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                  ) : (
                    <span className="font-bold text-sm text-text-secondary">{artist.name.charAt(0)}</span>
                  )}
                </div>
                
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-text-primary text-base leading-tight group-hover:text-accent transition-colors truncate">{artist.name}</h3>
                  <p className="text-xs text-text-secondary mt-0.5 truncate">{artist.activeProject || 'Sin proyecto activo'}</p>
                </div>
              </div>

              {/* Tags & Services */}
              <div className={cn("flex flex-wrap items-center gap-2", viewMode === 'list' ? "flex-1 justify-end" : "")}>
                {(!artist.genre?.length && !artist.services?.length && viewMode === 'grid') && (
                  <span className="text-xs text-text-secondary/60 italic">Sin etiquetas</span>
                )}
                
                {artist.genre?.slice(0, 2).map(g => (
                  <span key={g} className="text-[10px] uppercase tracking-wider font-semibold text-text-secondary bg-surface px-2 py-1 rounded-md">
                    {g}
                  </span>
                ))}
                
                {artist.services?.slice(0, 3).map((service) => (
                  <span key={service} className="px-2 py-1 rounded-md text-[10px] font-medium bg-accent/10 border border-accent/20 text-accent-light whitespace-nowrap">
                    {SERVICE_LABELS[service] || service}
                  </span>
                ))}
              </div>

              {/* Hover Actions (Grid only) */}
              {viewMode === 'grid' && (
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-20">
                  <button 
                    onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(`${window.location.origin}/portal/${artist.id}`); customAlert('Enlace de portal copiado'); }}
                    className="p-1.5 bg-surface-elevated/90 backdrop-blur-sm hover:bg-accent hover:text-white rounded-md text-text-secondary transition-colors shadow-sm"
                    title="Copiar Portal"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                  <div 
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      showMenu(rect.left, rect.bottom + 5, [
                        { label: 'Ver Perfil', icon: 'User', action: () => router.push(`/artists/${artist.id}`) },
                        { label: 'Editar Perfil', icon: 'Edit3', action: () => setEditingArtist(artist) },
                        { label: 'Portal del Artista', icon: 'ExternalLink', action: () => window.open(`/portal/${artist.id}`, '_blank') },
                        { label: 'Copiar Enlace Portal', icon: 'Copy', action: () => {
                          navigator.clipboard.writeText(`${window.location.origin}/portal/${artist.id}`);
                          customAlert('Enlace copiado');
                        }},
                        { separator: true },
                        { label: 'Eliminar', icon: 'Trash2', variant: 'danger', action: () => handleDeleteArtist(artist.id, artist.name) },
                      ]);
                    }}
                  >
                    <button className="p-1.5 rounded-md hover:bg-surface-elevated text-text-secondary hover:text-text-primary transition-colors bg-surface-elevated/90 backdrop-blur-sm border border-transparent hover:border-border shadow-sm">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
