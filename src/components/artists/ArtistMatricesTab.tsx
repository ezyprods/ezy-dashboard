'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  Loader2, Plus, Table2, ChevronRight, ChevronLeft, Music, Layers, CheckCircle2, MoreVertical, Globe, FolderOpen,
  Search, X, Maximize2,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { ProductionGridBoard } from '@/components/projects/ProductionGrid';
import { customConfirm, customPrompt } from '@/lib/dialog';
import { useContextMenu, type MenuItem } from '@/lib/contexts/ContextMenuContext';
import { copyText } from '@/components/explorer/explorerUtils';
import { matrixProgress } from '@/lib/matrixStats';
import { cn } from '@/lib/utils';
import type { Project } from '@/types';

interface ArtistMatricesTabProps {
  artistId: string;
  artistName?: string;
  projects?: Project[];
  onMatricesChanged?: (matrices: any[]) => void;
}

function setMatrixParam(matrixId: string | null) {
  const url = new URL(window.location.href);
  if (matrixId) url.searchParams.set('matrixId', matrixId);
  else url.searchParams.delete('matrixId');
  window.history.replaceState(null, '', `${url.pathname}?${url.searchParams.toString()}`);
}

export function ArtistMatricesTab({ artistId, artistName, projects = [], onMatricesChanged }: ArtistMatricesTabProps) {
  const searchParams = useSearchParams();
  const { showMenu } = useContextMenu();
  const [matrices, setMatrices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', projectId: '', templateId: '' });
  const [submitting, setSubmitting] = useState(false);
  const [linking, setLinking] = useState<any | null>(null);

  const activeMatrixId = searchParams.get('matrixId');

  const update = useCallback((next: any[]) => {
    setMatrices(next);
    onMatricesChanged?.(next);
  }, [onMatricesChanged]);

  const fetchMatrices = useCallback(async () => {
    try {
      const res = await fetch(`/api/artists/${artistId}/matrices`);
      if (!res.ok) throw new Error('No se pudieron cargar las matrices');
      const data = await res.json();
      update(data.matrices || []);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [artistId, update]);

  useEffect(() => { fetchMatrices(); }, [fetchMatrices]);

  const putMatrix = async (matrixId: string, body: Record<string, unknown>, optimistic: Record<string, unknown>, successMsg?: string) => {
    const prev = matrices;
    update(matrices.map(m => (m.id === matrixId ? { ...m, ...optimistic } : m)));
    try {
      const res = await fetch(`/api/artists/${artistId}/matrices/${matrixId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('No se pudo guardar la matriz');
      if (successMsg) toast.success(successMsg);
    } catch (err: any) {
      update(prev);
      toast.error(err.message);
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/artists/${artistId}/matrices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name.trim(), projectId: form.projectId || undefined, duplicateFromId: form.templateId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo crear la matriz');
      update([...matrices, data.matrix]);
      setCreateOpen(false);
      setForm({ name: '', projectId: '', templateId: '' });
      toast.success('Matriz creada');
      setMatrixParam(data.matrix.id);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (matrix: any) => {
    if (!await customConfirm(`La matriz "${matrix.name}" se eliminará por completo (también sus fechas en el calendario).`, 'Eliminar matriz')) return;
    const prev = matrices;
    update(matrices.filter(m => m.id !== matrix.id));
    if (activeMatrixId === matrix.id) setMatrixParam(null);
    try {
      const res = await fetch(`/api/artists/${artistId}/matrices/${matrix.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('No se pudo eliminar la matriz');
      toast.success('Matriz eliminada');
    } catch (err: any) {
      update(prev);
      toast.error(err.message);
    }
  };

  const projectOf = (matrix: any) => projects.find(p => p.id === matrix.projectId || p.driveFolderId === matrix.projectId);

  const menuFor = (matrix: any): MenuItem[] => {
    const progress = matrixProgress(matrix);
    const project = projectOf(matrix);
    return [
      { heading: matrix.name },
      { label: 'Abrir matriz', icon: 'Table2', action: () => setMatrixParam(matrix.id) },
      { label: 'Renombrar', icon: 'Pencil', action: async () => {
        const name = (await customPrompt('Nuevo nombre', matrix.name, 'Renombrar matriz'))?.trim();
        if (name && name !== matrix.name) putMatrix(matrix.id, { name }, { name }, 'Matriz renombrada');
      } },
      { label: project ? 'Cambiar proyecto vinculado' : 'Vincular a un proyecto', icon: 'FolderInput', action: () => setLinking(matrix) },
      ...(project ? [{ label: 'Abrir proyecto', icon: 'FolderOpen', action: () => window.location.assign(`/projects/${project.id}`) }] : []),
      { label: 'Duplicar como plantilla', icon: 'Copy', action: () => { setForm({ name: `${matrix.name} (copia)`, projectId: '', templateId: matrix.id }); setCreateOpen(true); } },
      { label: 'Copiar enlace', icon: 'Link', action: () => copyText(`${window.location.origin}/artists/${artistId}?tab=matrices&matrixId=${matrix.id}`, 'Enlace copiado') },
      { separator: true },
      {
        label: matrix.sharedInPortal ? 'Dejar de mostrar en el portal' : 'Mostrar en el portal del artista',
        icon: 'Share2',
        action: () => putMatrix(matrix.id, { sharedInPortal: !matrix.sharedInPortal }, { sharedInPortal: !matrix.sharedInPortal }, matrix.sharedInPortal ? 'Oculta en el portal' : 'Visible en el portal'),
      },
      {
        label: progress.completed ? 'Marcar como activa' : 'Marcar como completada',
        icon: progress.completed ? 'RotateCcw' : 'CheckCircle2',
        action: () => {
          const forceStatus = progress.completed ? 'active' : 'completed';
          putMatrix(matrix.id, { forceStatus }, { forceStatus });
        },
      },
      { separator: true },
      { label: 'Eliminar', icon: 'Trash2', variant: 'danger', action: () => remove(matrix) },
    ];
  };

  const { active, completed } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = matrices.filter(m => !q || (m.name || '').toLowerCase().includes(q) || (projectOf(m)?.title || '').toLowerCase().includes(q));
    return {
      active: list.filter(m => !matrixProgress(m).completed),
      completed: list.filter(m => matrixProgress(m).completed),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrices, query, projects]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-40 rounded-2xl bg-surface-elevated border border-border animate-pulse" />)}
      </div>
    );
  }

  // ─── Single matrix view ─────────────────────────────────────────────────
  if (activeMatrixId) {
    const matrix = matrices.find(m => m.id === activeMatrixId);
    if (!matrix) {
      return (
        <div className="rounded-2xl border border-border bg-surface-elevated p-10 text-center">
          <p className="text-sm text-text-primary font-semibold">Esta matriz ya no existe</p>
          <button type="button" onClick={() => setMatrixParam(null)} className="mt-4 h-10 px-4 rounded-xl border border-border text-sm hover:bg-surface">Volver a matrices</button>
        </div>
      );
    }
    const progress = matrixProgress(matrix);
    const project = projectOf(matrix);
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => { setMatrixParam(null); fetchMatrices(); }} className="h-10 pl-2 pr-3 rounded-xl text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-elevated inline-flex items-center gap-1">
            <ChevronLeft className="w-4 h-4" /> Matrices
          </button>
          <ChevronRight className="w-4 h-4 text-text-secondary/50" />
          <h2 className="text-lg font-bold text-text-primary truncate min-w-0 flex-1">{matrix.name}</h2>
          <div className="flex items-center gap-2">
            {project && (
              <Link href={`/projects/${project.id}`} className="h-9 px-3 rounded-xl border border-border text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-surface-elevated">
                <FolderOpen className="w-3.5 h-3.5" /> {project.title}
              </Link>
            )}
            <span className="h-9 px-3 rounded-xl bg-accent/10 text-accent text-xs font-bold inline-flex items-center">{progress.percent}%</span>
            <Link href={`/matrices?id=${matrix.id}&artist=${artistId}`} className="h-9 w-9 rounded-xl border border-border inline-flex items-center justify-center hover:bg-surface-elevated" title="Pantalla completa" aria-label="Pantalla completa">
              <Maximize2 className="w-4 h-4" />
            </Link>
            <button type="button" onClick={e => { const r = e.currentTarget.getBoundingClientRect(); showMenu(r.right - 230, r.bottom + 4, menuFor(matrix)); }} className="h-9 w-9 rounded-xl border border-border inline-flex items-center justify-center hover:bg-surface-elevated" aria-label="Más acciones">
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface-elevated p-3 md:p-5 overflow-x-auto">
          <ProductionGridBoard
            key={matrix.id}
            artistId={artistId}
            matrixId={matrix.id}
            matrixName={matrix.name}
            artistName={artistName}
            initialProjectId={matrix.projectId || undefined}
          />
        </div>
        {linking && <LinkProjectModal matrix={linking} projects={projects} onClose={() => setLinking(null)} onPick={projectId => { putMatrix(linking.id, { projectId }, { projectId }, projectId ? 'Matriz vinculada' : 'Vínculo eliminado'); setLinking(null); }} />}
      </div>
    );
  }

  // ─── List ───────────────────────────────────────────────────────────────
  const card = (matrix: any) => {
    const progress = matrixProgress(matrix);
    const project = projectOf(matrix);
    return (
      <div
        key={matrix.id}
        data-context="ignore"
        onClick={() => setMatrixParam(matrix.id)}
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); showMenu(e.clientX, e.clientY, menuFor(matrix)); }}
        className={cn('group rounded-2xl border bg-surface-elevated p-4 cursor-pointer transition-all hover:border-accent/40 hover:shadow-lg hover:shadow-accent/5 flex flex-col', progress.completed ? 'border-border/60 opacity-80 hover:opacity-100' : 'border-border')}
      >
        <div className="flex items-start gap-3">
          <span className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', progress.completed ? 'bg-success/10 text-success' : 'bg-accent/10 text-accent')}>
            {progress.completed ? <CheckCircle2 className="w-5 h-5" /> : <Table2 className="w-5 h-5" />}
          </span>
          <div className="flex-1 min-w-0">
            <h4 className="text-base font-bold text-text-primary truncate group-hover:text-accent transition-colors">{matrix.name}</h4>
            {project ? (
              <Link href={`/projects/${project.id}`} onClick={e => e.stopPropagation()} className="text-xs text-text-secondary hover:text-accent inline-flex items-center gap-1 max-w-full">
                <FolderOpen className="w-3 h-3 shrink-0" /><span className="truncate">{project.title}</span>
              </Link>
            ) : (
              <button type="button" onClick={e => { e.stopPropagation(); setLinking(matrix); }} className="text-xs text-text-secondary/80 hover:text-accent">Vincular a un proyecto</button>
            )}
          </div>
          <button type="button" onClick={e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); showMenu(r.right - 230, r.bottom + 4, menuFor(matrix)); }} className="w-9 h-9 -mr-2 -mt-1 flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface shrink-0" aria-label="Más acciones">
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-4 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-text-secondary">{progress.total > 0 ? `${progress.done} de ${progress.total} tareas` : 'Sin tareas todavía'}</span>
            <span className="font-bold text-text-primary">{progress.percent}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface overflow-hidden">
            <div className={cn('h-full rounded-full', progress.completed ? 'bg-success' : 'bg-gradient-to-r from-accent to-accent-light')} style={{ width: `${progress.percent}%` }} />
          </div>
        </div>

        <div className="mt-auto pt-4 flex items-center gap-2 text-[11px] text-text-secondary">
          <span className="inline-flex items-center gap-1"><Music className="w-3.5 h-3.5" /> {progress.songs} {progress.songs === 1 ? 'tema' : 'temas'}</span>
          <span className="inline-flex items-center gap-1"><Layers className="w-3.5 h-3.5" /> {progress.phases} {progress.phases === 1 ? 'fase' : 'fases'}</span>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); putMatrix(matrix.id, { sharedInPortal: !matrix.sharedInPortal }, { sharedInPortal: !matrix.sharedInPortal }, matrix.sharedInPortal ? 'Oculta en el portal' : 'Visible en el portal'); }}
            className={cn('ml-auto h-7 px-2 rounded-lg border inline-flex items-center gap-1 font-semibold transition-colors', matrix.sharedInPortal ? 'border-accent/40 bg-accent/10 text-accent' : 'border-border hover:text-text-primary')}
            title={matrix.sharedInPortal ? 'Visible en el portal del artista' : 'Oculta en el portal'}
          >
            <Globe className="w-3 h-3" /> {matrix.sharedInPortal ? 'En portal' : 'Privada'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="w-4 h-4 text-text-secondary absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar matriz o proyecto…" className="w-full h-10 bg-surface-elevated border border-border rounded-xl pl-9 pr-8 text-sm focus:outline-none focus:border-accent" />
          {query && <button type="button" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-text-secondary" aria-label="Borrar"><X className="w-4 h-4" /></button>}
        </div>
        <p className="text-xs text-text-secondary sm:flex-1">Seguimiento de temas y fases de producción. Márcalas como visibles para que el artista vea el progreso en su portal.</p>
        <button type="button" onClick={() => { setForm({ name: '', projectId: '', templateId: '' }); setCreateOpen(true); }} className="h-10 px-4 rounded-xl bg-accent text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-accent/90 shrink-0">
          <Plus className="w-4 h-4" /> Nueva matriz
        </button>
      </div>

      {active.length === 0 && completed.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface-elevated/50 py-16 px-6 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-accent/10 text-accent flex items-center justify-center mb-3"><Table2 className="w-7 h-7" /></div>
          <p className="text-sm font-semibold text-text-primary">{query ? 'Ninguna matriz coincide' : 'Sin matrices todavía'}</p>
          <p className="text-xs text-text-secondary mt-1 max-w-sm">Crea una matriz para seguir cada tema de un proyecto: grabación, mezcla, master, entregas…</p>
        </div>
      ) : (
        <>
          {active.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">{active.map(card)}</div>
          ) : (
            <p className="text-sm text-text-secondary text-center py-6">Todas las matrices están completadas 🎉</p>
          )}
          {completed.length > 0 && (
            <div className="pt-2">
              <button type="button" onClick={() => setShowCompleted(v => !v)} className="w-full flex items-center gap-2 text-sm font-semibold text-text-secondary hover:text-text-primary">
                <ChevronRight className={cn('w-4 h-4 transition-transform', showCompleted && 'rotate-90')} />
                Completadas ({completed.length})
                <span className="flex-1 h-px bg-border ml-2" />
              </button>
              {showCompleted && <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-3 animate-fade-in">{completed.map(card)}</div>}
            </div>
          )}
        </>
      )}

      {createOpen && (
        <Modal isOpen onClose={() => setCreateOpen(false)} title={form.templateId ? 'Duplicar matriz' : 'Nueva matriz'} description={form.templateId ? 'Se copia la estructura (temas y fases) con los estados reiniciados.' : undefined}>
          <form onSubmit={create} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text-secondary">Nombre</label>
              <input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: Álbum 2026, Single de verano…" className="w-full h-11 bg-surface border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-accent" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-text-secondary">Proyecto vinculado</label>
              <select value={form.projectId} onChange={e => { const id = e.target.value; setForm(f => ({ ...f, projectId: id, name: f.name || projects.find(p => p.id === id)?.title || '' })); }} className="w-full h-11 bg-surface border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-accent">
                <option value="">Sin vincular</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
              <p className="text-[11px] text-text-secondary">Vincularla permite enlazar los archivos del proyecto a cada tema y verla desde la página del proyecto.</p>
            </div>
            {!form.templateId && matrices.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-secondary">Plantilla</label>
                <select value={form.templateId} onChange={e => setForm(f => ({ ...f, templateId: e.target.value }))} className="w-full h-11 bg-surface border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-accent">
                  <option value="">Matriz vacía</option>
                  {matrices.map(m => <option key={m.id} value={m.id}>Copiar estructura de “{m.name}”</option>)}
                </select>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setCreateOpen(false)} className="h-10 px-4 rounded-xl border border-border text-sm font-medium hover:bg-surface">Cancelar</button>
              <button type="submit" disabled={submitting || !form.name.trim()} className="h-10 px-5 rounded-xl bg-accent text-white text-sm font-semibold disabled:opacity-40 inline-flex items-center gap-2">
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Crear
              </button>
            </div>
          </form>
        </Modal>
      )}

      {linking && <LinkProjectModal matrix={linking} projects={projects} onClose={() => setLinking(null)} onPick={projectId => { putMatrix(linking.id, { projectId }, { projectId }, projectId ? 'Matriz vinculada' : 'Vínculo eliminado'); setLinking(null); }} />}
    </div>
  );
}

