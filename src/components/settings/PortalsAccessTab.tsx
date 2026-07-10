'use client';

import { useState, useEffect } from 'react';
import { Globe, Loader2, Search, ExternalLink, Copy, Headphones, CheckSquare, Disc, MessageSquare, Wrench, Wallet } from 'lucide-react';
import { customAlert } from '@/lib/dialog';
import type { PortalConfig, PortalModule } from '@/types';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

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

  const updateArtistConfig = async (artistId: string, newConfig: PortalConfig) => {
    // Optimistic update
    setArtists(prev => prev.map(a => a.artistId === artistId ? { ...a, config: newConfig } : a));

    try {
      const res = await fetch(`/api/artists/${artistId}/portal`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });
      if (!res.ok) throw new Error('Falló al guardar en servidor');
    } catch (e: any) {
      customAlert('Error al guardar cambio: ' + e.message);
      fetchData(); // revert
    }
  };

  const handleToggleModule = (artist: ArtistPortalData, moduleType: string, currentVal: boolean) => {
    if (!artist.config) return;
    
    let newModules = [...(artist.config.modules || [])];
    const existingIndex = newModules.findIndex(m => m.type === moduleType);
    
    if (existingIndex >= 0) {
      newModules[existingIndex] = { ...newModules[existingIndex], isVisible: !currentVal };
    } else {
      // If module doesn't exist yet in their config, create it
      const defaultTitles: Record<string, string> = {
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
        title: defaultTitles[moduleType] || moduleType
      });
    }

    updateArtistConfig(artist.artistId, { ...artist.config, modules: newModules });
  };

  const handleToggleRootProperty = (artist: ArtistPortalData, property: keyof PortalConfig, currentVal: boolean) => {
    if (!artist.config) return;
    updateArtistConfig(artist.artistId, { ...artist.config, [property]: !currentVal });
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
          <p className="text-sm text-text-secondary mt-1">
            Gestiona qué módulos y herramientas pueden ver los artistas en sus portales públicos.
          </p>
        </div>
        
        <div className="relative shrink-0">
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

      <div className="space-y-3">
        {filteredArtists.length === 0 ? (
          <div className="glass rounded-2xl p-12 text-center text-text-secondary border border-dashed border-border">
            <Globe className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>No se encontraron artistas.</p>
          </div>
        ) : (
          filteredArtists.map((artist) => {
            const mods = artist.config?.modules || [];
            const hasTools = artist.config?.enableTools ?? false;
            const hasBounces = mods.find(m => m.type === 'bounces')?.isVisible ?? true;
            const hasFinances = mods.find(m => m.type === 'finances')?.isVisible ?? false;
            const hasTasks = mods.find(m => m.type === 'tasks')?.isVisible ?? true;
            const hasReleases = mods.find(m => m.type === 'releases')?.isVisible ?? true;
            const hasFeedback = artist.config?.showFeedback ?? true;

            const TogglePill = ({ icon: Icon, label, isOn, onClick }: { icon: any, label: string, isOn: boolean, onClick: () => void }) => (
              <button
                onClick={onClick}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 border",
                  isOn 
                    ? "bg-accent/10 text-accent border-accent/30 hover:bg-accent/20" 
                    : "bg-surface text-text-secondary border-border hover:bg-surface-elevated hover:text-text-primary"
                )}
              >
                <div className={cn("w-2 h-2 rounded-full transition-colors", isOn ? "bg-accent" : "bg-text-secondary/30")} />
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </button>
            );

            return (
              <div key={artist.artistId} className="glass p-4 rounded-xl border border-border flex flex-col xl:flex-row xl:items-center justify-between gap-4 transition-all hover:border-border/80">
                {/* Artist Info */}
                <div className="flex items-center gap-3 xl:w-56 shrink-0">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent/20 to-surface-elevated border border-border flex items-center justify-center text-text-primary font-bold shrink-0">
                    {artist.artistName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-text-primary truncate">{artist.artistName}</h3>
                    <p className="text-xs text-text-secondary truncate">Configuración de Portal</p>
                  </div>
                </div>

                {/* Toggles Flex Container */}
                <div className="flex flex-wrap items-center gap-2 flex-1">
                  <TogglePill icon={Wrench} label="SoundBox" isOn={hasTools} onClick={() => handleToggleRootProperty(artist, 'enableTools', hasTools)} />
                  <TogglePill icon={Headphones} label="Mezclas" isOn={hasBounces} onClick={() => handleToggleModule(artist, 'bounces', hasBounces)} />
                  <TogglePill icon={Wallet} label="Finanzas" isOn={hasFinances} onClick={() => handleToggleModule(artist, 'finances', hasFinances)} />
                  <TogglePill icon={CheckSquare} label="Tareas" isOn={hasTasks} onClick={() => handleToggleModule(artist, 'tasks', hasTasks)} />
                  <TogglePill icon={Disc} label="Releases" isOn={hasReleases} onClick={() => handleToggleModule(artist, 'releases', hasReleases)} />
                  <TogglePill icon={MessageSquare} label="Feedback" isOn={hasFeedback} onClick={() => handleToggleRootProperty(artist, 'showFeedback', hasFeedback)} />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0 pt-2 xl:pt-0 border-t xl:border-t-0 border-border/50">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 xl:flex-none text-xs"
                    onClick={() => handleCopyLink(artist.artistId)}
                  >
                    <Copy className="w-3.5 h-3.5 mr-1.5" />
                    Copiar
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    className="flex-1 xl:flex-none text-xs bg-emerald-500 hover:bg-emerald-600 text-white border-none shadow-lg shadow-emerald-500/20"
                    onClick={() => window.open(`/portal/${artist.artistId}`, '_blank')}
                  >
                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                    Abrir
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
