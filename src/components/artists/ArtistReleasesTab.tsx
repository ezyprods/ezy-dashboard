'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Plus, Disc, Loader2, Play, Settings2, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { Release } from '@/types';

export function ArtistReleasesTab({ artistId }: { artistId: string }) {
  const [releases, setReleases] = useState<Release[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchReleases();
  }, [artistId]);

  const fetchReleases = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/artists/${artistId}/releases`);
      if (!res.ok) throw new Error('Error loading releases');
      const data = await res.json();
      setReleases(data.releases || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateRelease = async () => {
    const title = prompt('Nombre del lanzamiento (Ej. Album Debut, Single Verano):');
    if (!title) return;
    
    setIsCreating(true);
    try {
      const res = await fetch(`/api/artists/${artistId}/releases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
      });
      if (!res.ok) throw new Error('Error creating release');
      const data = await res.json();
      router.push(`/artists/${artistId}/releases/${data.release.id}/edit`);
    } catch (err) {
      console.error(err);
      alert('Error creando el lanzamiento');
    } finally {
      setIsCreating(false);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold">Lanzamientos</h3>
          <p className="text-sm text-text-secondary mt-1">Previsualizaciones tipo Spotify de tus proyectos finales.</p>
        </div>
        <Button onClick={handleCreateRelease} disabled={isCreating}>
          {isCreating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
          Nuevo Lanzamiento
        </Button>
      </div>

      {releases.length === 0 ? (
        <div className="glass rounded-xl p-12 text-center text-text-secondary border border-dashed border-border">
          <Disc className="w-12 h-12 mb-4 mx-auto opacity-50" />
          <p className="mb-4">No hay lanzamientos configurados.</p>
          <Button variant="outline" onClick={handleCreateRelease} disabled={isCreating}>Crear el primero</Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {releases.map(release => (
            <div key={release.id} className="bg-surface-elevated rounded-xl p-4 border border-border group relative overflow-hidden card-hover">
              <div 
                className="w-full aspect-square bg-surface border border-border/50 rounded-lg mb-3 flex items-center justify-center overflow-hidden cursor-pointer relative"
                onClick={() => router.push(`/releases/${release.id}/preview`)}
              >
                {release.coverArtId ? (
                  <img src={`/api/audio/${release.coverArtId}`} alt={release.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                  <Disc className="w-12 h-12 text-text-secondary opacity-30" />
                )}
                
                {/* Play Overlay */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="w-12 h-12 bg-accent text-white rounded-full flex items-center justify-center shadow-lg shadow-accent/50 transform scale-90 group-hover:scale-100 transition-transform">
                    <Play className="w-6 h-6 ml-1 fill-current" />
                  </div>
                </div>
              </div>
              
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-bold text-text-primary text-sm line-clamp-1">{release.title}</h4>
                  <p className="text-xs text-text-secondary mt-0.5">{release.tracks?.length || 0} canciones</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => router.push(`/artists/${artistId}/releases/${release.id}/edit`)} className="opacity-0 group-hover:opacity-100 h-8 w-8 text-text-secondary hover:text-accent">
                  <Settings2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
