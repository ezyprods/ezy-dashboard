'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Loader2, Eye, EyeOff, ArrowUp, ArrowDown, ExternalLink, Copy, Globe, Wrench, Download, RefreshCw, Scissors,
  Tags, Activity, Layers, Check, FolderOpen, Sparkles, LayoutTemplate,
  CircleCheck, Share2, Mail,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { copyText, canNativeShare, nativeShare } from '@/components/explorer/explorerUtils';
import { useAppData } from '@/lib/contexts/AppDataContext';
import { PORTAL_TOOLS, type PortalConfig, type PortalModule, type PortalToolId } from '@/types/portal';
import type { Project } from '@/types';
import { PROJECT_STATUS_META } from '@/components/projects/EditProjectModal';

const TOOL_ICONS: Record<string, React.ElementType> = { Download, RefreshCw, Scissors, Tags, Activity, Layers };

const MODULE_INFO: Record<string, { label: string; description: string; emoji: string }> = {
  bounces: { label: 'Archivos y mezclas', description: 'Últimos audios y archivos, por proyecto, con reproductor y descargas', emoji: '🎧' },
  releases: { label: 'Previews y lanzamientos', description: 'Reproductor de los lanzamientos marcados como públicos', emoji: '💿' },
  tasks: { label: 'Estado del trabajo', description: 'Progreso de las matrices compartidas y tareas del proyecto', emoji: '✅' },
  finances: { label: 'Resumen financiero', description: 'Presupuesto, pagado y pendiente', emoji: '💶' },
};

interface PortalTabProps {
  artistId: string;
  artistName?: string;
  projects?: Project[];
}

function Section({ title, icon: Icon, action, children, className }: { title: string; icon: React.ElementType; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border border-border bg-surface-elevated', className)}>
      <div className="flex items-center gap-2 px-4 md:px-5 h-14 border-b border-border/60">
        <Icon className="w-4 h-4 text-accent shrink-0" />
        <h3 className="text-sm font-bold text-text-primary flex-1 truncate">{title}</h3>
        {action}
      </div>
      <div className="p-4 md:p-5">{children}</div>
    </section>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={cn('w-10 h-6 rounded-full p-0.5 transition-colors shrink-0', checked ? 'bg-accent' : 'bg-surface border border-border')}>
      <span className={cn('block w-5 h-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-4')} />
    </button>
  );
}

