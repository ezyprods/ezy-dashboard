'use client';

import { useState, useEffect } from 'react';
import { Globe, Loader2, Search, ExternalLink, Copy, Headphones, CheckSquare, Disc, MessageSquare, Wrench, Wallet } from 'lucide-react';
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
      if (!res.ok) throw new Error('Error al cargar datos');
      const data = await res.json();
      if (data.artists) setArtists(data.artists);
    } catch (e: any) {
      customAlert(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const updateArtistConfig = async (artistId: string, newConfig: PortalConfig) => {
    setArtists(prev => prev.map(a => a.artistId === artistId ? { ...a, config: newConfig } : a));
    try {
      const res = await fetch(`/api/artists/${artistId}/portal`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });
      if (!res.ok) throw new Error('Error al guardar');
    } catch (e: any) {
      customAlert('Error: ' + e.message);
      fetchData();
    }
  };

  const toggleModule = (artist: ArtistPortalData, moduleType: string, currentVal: boolean) => {
    if (!artist.config) return;
    const newModules = [...(artist.config.modules || [])];
    const idx = newModules.findIndex(m => m.type === moduleType);
    
    if (idx >= 0) {
      newModules[idx] = { ...newModules[idx], isVisible: !currentVal };
    } else {
      const titles: Record<string, string> = {
        bounces: 'Últimas Mezclas / Audios',
        tasks: 'Estado del Trabajo',
        releases: 'Releases / Previews',
        finances: 'Resumen Financiero'
      };
      newModules.push({
        id: moduleType,
        type: moduleType as any,
        isVisible: true,
        order: newModules.length,
        title: titles[moduleType] || moduleType
      });
    }
    updateArtistConfig(artist.artistId, { ...artist.config, modules: newModules });
  };

  const toggleRoot = (artist: ArtistPortalData, property: keyof PortalConfig, currentVal: boolean) => {
    if (!artist.config) return;
    updateArtistConfig(artist.artistId, { ...artist.config, [property]: !currentVal });
  };

  const handleCopyLink = (artistId: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/portal/${artistId}`);
    customAlert('Enlace al portal copiado');
  };

  const filteredArtists = artists.filter(a => a.artistName.toLowerCase().includes(search.toLowerCase()));

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-text-secondary animate-pulse">
        <Loader2 className="w-10 h-10 animate-spin mb-4 text-accent" />
        <p>Cargando portales...</p>
      </div>
    );
  }

  // Small custom toggle to fit perfectly in table cells without taking space
  const MatrixToggle = ({ isOn, onClick }: { isOn: boolean, onClick: () => void }) => (
    <label className="relative inline-flex items-center cursor-pointer justify-center w-full group">
      <input type="checkbox" className="sr-only peer" checked={isOn} onChange={onClick} />
      <div className="w-9 h-5 bg-surface-elevated peer-focus:outline-none rounded-full peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[calc(50%-16px)] after:bg-text-secondary peer-checked:after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent border border-border/50 group-hover:border-accent/50 transition-colors"></div>
    </label>
  );

  return (
    <div className="space-y-6 animate-fade-in pb-12 w-full max-w-[100vw] overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <Globe className="w-5 h-5 text-accent" />
            Matriz de Permisos Globales
          </h2>
          <p className="text-sm text-text-secondary mt-1">
            Control centralizado de accesos a módulos para todos los artistas.
          </p>
        </div>
        <div className="relative shrink-0">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
          <input
            type="text"
            placeholder="Buscar artista..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary w-full sm:w-64 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/50 transition-all"
          />
        </div>
      </div>

      <div className="glass rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-sm text-left whitespace-nowrap min-w-[900px]">
            <thead className="text-xs text-text-secondary uppercase bg-surface-elevated/50 border-b border-border">
              <tr>
                <th className="px-6 py-4 font-semibold w-64 sticky left-0 bg-surface-elevated/95 backdrop-blur z-10 border-r border-border">
                  Artista
                </th>
                <th className="px-4 py-4 font-semibold text-center group cursor-default">
                  <div className="flex flex-col items-center gap-1.5">
                    <Wrench className="w-4 h-4 group-hover:text-accent transition-colors" />
                    <span>SoundBox</span>
                  </div>
                </th>
                <th className="px-4 py-4 font-semibold text-center group cursor-default">
                  <div className="flex flex-col items-center gap-1.5">
                    <Headphones className="w-4 h-4 group-hover:text-accent transition-colors" />
                    <span>Mezclas</span>
                  </div>
                </th>
                <th className="px-4 py-4 font-semibold text-center group cursor-default">
                  <div className="flex flex-col items-center gap-1.5">
                    <Wallet className="w-4 h-4 group-hover:text-accent transition-colors" />
                    <span>Finanzas</span>
                  </div>
                </th>
                <th className="px-4 py-4 font-semibold text-center group cursor-default">
                  <div className="flex flex-col items-center gap-1.5">
                    <CheckSquare className="w-4 h-4 group-hover:text-accent transition-colors" />
                    <span>Tareas</span>
                  </div>
                </th>
                <th className="px-4 py-4 font-semibold text-center group cursor-default">
                  <div className="flex flex-col items-center gap-1.5">
                    <Disc className="w-4 h-4 group-hover:text-accent transition-colors" />
                    <span>Releases</span>
                  </div>
                </th>
                <th className="px-4 py-4 font-semibold text-center group cursor-default">
                  <div className="flex flex-col items-center gap-1.5">
                    <MessageSquare className="w-4 h-4 group-hover:text-accent transition-colors" />
                    <span>Feedback</span>
                  </div>
                </th>
                <th className="px-6 py-4 font-semibold text-right">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filteredArtists.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-text-secondary">
                    No se encontraron artistas.
                  </td>
                </tr>
              ) : (
                filteredArtists.map((artist) => {
                  const mods = artist.config?.modules || [];
                  const hasTools = artist.config?.enableTools ?? false;
                  const hasBounces = mods.find(m => m.type === 'bounces')?.isVisible ?? true;
                  const hasFinances = mods.find(m => m.type === 'finances')?.isVisible ?? false;
                  const hasTasks = mods.find(m => m.type === 'tasks')?.isVisible ?? true;
                  const hasReleases = mods.find(m => m.type === 'releases')?.isVisible ?? true;
                  const hasFeedback = artist.config?.showFeedback ?? true;

                  return (
                    <tr key={artist.artistId} className="hover:bg-surface-elevated/30 transition-colors">
                      <td className="px-6 py-3 sticky left-0 bg-background/95 backdrop-blur z-10 border-r border-border/50">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent/20 to-surface-elevated border border-border flex items-center justify-center text-text-primary font-bold text-xs shrink-0">
                            {artist.artistName.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-semibold text-text-primary truncate max-w-[180px]">
                            {artist.artistName}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <MatrixToggle isOn={hasTools} onClick={() => toggleRoot(artist, 'enableTools', hasTools)} />
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <MatrixToggle isOn={hasBounces} onClick={() => toggleModule(artist, 'bounces', hasBounces)} />
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <MatrixToggle isOn={hasFinances} onClick={() => toggleModule(artist, 'finances', hasFinances)} />
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <MatrixToggle isOn={hasTasks} onClick={() => toggleModule(artist, 'tasks', hasTasks)} />
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <MatrixToggle isOn={hasReleases} onClick={() => toggleModule(artist, 'releases', hasReleases)} />
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <MatrixToggle isOn={hasFeedback} onClick={() => toggleRoot(artist, 'showFeedback', hasFeedback)} />
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleCopyLink(artist.artistId)} className="h-8 w-8 hover:text-accent">
                            <Copy className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => window.open(`/portal/${artist.artistId}`, '_blank')} className="h-8 w-8 hover:text-accent">
                            <ExternalLink className="w-4 h-4" />
                          </Button>
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
