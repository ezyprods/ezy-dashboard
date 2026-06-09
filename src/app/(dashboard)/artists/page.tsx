'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/Button";
import { Plus, Search, LayoutGrid, List as ListIcon, Filter } from "lucide-react";
import { useArtists } from "@/lib/hooks/useArtists";
import { SERVICE_LABELS } from "@/lib/constants";
import { NewArtistModal } from "@/components/artists/NewArtistModal";
import { Input } from "@/components/ui/Input";
import { useRouter } from 'next/navigation';

export default function ArtistsPage() {
  const { artists, activeArtists, archivedArtists, isLoading, error } = useArtists();
  const [isNewArtistModalOpen, setIsNewArtistModalOpen] = useState(false);
  const router = useRouter();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredArtists = activeArtists.filter(artist => 
    artist.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    artist.genre?.some(g => g.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <NewArtistModal 
        isOpen={isNewArtistModalOpen} 
        onClose={() => setIsNewArtistModalOpen(false)} 
      />

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
          <Button variant="ghost" size="sm" className="text-text-secondary hidden sm:flex">
            <Filter className="w-4 h-4 mr-2" />
            Filtrar
          </Button>
          <div className="flex items-center bg-surface-elevated rounded-lg p-1">
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
            ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" 
            : "space-y-3"
        }>
          {filteredArtists.map((artist) => (
            <div 
              key={artist.id} 
              onClick={() => router.push(`/artists/${artist.id}`)}
              className={`bg-surface-elevated border border-border card-hover cursor-pointer group rounded-xl overflow-hidden ${
                viewMode === 'list' ? 'flex items-center p-4 gap-6' : 'p-5 flex flex-col'
              }`}
            >
              {/* Photo & Main Info */}
              <div className={`flex ${viewMode === 'grid' ? 'items-start gap-4 mb-4' : 'items-center gap-4 flex-1'}`}>
                <div className={`rounded-full bg-surface border border-border flex items-center justify-center overflow-hidden shrink-0 ${
                  viewMode === 'grid' ? 'w-14 h-14' : 'w-10 h-10'
                }`}>
                  {artist.photoUrl ? (
                    <img src={artist.photoUrl} alt={artist.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                  ) : (
                    <span className="font-bold text-lg text-text-secondary">{artist.name.charAt(0)}</span>
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-text-primary text-lg leading-tight group-hover:text-accent transition-colors">{artist.name}</h3>
                  <p className="text-sm text-text-secondary mt-0.5 truncate max-w-[180px]">{artist.activeProject || 'Sin proyecto activo'}</p>
                </div>
              </div>

              {/* Tags & Services */}
              <div className={`flex flex-wrap items-center gap-2 ${viewMode === 'list' ? 'flex-1 justify-end' : 'mt-auto'}`}>
                {artist.genre?.slice(0, 2).map(g => (
                  <span key={g} className="text-[10px] uppercase tracking-wider font-semibold text-text-secondary bg-surface px-2 py-1 rounded">
                    {g}
                  </span>
                ))}
                
                {viewMode === 'grid' && <div className="w-full h-px bg-border/50 my-2" />}

                {artist.services?.slice(0, 3).map((service) => (
                  <span key={service} className="px-2 py-1 rounded-md text-[10px] font-medium bg-accent/10 border border-accent/20 text-accent-light">
                    {SERVICE_LABELS[service] || service}
                  </span>
                ))}
                {artist.services?.length > 3 && (
                  <span className="px-2 py-1 rounded-md text-[10px] font-medium bg-surface text-text-secondary">
                    +{artist.services.length - 3}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
