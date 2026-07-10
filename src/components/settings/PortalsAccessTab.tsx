'use client';

import { useState, useEffect } from 'react';
import { Globe, Loader2, Search, ExternalLink, Copy, CheckCircle2, XCircle } from 'lucide-react';
import { customAlert } from '@/lib/dialog';
import type { PortalConfig } from '@/types';
import { Button } from '@/components/ui/Button';

interface ArtistPortalData {
  artistId: string;
  artistName: string;
  config: PortalConfig;
}

export function PortalsAccessTab() {
  const [artists, setArtists] = useState<ArtistPortalData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/settings/portals');
      if (!res.ok) throw new Error('Error al cargar datos de los portales');
      const data = await res.json();
      if (data.artists) {
        setArtists(data.artists);
      }
    } catch (e: any) {
      customAlert(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleModule = async (artistId: string, moduleType: string, currentVal: boolean) => {
    // Optimistic update
    setArtists(prev => prev.map(a => {
      if (a.artistId === artistId && a.config && a.config.modules) {
        return {
          ...a,
          config: {
            ...a.config,
            modules: a.config.modules.map(m => m.type === moduleType ? { ...m, isVisible: !currentVal } : m)
          }
        };
      }
      return a;
    }));

    // Find the full new config to save
    const artist = artists.find(a => a.artistId === artistId);
    if (!artist || !artist.config || !artist.config.modules) return;
    
    const newConfig = {
      ...artist.config,
      modules: artist.config.modules.map(m => m.type === moduleType ? { ...m, isVisible: !currentVal } : m)
    };

    try {
      await fetch(`/api/artists/${artistId}/portal`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });
    } catch (e: any) {
      customAlert('Error al guardar cambio: ' + e.message);
      fetchData(); // revert
    }
  };

  const handleToggleFeedback = async (artistId: string, currentVal: boolean) => {
    // Optimistic update
    setArtists(prev => prev.map(a => {
      if (a.artistId === artistId && a.config) {
        return {
          ...a,
          config: {
            ...a.config,
            showFeedback: !currentVal
          }
        };
      }
      return a;
    }));

    const artist = artists.find(a => a.artistId === artistId);
    if (!artist || !artist.config) return;
    
    const newConfig = {
      ...artist.config,
      showFeedback: !currentVal
    };

    try {
      await fetch(`/api/artists/${artistId}/portal`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });
    } catch (e: any) {
      customAlert('Error al guardar cambio: ' + e.message);
      fetchData(); // revert
    }
  };

  const handleCopyLink = (artistId: string) => {
    const url = `${window.location.origin}/portal/${artistId}`;
    navigator.clipboard.writeText(url);
    customAlert('Enlace al portal copiado');
  };

  const filteredArtists = artists.filter(a => a.artistName.toLowerCase().includes(search.toLowerCase()));

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-text-secondary animate-pulse">
        <Loader2 className="w-10 h-10 animate-spin mb-4 text-accent" />
        <p className="font-medium text-lg">Cargando portales de todos los artistas...</p>
        <p className="text-sm opacity-70 mt-2 max-w-md text-center">Esto puede tardar unos segundos dependiendo de la cantidad de artistas registrados.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <Globe className="w-5 h-5 text-accent" />
            Accesos a Portales
          </h2>
          <p className="text-sm text-text-secondary mt-1">Gestiona qué módulos pueden ver los artistas en sus portales públicos.</p>
        </div>
        
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
          <input
            type="text"
            placeholder="Buscar artista..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary w-full md:w-64 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/50 transition-all"
          />
        </div>
      </div>

      <div className="glass rounded-[24px] border border-border overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="border-b border-border bg-surface-elevated/50">
                <th className="px-6 py-4 text-sm font-semibold text-text-primary">Artista</th>
                <th className="px-6 py-4 text-sm font-semibold text-text-primary text-center">Mezclas / Audios</th>
                <th className="px-6 py-4 text-sm font-semibold text-text-primary text-center">Estado del Trabajo</th>
                <th className="px-6 py-4 text-sm font-semibold text-text-primary text-center">Releases / Previews</th>
                <th className="px-6 py-4 text-sm font-semibold text-text-primary text-center">Feedback</th>
                <th className="px-6 py-4 text-sm font-semibold text-text-primary text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredArtists.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-text-secondary">
                    No se encontraron artistas.
                  </td>
                </tr>
              ) : (
                filteredArtists.map((artist) => {
                  const hasBounces = artist.config?.modules?.find(m => m.type === 'bounces')?.isVisible ?? true;
                  const hasTasks = artist.config?.modules?.find(m => m.type === 'tasks')?.isVisible ?? true;
                  const hasReleases = artist.config?.modules?.find(m => m.type === 'releases')?.isVisible ?? true;
                  const hasFeedback = artist.config?.showFeedback ?? true;

                  const renderToggle = (isOn: boolean, onToggle: () => void) => (
                    <button
                      onClick={onToggle}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-background ${isOn ? 'bg-accent' : 'bg-surface-elevated border border-border'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isOn ? 'translate-x-6' : 'translate-x-1 shadow-sm'}`} />
                    </button>
                  );

                  return (
                    <tr key={artist.artistId} className="hover:bg-surface/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-text-primary group-hover:text-accent transition-colors">{artist.artistName}</div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {renderToggle(hasBounces, () => handleToggleModule(artist.artistId, 'bounces', hasBounces))}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {renderToggle(hasTasks, () => handleToggleModule(artist.artistId, 'tasks', hasTasks))}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {renderToggle(hasReleases, () => handleToggleModule(artist.artistId, 'releases', hasReleases))}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {renderToggle(hasFeedback, () => handleToggleFeedback(artist.artistId, hasFeedback))}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleCopyLink(artist.artistId)}
                            className="p-2 text-text-secondary hover:text-accent hover:bg-accent/10 rounded-lg transition-colors"
                            title="Copiar Enlace"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => window.open(`/portal/${artist.artistId}`, '_blank')}
                            className="p-2 text-text-secondary hover:text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-colors"
                            title="Abrir Portal"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