function LinkProjectModal({ matrix, projects, onClose, onPick }: { matrix: any; projects: Project[]; onClose: () => void; onPick: (projectId: string | null) => void }) {
  return (
    <Modal isOpen onClose={onClose} title="Vincular a un proyecto" description={matrix.name}>
      <div className="space-y-1 max-h-[55dvh] overflow-y-auto -mx-1 px-1">
        {projects.length === 0 && <p className="text-sm text-text-secondary text-center py-8">Este artista no tiene proyectos</p>}
        {projects.map(p => (
          <button key={p.id} type="button" onClick={() => onPick(p.id)} className={cn('w-full flex items-center gap-3 px-3 min-h-[48px] rounded-xl text-left', matrix.projectId === p.id ? 'bg-accent/10' : 'hover:bg-surface')}>
            <FolderOpen className="w-4 h-4 text-accent shrink-0" />
            <span className="flex-1 truncate text-sm text-text-primary">{p.title}</span>
            {matrix.projectId === p.id && <CheckCircle2 className="w-4 h-4 text-accent" />}
          </button>
        ))}
        {matrix.projectId && (
          <button type="button" onClick={() => onPick(null)} className="w-full h-11 rounded-xl text-sm font-medium text-error hover:bg-error/10 mt-2">Quitar vínculo</button>
        )}
      </div>
    </Modal>
  );
}
