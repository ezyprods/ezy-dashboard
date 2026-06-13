'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import {
  Loader2, Eye, EyeOff, ArrowUp, ArrowDown, Save, Layout,
  ExternalLink, Copy, Settings, User, Sparkles, MessageSquare,
  RefreshCw, CheckCircle2, Clock, Mail, AlertCircle, Trash2, Globe
} from 'lucide-react';
import { customAlert } from '@/lib/dialog';
import type { PortalConfig, PortalModule } from '@/types';

interface FeedbackItem {
  id: string;
  message: string;
  authorName: string;
  trackId?: string;
  trackTitle?: string;
  timestamp: string;
  isRead: boolean;
}

interface PortalTabProps {
  artistId: string;
  artistName?: string;
}

export function ArtistPortalTab({ artistId, artistName }: PortalTabProps) {
  const [config, setConfig] = useState<PortalConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [isFeedbackLoading, setIsFeedbackLoading] = useState(false);
  const [activeView, setActiveView] = useState<'config' | 'feedback'>('config');
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, [artistId]);

  useEffect(() => {
    if (activeView === 'feedback') {
      fetchFeedback();
    }
  }, [activeView]);

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

  const fetchFeedback = async () => {
    setIsFeedbackLoading(true);
    try {
      const res = await fetch(`/api/portal/${artistId}`);
      if (!res.ok) throw new Error('Error al cargar feedback');
      const data = await res.json();
      setFeedback(data.feedback || []);
    } catch (e) {
      // silently ignore
    } finally {
      setIsFeedbackLoading(false);
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
      customAlert('Configuración del portal guardada con éxito ✓');
    } catch (e: any) {
      customAlert(e.message);
    } finally {
      setIsSaving(false);
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
    newModules.forEach((m, i) => m.order = i);
    setConfig({ ...config, modules: newModules });
  };

  const formatRelativeTime = (isoStr: string) => {
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `Hace ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `Hace ${hours}h`;
    const days = Math.floor(hours / 24);
    return `Hace ${days}d`;
  };

  const MODULE_LABELS: Record<string, { label: string; description: string; emoji: string }> = {
    projects: { label: 'Proyectos Activos', description: 'Lista de proyectos en curso', emoji: '🎵' },
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

  const modules = [...(config.modules || [])].sort((a, b) => a.order - b.order);
  const portalUrl = typeof window !== 'undefined' ? `${window.location.origin}/portal/${artistId}` : `/portal/${artistId}`;
  const unreadFeedback = feedback.filter(f => !f.isRead).length;

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

      {/* Tab switcher */}
      <div className="flex items-center gap-1 bg-surface-elevated/60 rounded-xl p-1 border border-border/40">
        <button
          onClick={() => setActiveView('config')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all flex-1 justify-center ${
            activeView === 'config'
              ? 'bg-accent text-white shadow-lg shadow-accent/20'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <Settings className="w-4 h-4" />
          Configuración
        </button>
        <button
          onClick={() => setActiveView('feedback')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all flex-1 justify-center relative ${
            activeView === 'feedback'
              ? 'bg-accent text-white shadow-lg shadow-accent/20'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          Feedback del Artista
          {unreadFeedback > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-error text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {unreadFeedback}
            </span>
          )}
        </button>
      </div>

      {/* CONFIG VIEW */}
      {activeView === 'config' && (
        <div className="space-y-5">
          {/* Producer branding */}
          <div className="glass rounded-xl border border-border p-5 space-y-4">
            <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent" />
              Marca del Productor
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Nombre del Productor / Estudio
                </label>
                <input
                  type="text"
                  value={config.producerName || ''}
                  onChange={e => setConfig({ ...config, producerName: e.target.value })}
                  placeholder="EZY Studio"
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-accent transition-colors"
                />
                <p className="text-[10px] text-text-secondary mt-1">Aparece en el header del portal del artista</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1.5">
                  Color de Acento (hex)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={config.accentColor || '#6c5ce7'}
                    onChange={e => setConfig({ ...config, accentColor: e.target.value })}
                    className="w-10 h-10 rounded-lg border border-border bg-surface cursor-pointer"
                  />
                  <input
                    type="text"
                    value={config.accentColor || '#6c5ce7'}
                    onChange={e => setConfig({ ...config, accentColor: e.target.value })}
                    placeholder="#6c5ce7"
                    className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary font-mono placeholder:text-text-secondary/40 focus:outline-none focus:border-accent transition-colors"
                  />
                </div>
                <p className="text-[10px] text-text-secondary mt-1">Color principal del portal (próximamente)</p>
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
              <Button onClick={handleSave} disabled={isSaving} size="sm">
                {isSaving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
                Guardar
              </Button>
            </div>
            <p className="text-xs text-text-secondary -mt-2">
              Arrastra para reordenar. Los módulos ocultos no aparecen en el portal.
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
      )}

      {/* FEEDBACK VIEW */}
      {activeView === 'feedback' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-text-primary">Mensajes de {artistName || 'Artista'}</h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Feedback enviado directamente desde el portal del artista
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={fetchFeedback} disabled={isFeedbackLoading}>
              <RefreshCw className={`w-4 h-4 ${isFeedbackLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {isFeedbackLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-accent" />
            </div>
          ) : feedback.length === 0 ? (
            <div className="glass rounded-xl p-12 text-center border border-dashed border-border">
              <MessageSquare className="w-12 h-12 mx-auto mb-4 text-text-secondary opacity-40" />
              <h4 className="font-bold text-text-primary mb-1">Sin mensajes todavía</h4>
              <p className="text-sm text-text-secondary">
                El artista puede enviarte feedback desde su portal.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {feedback.map(item => (
                <div
                  key={item.id}
                  className={`glass rounded-xl border p-4 transition-all ${
                    !item.isRead ? 'border-accent/30 bg-accent/5' : 'border-border'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-accent/15 border border-accent/25 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-accent">
                        {(item.authorName || 'A').charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm text-text-primary">{item.authorName}</span>
                        {!item.isRead && (
                          <span className="text-[9px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                            Nuevo
                          </span>
                        )}
                        <span className="text-xs text-text-secondary ml-auto flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatRelativeTime(item.timestamp)}
                        </span>
                      </div>
                      <p className="text-sm text-text-primary leading-relaxed">{item.message}</p>
                      {item.trackTitle && (
                        <div className="flex items-center gap-1.5 mt-2 text-[10px] text-text-secondary bg-surface px-2.5 py-1.5 rounded-lg border border-border/50 w-fit">
                          <AlertCircle className="w-3 h-3" />
                          Sobre: {item.trackTitle}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