export function ArtistPortalTab({ artistId, artistName, projects = [] }: PortalTabProps) {
  const { artists } = useAppData();
  const artist = artists.find(a => a.id === artistId);
  const [config, setConfig] = useState<PortalConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestConfig = useRef<PortalConfig | null>(null);

  const portalUrl = typeof window !== 'undefined' ? `${window.location.origin}/portal/${artistId}` : `/portal/${artistId}`;

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch(`/api/artists/${artistId}/portal`);
      if (!res.ok) throw new Error('No se pudo cargar la configuración del portal');
      const data = await res.json();
      setConfig(data.config);
      latestConfig.current = data.config;
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [artistId]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const flush = useCallback(async () => {
    const cfg = latestConfig.current;
    if (!cfg) return;
    setSaveState('saving');
    try {
      const res = await fetch(`/api/artists/${artistId}/portal`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      if (!res.ok) throw new Error();
      setSaveState('saved');
    } catch {
      setSaveState('error');
      toast.error('No se pudo guardar la configuración del portal');
    }
  }, [artistId]);

  /** Applies a change locally and saves it (debounced for typing). */
  const change = (patch: Partial<PortalConfig>, debounce = 0) => {
    if (!config) return;
    const next = { ...config, ...patch };
    setConfig(next);
    latestConfig.current = next;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState('saving');
    saveTimer.current = setTimeout(flush, debounce);
  };

  useEffect(() => () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      flush();
    }
  }, [flush]);

  const modules = useMemo(
    () => [...(config?.modules || [])].filter(m => MODULE_INFO[m.type]).sort((a, b) => a.order - b.order),
    [config?.modules],
  );

  const updateModule = (id: string, patch: Partial<PortalModule>, debounce = 0) => {
    change({ modules: (config?.modules || []).map(m => (m.id === id ? { ...m, ...patch } : m)) }, debounce);
  };

  const moveModule = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= modules.length) return;
    const reordered = [...modules];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const orderById = new Map(reordered.map((m, i) => [m.id, i]));
    change({ modules: (config?.modules || []).map(m => (orderById.has(m.id) ? { ...m, order: orderById.get(m.id)! } : m)) });
  };

  const allowedTools: PortalToolId[] = config
    ? (Array.isArray(config.allowedTools) ? config.allowedTools : (config.enableTools ? PORTAL_TOOLS.map(t => t.id) : []))
    : [];

  const hidden = new Set(config?.hiddenProjectIds || []);



  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 h-72 rounded-2xl bg-surface-elevated border border-border animate-pulse" />
        <div className="h-72 rounded-2xl bg-surface-elevated border border-border animate-pulse" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface-elevated p-10 text-center">
        <p className="text-sm font-semibold">No se pudo cargar el portal</p>
        <button type="button" onClick={() => { setIsLoading(true); fetchConfig(); }} className="mt-4 h-10 px-4 rounded-xl border border-border text-sm hover:bg-surface">Reintentar</button>
      </div>
    );
  }

  const shareText = `Hola${artistName ? ` ${artistName}` : ''}! Aquí tienes tu portal con todos tus archivos, mezclas y el estado del trabajo:\n${portalUrl}`;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Link */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-surface-elevated p-4 md:p-5">
        <div className="absolute -top-20 -right-10 w-60 h-60 rounded-full bg-accent/10 blur-[70px] pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span className="w-11 h-11 rounded-xl bg-accent/15 text-accent flex items-center justify-center shrink-0"><Globe className="w-5 h-5" /></span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-text-primary">Portal de {artistName || 'el artista'}</p>
              <button type="button" onClick={() => copyText(portalUrl, 'Enlace copiado')} className="text-xs text-text-secondary font-mono truncate max-w-full hover:text-accent block">{portalUrl}</button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('text-[11px] font-medium mr-1 inline-flex items-center gap-1', saveState === 'error' ? 'text-error' : 'text-text-secondary')}>
              {saveState === 'saving' ? <><Loader2 className="w-3 h-3 animate-spin" /> Guardando…</> : saveState === 'saved' ? <><Check className="w-3 h-3 text-success" /> Guardado</> : saveState === 'error' ? 'Error al guardar' : null}
            </span>
            <button type="button" onClick={() => copyText(portalUrl, 'Enlace copiado')} className="h-10 px-3.5 rounded-xl border border-border text-sm font-medium inline-flex items-center gap-2 hover:bg-surface"><Copy className="w-4 h-4" /> Copiar</button>
            {artist?.phone && (
              <a href={`https://wa.me/${artist.phone.replace(/\D/g, '')}?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" className="h-10 px-3.5 rounded-xl border border-border text-sm font-medium inline-flex items-center gap-2 hover:bg-surface"><Share2 className="w-4 h-4 text-[#25D366]" /> WhatsApp</a>
            )}
            {artist?.email && (
              <a href={`mailto:${artist.email}?subject=${encodeURIComponent('Tu portal de archivos')}&body=${encodeURIComponent(shareText)}`} className="h-10 px-3.5 rounded-xl border border-border text-sm font-medium inline-flex items-center gap-2 hover:bg-surface"><Mail className="w-4 h-4" /> Email</a>
            )}
            {canNativeShare() && (
              <button type="button" onClick={() => nativeShare(`Portal de ${artistName}`, portalUrl)} className="h-10 w-10 rounded-xl border border-border inline-flex items-center justify-center hover:bg-surface" aria-label="Compartir"><Share2 className="w-4 h-4" /></button>
            )}
            <a href={`/portal/${artistId}`} target="_blank" rel="noopener noreferrer" className="h-10 px-4 rounded-xl bg-accent text-white text-sm font-semibold inline-flex items-center gap-2 hover:bg-accent/90"><ExternalLink className="w-4 h-4" /> Ver portal</a>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4">
          {/* Projects visibility */}
          <Section title="Proyectos visibles en el portal" icon={FolderOpen}>
            {projects.length === 0 ? (
              <p className="text-sm text-text-secondary">Este artista no tiene proyectos. Los archivos sueltos y la carpeta Bounces siempre se muestran en “Bounces y archivos generales”.</p>
            ) : (
              <div className="space-y-1">
                <p className="text-xs text-text-secondary mb-2">Oculta los proyectos que el artista no debe ver (por ejemplo, trabajos en borrador). Sus archivos tampoco aparecerán.</p>
                {projects.map(p => {
                  const visible = !hidden.has(p.id);
                  const meta = PROJECT_STATUS_META[p.status || 'active'] || PROJECT_STATUS_META.active;
                  return (
                    <div key={p.id} className="flex items-center gap-3 min-h-[48px] px-2 rounded-xl hover:bg-surface">
                      <span className={cn('w-2 h-2 rounded-full shrink-0', meta.dot)} title={meta.label} />
                      <span className={cn('flex-1 min-w-0 truncate text-sm', visible ? 'text-text-primary' : 'text-text-secondary line-through')}>{p.title}</span>
                      <span className="text-[11px] text-text-secondary hidden sm:inline">{visible ? 'Visible' : 'Oculto'}</span>
                      <Toggle
                        checked={visible}
                        label={`Mostrar ${p.title}`}
                        onChange={v => {
                          const next = new Set(hidden);
                          if (v) next.delete(p.id); else next.add(p.id);
                          change({ hiddenProjectIds: Array.from(next) });
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* Modules */}
          <Section title="Secciones del portal" icon={LayoutTemplate}>
            <div className="space-y-2">
              {modules.map((mod, index) => {
                const info = MODULE_INFO[mod.type];
                return (
                  <div key={mod.id} className={cn('flex items-start gap-3 p-3 rounded-xl border transition-opacity', mod.isVisible ? 'border-border bg-surface/40' : 'border-border/50 opacity-60')}>
                    <div className="flex flex-col shrink-0">
                      <button type="button" onClick={() => moveModule(index, -1)} disabled={index === 0} className="w-7 h-6 flex items-center justify-center rounded text-text-secondary hover:text-text-primary disabled:opacity-20" aria-label="Subir"><ArrowUp className="w-3.5 h-3.5" /></button>
                      <button type="button" onClick={() => moveModule(index, 1)} disabled={index === modules.length - 1} className="w-7 h-6 flex items-center justify-center rounded text-text-secondary hover:text-text-primary disabled:opacity-20" aria-label="Bajar"><ArrowDown className="w-3.5 h-3.5" /></button>
                    </div>
                    <span className="text-xl shrink-0 mt-1">{info.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <input
                        value={mod.title || ''}
                        placeholder={info.label}
                        onChange={e => updateModule(mod.id, { title: e.target.value }, 900)}
                        className="w-full bg-transparent text-sm font-semibold text-text-primary focus:outline-none focus:bg-surface rounded-md px-1.5 py-1 -ml-1.5"
                        aria-label="Título de la sección"
                      />
                      <p className="text-[11px] text-text-secondary">{info.description}</p>
                      {mod.type === 'releases' && (
                        <label className="mt-2 flex items-center gap-2 cursor-pointer w-fit">
                          <input type="checkbox" checked={!!mod.config?.allowArtistEdit} onChange={e => updateModule(mod.id, { config: { ...mod.config, allowArtistEdit: e.target.checked } })} className="w-4 h-4 accent-[var(--accent)]" />
                          <span className="text-[11px] text-text-secondary">El artista puede editar portada, canciones y orden</span>
                        </label>
                      )}
                    </div>
                    <button type="button" onClick={() => updateModule(mod.id, { isVisible: !mod.isVisible })} className={cn('h-8 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shrink-0', mod.isVisible ? 'bg-accent/10 text-accent' : 'bg-surface text-text-secondary')}>
                      {mod.isVisible ? <><Eye className="w-3.5 h-3.5" /> Visible</> : <><EyeOff className="w-3.5 h-3.5" /> Oculta</>}
                    </button>
                  </div>
                );
              })}
            </div>
          </Section>
        </div>

        <div className="space-y-4">
          {/* Branding */}
          <Section title="Personalización" icon={Sparkles}>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-secondary">Nombre del estudio</label>
                <input value={config.producerName || ''} onChange={e => change({ producerName: e.target.value }, 900)} placeholder="EZY Studio" className="w-full h-10 bg-surface border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-accent" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-secondary">Mensaje de bienvenida</label>
                <textarea value={config.welcomeMessage || ''} onChange={e => change({ welcomeMessage: e.target.value }, 900)} rows={4} placeholder={`Ej: ¡Hola ${artistName || ''}! Aquí tienes todos tus archivos, mezclas y el estado del trabajo.`} className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent resize-none" />
              </div>
            </div>
          </Section>

          {/* Tools */}
          <Section
            title="Herramientas"
            icon={Wrench}
            action={<Toggle checked={!!config.enableTools} label="Herramientas" onChange={v => change({ enableTools: v, allowedTools: v && allowedTools.length === 0 ? PORTAL_TOOLS.map(t => t.id) : config.allowedTools })} />}
          >
            {!config.enableTools ? (
              <p className="text-xs text-text-secondary">Da acceso al artista a las herramientas del estudio (descargador, conversor, recortador…) desde su portal.</p>
            ) : (
              <div className="space-y-1">
                {PORTAL_TOOLS.map(tool => {
                  const Icon = TOOL_ICONS[tool.iconName] || Wrench;
                  const on = allowedTools.includes(tool.id);
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => change({ allowedTools: on ? allowedTools.filter(id => id !== tool.id) : [...allowedTools, tool.id] })}
                      className={cn('w-full flex items-center gap-3 p-2 rounded-xl text-left transition-colors', on ? 'bg-accent/5' : 'hover:bg-surface')}
                    >
                      <span className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', tool.bg, tool.color)}><Icon className="w-4 h-4" /></span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs font-semibold text-text-primary truncate">{tool.name}{tool.badge ? ` · ${tool.badge}` : ''}</span>
                        <span className="block text-[11px] text-text-secondary truncate">{tool.description}</span>
                      </span>
                      {on ? <CircleCheck className="w-4 h-4 text-accent shrink-0" /> : <span className="w-4 h-4 rounded-full border border-border shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
