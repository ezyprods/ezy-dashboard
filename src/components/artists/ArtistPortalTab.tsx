'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Loader2, Eye, EyeOff, ArrowUp, ArrowDown, Settings, Save, Layout } from 'lucide-react';
import { customAlert } from '@/lib/dialog';
import type { PortalConfig, PortalModule } from '@/types';

export function ArtistPortalTab({ artistId }: { artistId: string }) {
  const [config, setConfig] = useState<PortalConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

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

  const handleSave = async () => {
    if (!config) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/artists/${artistId}/portal`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (!res.ok) throw new Error('Error al guardar');
      customAlert('Configuración del portal guardada con éxito');
    } catch (e: any) {
      customAlert(e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const updateModule = (id: string, updates: Partial<PortalModule>) => {
    if (!config) return;
    setConfig({
      ...config,
      modules: config.modules?.map(m => m.id === id ? { ...m, ...updates } : m)
    });
  };

  const moveModule = (index: number, direction: 'up' | 'down') => {
    if (!config || !config.modules) return;
    const newModules = [...config.modules];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex < 0 || targetIndex >= newModules.length) return;
    
    const temp = newModules[index];
    newModules[index] = newModules[targetIndex];
    newModules[targetIndex] = temp;
    
    // Update order numbers
    newModules.forEach((m, i) => m.order = i);
    
    setConfig({ ...config, modules: newModules });
  };

  if (isLoading) {
    return <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>;
  }

  if (!config) return null;

  const modules = [...(config.modules || [])].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
      <div className="flex items-center justify-between bg-surface-elevated p-6 rounded-xl border border-border">
        <div>
          <h3 className="text-xl font-semibold text-text-primary flex items-center gap-2">
            <Layout className="w-5 h-5 text-accent" /> Constructor del Portal
          </h3>
          <p className="text-sm text-text-secondary mt-1">Configura qué módulos ve el artista y en qué orden.</p>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Guardar Cambios
        </Button>
      </div>

      <div className="space-y-3">
        {modules.map((mod, index) => (
          <div key={mod.id} className={`flex items-center justify-between p-4 rounded-xl border transition-all ${mod.isVisible ? 'bg-surface border-border/80 shadow-md glow-accent/5' : 'bg-surface/50 border-border/30 opacity-60'}`}>
            <div className="flex items-center gap-4 flex-1">
              <div className="flex flex-col gap-1">
                <button 
                  onClick={() => moveModule(index, 'up')} 
                  disabled={index === 0}
                  className="p-1 text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:hover:text-text-secondary"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => moveModule(index, 'down')} 
                  disabled={index === modules.length - 1}
                  className="p-1 text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:hover:text-text-secondary"
                >
                  <ArrowDown className="w-4 h-4" />
                </button>
              </div>
              
              <div className="flex-1">
                <div className="text-xs text-accent font-medium mb-1 uppercase tracking-wider">{mod.type}</div>
                <input 
                  type="text" 
                  value={mod.title || ''} 
                  onChange={(e) => updateModule(mod.id, { title: e.target.value })}
                  placeholder="Título del módulo"
                  className="bg-transparent border-b border-border/50 text-text-primary font-medium text-lg focus:outline-none focus:border-accent w-full max-w-sm transition-colors"
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button 
                onClick={() => updateModule(mod.id, { isVisible: !mod.isVisible })}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${mod.isVisible ? 'bg-accent/10 text-accent hover:bg-accent/20' : 'bg-surface-elevated text-text-secondary hover:text-text-primary'}`}
              >
                {mod.isVisible ? <><Eye className="w-4 h-4" /> Visible</> : <><EyeOff className="w-4 h-4" /> Oculto</>}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
