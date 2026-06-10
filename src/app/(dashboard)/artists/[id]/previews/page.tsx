'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { ArrowLeft, Plus, Disc, Loader2, Play, Settings2, Shield, ShieldOff } from 'lucide-react';
import type { Release } from '@/types';
import { customAlert, customConfirm, customPrompt } from '@/lib/dialog';


export default function ArtistPreviewsPage() {
  const params = useParams();
  const router = useRouter();
  const artistId = params.id as string;

  const [releases, setReleases] = useState<Release[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

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
    const title = await customPrompt('Nombre de la nueva Preview (Ej. Album Debut, EP Verano):');
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
      customAlert('Error creando el preview');
    } finally {
      setIsCreating(false);
    }
  };

  const togglePublic = async (releaseId: string, currentIsPublic: boolean) => {
    try {
      const res = await fetch(`/api/releases/${releaseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic: !currentIsPublic })
      });
      if (!res.ok) throw new Error('Error toggling');
      setReleases(prev => prev.map(r => r.id === releaseId ? { ...r, isPublic: !currentIsPublic } : r));
    } catch (e) {
      customAlert('Error al cambiar la privacidad');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push(`/artists/${artistId}`)} className="text-text-secondary hover:text-text-primary">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Gestor de Previews</h1>
            <p className="text-sm text-text-secondary mt-1">Crea y comparte pre-escuchas de los lanzamientos del artista.</p>
          </div>
        </div>
        <Button onClick={handleCreateRelease} disabled={isCreating}>
          {isCreating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
          Nueva Preview
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>
      ) : releases.length === 0 ? (
        <div className="glass rounded-xl p-16 text-center text-text-secondary border border-dashed border-border mt-8">
          <Disc className="w-16 h-16 mb-6 mx-auto opacity-50" />
          <h2 className="text-xl font-bold text-text-primary mb-2">No hay Previews todavía</h2>
          <p className="mb-6 max-w-md mx-auto">Agrupa canciones y compártelas de forma privada o pública con los artistas y el equipo.</p>
          <Button onClick={handleCreateRelease} disabled={isCreating}>Crear mi primera Preview</Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mt-8">
          {releases.map(release => (
            <div key={release.id} className="bg-surface-elevated rounded-2xl p-5 border border-border group relative overflow-hidden card-hover flex flex-col">
              <div 
                className="w-full aspect-square bg-surface border border-border/50 rounded-xl mb-4 flex items-center justify-center overflow-hidden cursor-pointer relative shadow-inner"
                onClick={() => window.open(`/previews/${release.id}`, '_blank')}
              >
                {release.coverArtId ? (
                  <img src={`/api/audio/${release.coverArtId}`} alt={release.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                  <Disc className="w-16 h-16 text-text-secondary opacity-20" />
                )}
                
                {/* Play Overlay */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                  <div className="w-14 h-14 bg-accent text-white rounded-full flex items-center justify-center shadow-lg shadow-accent/50 transform scale-90 group-hover:scale-100 transition-transform">
                    <Play className="w-6 h-6 ml-1 fill-current" />
                  </div>
                </div>
              </div>
              
              <div className="flex-1">
                <h4 className="font-bold text-text-primary text-base line-clamp-1 mb-1 group-hover:text-accent transition-colors">{release.title}</h4>
                <p className="text-xs text-text-secondary">{release.tracks?.length || 0} canciones</p>
              </div>
              
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/50">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className={`text-xs px-2 ${release.isPublic ? 'text-success hover:text-success hover:bg-success/10' : 'text-text-secondary hover:text-text-primary'}`}
                  onClick={() => togglePublic(release.id, !!release.isPublic)}
                  title="Cambiar acceso público"
                >
                  {release.isPublic ? <><Shield className="w-3.5 h-3.5 mr-1" /> Público</> : <><ShieldOff className="w-3.5 h-3.5 mr-1" /> Privado</>}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => router.push(`/artists/${artistId}/releases/${release.id}/edit`)} className="h-8">
                  <Settings2 className="w-4 h-4 mr-1" /> Editar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
