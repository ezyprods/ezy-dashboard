'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Loader2, Plus, Target, MoreVertical, Check, Search, FolderOpen, Table2, CalendarClock } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { customConfirm } from '@/lib/dialog';
import { useContextMenu } from '@/lib/contexts/ContextMenuContext';
import { matrixProgress } from '@/lib/matrixStats';
import { cn } from '@/lib/utils';
import { PROJECT_STATUS_META } from '@/components/projects/EditProjectModal';
import type { Campaign, CampaignColor, Project } from '@/types';

const COLORS: Record<CampaignColor, { label: string; hex: string }> = {
  purple: { label: 'Morado', hex: '#8b5cf6' },
  blue: { label: 'Azul', hex: '#3b82f6' },
  green: { label: 'Verde', hex: '#10b981' },
  orange: { label: 'Naranja', hex: '#f97316' },
  pink: { label: 'Rosa', hex: '#ec4899' },
  red: { label: 'Rojo', hex: '#ef4444' },
  cyan: { label: 'Cian', hex: '#06b6d4' },
  yellow: { label: 'Amarillo', hex: '#eab308' },
};

const EMOJIS = ['🎯', '💿', '🔥', '⚡', '🎸', '🎹', '🎤', '🎵', '🎶', '🚀', '💎', '🌟', '🎭', '🎬', '📀'];

interface ArtistCampaignsTabProps {
  artistId: string;
  projects: Project[];
  matrices?: any[];
  onCampaignsChanged?: (campaigns: Campaign[]) => void;
  onMatricesChanged?: () => void;
}

type FormState = { name: string; type: 'album' | 'singles'; driveFolderIds: string[]; description: string; color: CampaignColor; emoji: string };
const EMPTY_FORM: FormState = { name: '', type: 'singles', driveFolderIds: [], description: '', color: 'purple', emoji: '🎯' };

