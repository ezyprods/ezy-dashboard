'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import {
  Loader2, Eye, EyeOff, ArrowUp, ArrowDown, Layout,
  ExternalLink, Copy, CheckCircle2, Globe
} from 'lucide-react';
import { customAlert } from '@/lib/dialog';
import type { PortalConfig, PortalModule } from '@/types';

interface PortalTabProps {
  artistId: string;
  artistName?: string;
}

export function ArtistPortalTab({ artistId, artistName }: PortalTabProps) {
  const [config, setConfig] = useState<PortalConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, [artistId]);

  const fetchConfig = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/artists/${artistId}/portal`);
      if (!res.ok) throw new Error('Error al cargar config');
      const data = await res.json();
      setConfig(data.config);
    } catch (e: any) {
      customAlert(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const saveConfig = async (newConfig: PortalConfig) => {
    try {
      await fetch(`/api/artists/${artistId}/portal`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });
    } catch (e: any) {
      console.error('Error auto-guardando config:', e);
    }
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/portal/${artistId}`;
    navigator.clipboard.writeText(url);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2500);
  };

  const updateModule = (id: string, updates: Partial<PortalModule>) => {
    if (!config) return;
    const newConfig = {
      ...config,
      modules: config.modules?.map(m => m.id === id ? { ...m, ...updates } : m)
    };
    setConfig(newConfig);
    saveConfig(newConfig);
  };

  const moveModule = (index: number, direction: 'up' | 'down') => {
    if (!config || !config.modules) return;
    const newModules = [...config.modules];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newModules.length) return;
    const temp = newModules[index];
    newModules[index] = newModules[targetIndex];
    newModules[targetIndex] = temp;
    newModules.forEach((m, i) => m.order = i);
    const newConfig = { ...config, modules: newModules };
    setConfig(newConfig);
    saveConfig(newConfig);
  };

  const MODULE_LABELS: Record<string, { label: string; description: string; emoji: string }> = {
    bounces: { label: 'Mezclas / Audios', description: 'Reproductor de archivos de audio', emoji: '🎧' },
    releases: { label: 'Previews / Lanzamientos', description: 'Player de previews públicas', emoji: '💿' },
    finances: { label: 'Resumen Financiero', description: 'Presupuesto y estado de pagos', emoji: '💳' },
    tasks: { label: 'Estado del Trabajo', description: 'Lista de tareas y progreso', emoji: '✅' },
    custom_text: { label: 'Texto Personalizado', description: 'Bloque de texto libre', emoji: '📝' },
    custom_link: { label: 'Enlace Personalizado', description: 'Enlace a recursos externos', emoji: '🔗' },
  };

  if (isLoading) {
    return (
      <div className="p-12 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
        <div className="glass rounded-xl p-12 text-center text-text-secondary border border-dashed border-border mt-8">
          <Layout className="w-16 h-16 mb-6 mx-auto opacity-50" />
          <h2 className="text-xl font-bold text-text-primary mb-2">Portal no inicializado</h2>
          <p className="mb-6 max-w-md mx-auto">Ha ocurrido un error al cargar la configuración del portal.</p>
          <Button onClick={fetchConfig}>Reintentar</Button>
        </div>
      </div>
    );
  }

  const modules = [...(config.modules || [])]
    .filter(m => m.type !== 'projects') // Ensure projects module is hidden
    .sort((a, b) => a.order - b.order);
  
  const portalUrl = typeof window !== 'undefined' ? `${window.location.origin}/portal/${artistId}` : `/portal/${artistId}`;

  return (
    <div className="space-y-5 animate-fade-in max-w-4xl mx-auto">

      {/* Portal URL card */}
      <div className="glass rounded-xl border border-border/60 p-5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-accent/5 blur-[60px] rounded-full pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-accent" />
            <h3 className="font-semibold text-text-primary text-sm">Enlace del Portal del Artista</h3>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 flex items-center gap-2 min-w-0">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse shrink-0" />
              <span className="text-xs text-text-secondary font-mono truncate">{portalUrl}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyLink}
              className={`shrink-0 transition-all ${linkCopied ? 'border-success text-success bg-success/10' : 'border-accent text-accent hover:bg-accent/10'}`}
            >
              {linkCopied ? <><CheckCircle2 className="w-4 h-4 mr-1.5" /> Copiado</> : <><Copy className="w-4 h-4 mr-1.5" /> Copiar</>}
            </Button>
            <a
              href={`/portal/${artistId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-surface border border-border text-text-secondary hover:text-text-primary hover:border-border/80 transition-colors font-medium"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Ver
            </a>
          </div>
        </div>
      </div>

      {/* Modules */}
      <div className="glass rounded-xl border border-border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
            <Layout className="w-4 h-4 text-accent" />
            Módulos del Portal
          </h3>
        </div>
        <p className="text-xs text-text-secondary -mt-2">
          Arrastra para reordenar. Los módulos ocultos no aparecen en el portal. (Guardado automático)
        </p>

        <div className="space-y-2">
          {modules.map((mod, index) => {
            const info = MODULE_LABELS[mod.type] || { label: mod.type, description: '', emoji: '📦' };
            return (
              <div
                key={mod.id}
                className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${
                  mod.isVisible
                    ? 'bg-surface border-border shadow-sm'
                    : 'bg-surface/40 border-border/30 opacity-50'
                }`}
              >
                {/* Move arrows */}
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    onClick={() => moveModule(index, 'up')}
                    disabled={index === 0}
                    className="p-0.5 text-text-secondary hover:text-text-primary disabled:opacity-20 rounded transition-colors"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => moveModule(index, 'down')}
                    disabled={index === modules.length - 1}
                    className="p-0.5 text-text-secondary hover:text-text-primary disabled:opacity-20 rounded transition-colors"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Icon */}
                <span className="text-xl shrink-0">{info.emoji}</span>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-accent uppercase tracking-wider">{mod.type}</span>
                  </div>
                  <input
                    type="text"
                    value={mod.title || ''}
                    onChange={e => updateModule(mod.id, { title: e.target.value })}
                    placeholder={info.label}
                    className="bg-transparent text-sm font-semibold text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/50 rounded px-1 -ml-1 w-full max-w-xs transition-colors"
                  />
                  <p className="text-[10px] text-text-secondary mt-0.5">{info.description}</p>
                </div>

                {/* Visibility toggle */}
                <button
                  onClick={() => updateModule(mod.id, { isVisible: !mod.isVisible })}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                    mod.isVisible
                      ? 'bg-accent/10 text-accent hover:bg-accent/20'
                      : 'bg-surface-elevated text-text-secondary hover:text-text-primary hover:bg-surface'
                  }`}
                >
                  {mod.isVisible
                    ? <><Eye className="w-3.5 h-3.5" /> Visible</>
                    : <><EyeOff className="w-3.5 h-3.5" /> Oculto</>
                  }
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