export function ArtistCampaignsTab({ artistId, projects, matrices = [], onCampaignsChanged }: ArtistCampaignsTabProps) {
  const { showMenu } = useContextMenu();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editing, setEditing] = useState<Campaign | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [projectQuery, setProjectQuery] = useState('');

  const update = useCallback((next: Campaign[]) => {
    setCampaigns(next);
    onCampaignsChanged?.(next);
  }, [onCampaignsChanged]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetch(`/api/artists/${artistId}/campaigns`)
      .then(res => { if (!res.ok) throw new Error('No se pudieron cargar las campañas'); return res.json(); })
      .then(data => { if (!cancelled) update(data.campaigns || []); })
      .catch(err => { if (!cancelled) toast.error(err.message); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [artistId, update]);

  const persist = async (next: Campaign[], successMsg: string) => {
    const prev = campaigns;
    update(next);
    try {
      const res = await fetch(`/api/artists/${artistId}/campaigns`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaigns: next }),
      });
      if (!res.ok) throw new Error('No se pudieron guardar las campañas');
      toast.success(successMsg);
      return true;
    } catch (err: any) {
      update(prev);
      toast.error(err.message);
      return false;
    }
  };

  const openEditor = (campaign?: Campaign) => {
    setProjectQuery('');
    if (campaign) {
      setForm({
        name: campaign.name,
        type: campaign.type,
        driveFolderIds: [...(campaign.driveFolderIds || [])],
        description: campaign.description || '',
        color: campaign.color || 'purple',
        emoji: campaign.emoji || '🎯',
      });
      setEditing(campaign);
    } else {
      setForm(EMPTY_FORM);
      setEditing('new');
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    const data = { ...form, name: form.name.trim() };
    const next = editing === 'new'
      ? [...campaigns, { id: crypto.randomUUID(), ...data, createdAt: new Date().toISOString() }]
      : campaigns.map(c => (editing && c.id === editing.id ? { ...c, ...data } : c));
    const ok = await persist(next, editing === 'new' ? 'Campaña creada' : 'Campaña guardada');
    setSaving(false);
    if (ok) setEditing(null);
  };

  const remove = async (campaign: Campaign) => {
    if (!await customConfirm(`Se eliminará la campaña "${campaign.name}". Los proyectos y sus carpetas de Drive no se tocan.`, 'Eliminar campaña')) return;
    persist(campaigns.filter(c => c.id !== campaign.id), 'Campaña eliminada');
  };

  const filteredProjects = useMemo(() => {
    const q = projectQuery.trim().toLowerCase();
    return projects.filter(p => !q || p.title.toLowerCase().includes(q));
  }, [projects, projectQuery]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-48 rounded-2xl bg-surface-elevated border border-border animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="text-xs text-text-secondary flex-1">Agrupa proyectos (singles, EP, álbum…) para seguir una campaña completa sin reorganizar carpetas en Drive.</p>
        <button type="button" onClick={() => openEditor()} className="h-10 px-4 rounded-xl bg-accent text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-accent/90 shrink-0">
          <Plus className="w-4 h-4" /> Nueva campaña
        </button>
      </div>

      {campaigns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface-elevated/50 py-16 px-6 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-accent/10 text-accent flex items-center justify-center mb-3"><Target className="w-7 h-7" /></div>
          <p className="text-sm font-semibold text-text-primary">Sin campañas todavía</p>
          <p className="text-xs text-text-secondary mt-1 max-w-sm">Crea una campaña para agrupar los proyectos de un lanzamiento y ver su progreso de un vistazo.</p>
          <button type="button" onClick={() => openEditor()} className="mt-4 h-10 px-4 rounded-xl bg-accent text-white text-sm font-semibold inline-flex items-center gap-2"><Plus className="w-4 h-4" /> Crear campaña</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {campaigns.map(campaign => {
            const color = COLORS[campaign.color || 'purple'] || COLORS.purple;
            const linked = (campaign.driveFolderIds || []).map(id => projects.find(p => p.id === id)).filter(Boolean) as Project[];
            const missing = (campaign.driveFolderIds || []).length - linked.length;
            const linkedMatrices = matrices.filter(m => linked.some(p => p.id === m.projectId));
            const totals = linkedMatrices.reduce((acc, m) => { const pr = matrixProgress(m); return { done: acc.done + pr.done, total: acc.total + pr.total }; }, { done: 0, total: 0 });
            const percent = totals.total > 0 ? Math.round((totals.done / totals.total) * 100) : null;
            const finished = linked.filter(p => p.status === 'completed').length;
            const nextDelivery = linked
              .filter(p => p.deliveryDate && (p.status || 'active') === 'active')
              .map(p => new Date(p.deliveryDate!))
              .sort((a, b) => a.getTime() - b.getTime())[0];

            const menu = (x: number, y: number) => showMenu(x, y, [
              { heading: campaign.name },
              { label: 'Editar campaña', icon: 'Edit3', action: () => openEditor(campaign) },
              { separator: true },
              { label: 'Eliminar campaña', icon: 'Trash2', variant: 'danger', action: () => remove(campaign) },
            ]);

            return (
              <div
                key={campaign.id}
                onContextMenu={e => { e.preventDefault(); menu(e.clientX, e.clientY); }}
                className="relative rounded-2xl border border-border bg-surface-elevated overflow-hidden flex flex-col"
              >
                <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${color.hex}, ${color.hex}55)` }} />
                <div className="p-4 flex-1 flex flex-col">
                  <div className="flex items-start gap-3">
                    <span className="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 border" style={{ background: `${color.hex}1f`, borderColor: `${color.hex}55` }}>
                      {campaign.emoji || '🎯'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-base font-bold text-text-primary truncate">{campaign.name}</h4>
                      <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: color.hex }}>{campaign.type === 'album' ? 'Álbum' : 'Singles'}</p>
                    </div>
                    <button type="button" onClick={e => { const r = e.currentTarget.getBoundingClientRect(); menu(r.right - 220, r.bottom + 4); }} className="w-9 h-9 -mr-2 -mt-1 flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface shrink-0" aria-label="Más acciones">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>

                  {campaign.description && <p className="text-xs text-text-secondary mt-3 line-clamp-2">{campaign.description}</p>}

                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-surface px-2 py-2">
                      <p className="text-base font-black text-text-primary leading-none">{linked.length}</p>
                      <p className="text-[10px] text-text-secondary mt-1">proyectos</p>
                    </div>
                    <div className="rounded-xl bg-surface px-2 py-2">
                      <p className="text-base font-black text-text-primary leading-none">{finished}</p>
                      <p className="text-[10px] text-text-secondary mt-1">terminados</p>
                    </div>
                    <div className="rounded-xl bg-surface px-2 py-2">
                      <p className="text-base font-black text-text-primary leading-none">{percent === null ? '—' : `${percent}%`}</p>
                      <p className="text-[10px] text-text-secondary mt-1">producción</p>
                    </div>
                  </div>

                  {nextDelivery && (
                    <p className="mt-3 text-[11px] text-text-secondary inline-flex items-center gap-1.5">
                      <CalendarClock className="w-3.5 h-3.5" /> Próxima entrega: {nextDelivery.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}
                    </p>
                  )}

                  <div className="mt-3 space-y-1">
                    {linked.slice(0, 5).map(p => {
                      const meta = PROJECT_STATUS_META[p.status || 'active'] || PROJECT_STATUS_META.active;
                      const matrix = matrices.find(m => m.projectId === p.id);
                      return (
                        <div key={p.id} className="flex items-center gap-2 h-9 px-2 rounded-lg hover:bg-surface">
                          <span className={cn('w-2 h-2 rounded-full shrink-0', meta.dot)} title={meta.label} />
                          <Link href={`/projects/${p.id}`} className="flex-1 min-w-0 truncate text-xs font-medium text-text-primary hover:text-accent">{p.title}</Link>
                          {matrix && (
                            <Link href={`/artists/${artistId}?tab=matrices&matrixId=${matrix.id}`} className="text-[10px] text-text-secondary hover:text-accent inline-flex items-center gap-1 shrink-0" title="Abrir matriz">
                              <Table2 className="w-3 h-3" /> {matrixProgress(matrix).percent}%
                            </Link>
                          )}
                          <Link href={`/artists/${artistId}?tab=files&folderId=${p.id}`} className="text-text-secondary hover:text-accent shrink-0" title="Ver archivos" aria-label="Ver archivos">
                            <FolderOpen className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      );
                    })}
                    {linked.length > 5 && <p className="text-[11px] text-text-secondary px-2">+{linked.length - 5} proyectos más</p>}
                    {linked.length === 0 && <p className="text-xs text-text-secondary italic px-2">Sin proyectos vinculados</p>}
                    {missing > 0 && <p className="text-[11px] text-warning px-2">{missing} proyecto{missing === 1 ? '' : 's'} ya no existe{missing === 1 ? '' : 'n'}</p>}
                  </div>

                  <button type="button" onClick={() => openEditor(campaign)} className="mt-auto pt-3 text-xs font-semibold text-left" style={{ color: color.hex }}>
                    Editar proyectos →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <Modal isOpen onClose={() => setEditing(null)} title={editing === 'new' ? 'Nueva campaña' : 'Editar campaña'} className="md:max-w-xl">
          <form onSubmit={save} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-secondary">Nombre</label>
                <input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: Singles 2026" className="w-full h-11 bg-surface border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-accent" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-secondary">Tipo</label>
                <div className="flex p-0.5 rounded-xl bg-surface border border-border h-11">
                  {(['singles', 'album'] as const).map(t => (
                    <button key={t} type="button" onClick={() => setForm(f => ({ ...f, type: t }))} className={cn('flex-1 px-3 rounded-lg text-sm font-medium', form.type === t ? 'bg-surface-elevated text-text-primary shadow-sm' : 'text-text-secondary')}>
                      {t === 'singles' ? 'Singles' : 'Álbum'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text-secondary">Descripción <span className="font-normal">(opcional)</span></label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full bg-surface border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-accent resize-none" placeholder="Objetivo, fechas clave…" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-text-secondary">Color</label>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(COLORS) as CampaignColor[]).map(c => (
                    <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))} title={COLORS[c].label} aria-label={COLORS[c].label}
                      className={cn('w-8 h-8 rounded-full flex items-center justify-center transition-transform', form.color === c && 'ring-2 ring-offset-2 ring-offset-surface-elevated ring-text-primary scale-110')}
                      style={{ background: COLORS[c].hex }}>
                      {form.color === c && <Check className="w-4 h-4 text-white" />}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-text-secondary">Icono</label>
                <div className="flex flex-wrap gap-1.5">
                  {EMOJIS.map(e => (
                    <button key={e} type="button" onClick={() => setForm(f => ({ ...f, emoji: e }))} className={cn('w-8 h-8 rounded-lg text-base flex items-center justify-center border', form.emoji === e ? 'border-accent bg-accent/15' : 'border-transparent hover:bg-surface')}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-text-secondary">Proyectos ({form.driveFolderIds.length})</label>
                {projects.length > 6 && (
                  <div className="relative w-44">
                    <Search className="w-3.5 h-3.5 text-text-secondary absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input value={projectQuery} onChange={e => setProjectQuery(e.target.value)} placeholder="Filtrar…" className="w-full h-8 bg-surface border border-border rounded-lg pl-8 pr-2 text-xs focus:outline-none focus:border-accent" />
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-border max-h-60 overflow-y-auto divide-y divide-border/50">
                {filteredProjects.map(p => {
                  const selected = form.driveFolderIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, driveFolderIds: selected ? f.driveFolderIds.filter(id => id !== p.id) : [...f.driveFolderIds, p.id] }))}
                      className={cn('w-full flex items-center gap-3 px-3 min-h-[44px] text-left', selected ? 'bg-accent/10' : 'hover:bg-surface')}
                    >
                      <span className={cn('w-5 h-5 rounded-md border flex items-center justify-center shrink-0', selected ? 'bg-accent border-accent text-white' : 'border-border')}>
                        {selected && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                      </span>
                      <span className="flex-1 min-w-0 truncate text-sm text-text-primary">{p.title}</span>
                      <span className="text-[10px] text-text-secondary shrink-0">{PROJECT_STATUS_META[p.status || 'active']?.label}</span>
                    </button>
                  );
                })}
                {filteredProjects.length === 0 && <p className="text-xs text-text-secondary text-center py-6">{projects.length === 0 ? 'Este artista no tiene proyectos todavía' : 'Ningún proyecto coincide'}</p>}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className="h-10 px-4 rounded-xl border border-border text-sm font-medium hover:bg-surface">Cancelar</button>
              <button type="submit" disabled={saving || !form.name.trim()} className="h-10 px-5 rounded-xl bg-accent text-white text-sm font-semibold disabled:opacity-40 inline-flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} {editing === 'new' ? 'Crear campaña' : 'Guardar'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
