'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Plus, Search, LayoutGrid, List, FolderOpen, UploadCloud, MoreVertical, Table2, CalendarClock, AlertTriangle,
  AudioWaveform, Files, Loader2, Disc, Disc3, Library, Sparkles, Target, X,
} from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';
import { PROJECT_TYPE_LABELS } from '@/lib/constants';
import { customConfirm, customPrompt } from '@/lib/dialog';
import { useContextMenu, type MenuItem } from '@/lib/contexts/ContextMenuContext';
import { isFileDrag, useGlobalDragDrop } from '@/lib/contexts/GlobalDragDropContext';
import { useIndex, loadIndex } from '@/components/explorer/driveStore';
import { formatBytes } from '@/components/explorer/fileKinds';
import { usePreference } from '@/components/explorer/explorerUtils';
import { EditProjectModal, PROJECT_STATUS_META, saveProject } from '@/components/projects/EditProjectModal';
import { matrixProgress } from '@/lib/matrixStats';
import type { Campaign, Project, ProjectStatus } from '@/types';

const TYPE_ICON: Record<string, React.ElementType> = { single: Disc, ep: Disc3, album: Library, free: Sparkles };

type StatusFilter = 'active' | 'completed' | 'archived' | 'all';

interface ArtistProjectsTabProps {
  artistId: string;
  artistName: string;
  projects: Project[];
  isLoading: boolean;
  matrices: any[];
  campaigns: Campaign[];
  onRefresh: () => void;
  onNewProject: () => void;
  onMatricesChanged: () => void;
}

export function ArtistProjectsTab({ artistId, artistName, projects, isLoading, matrices, campaigns, onRefresh, onNewProject, onMatricesChanged }: ArtistProjectsTabProps) {
  const router = useRouter();
  const { showMenu } = useContextMenu();
  const { openSmartUpload, isDraggingFiles } = useGlobalDragDrop();
  const index = useIndex(artistId);
  const [local, setLocal] = useState<Project[]>(projects);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [sort, setSort] = usePreference<'recent' | 'name' | 'delivery'>('projectsSort', 'recent');
  const [viewMode, setViewMode] = usePreference<'grid' | 'list'>('projectsView', 'grid');
  const [editing, setEditing] = useState<Project | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);

  useEffect(() => setLocal(projects), [projects]);

  // File statistics per project, computed from the artist's Drive index
  const stats = useMemo(() => {
    const byId = new Map(index.items.map(i => [i.id, i]));
    const projectOf = new Map<string, string>();
    const resolve = (folderId: string | null): string | null => {
      if (!folderId) return null;
      if (projectOf.has(folderId)) return projectOf.get(folderId)!;
      let current = byId.get(folderId);
      let guard = 0;
      while (current && current.parentId !== artistId && guard++ < 30) current = current.parentId ? byId.get(current.parentId) : undefined;
      const result = current && current.parentId === artistId ? current.id : null;
      if (result) projectOf.set(folderId, result);
      return result;
    };
    const out = new Map<string, { files: number; audio: number; bytes: number; lastModified: string | null }>();
    for (const item of index.items) {
      if (item.isFolder) continue;
      const pid = resolve(item.parentId);
      if (!pid) continue;
      const s = out.get(pid) || { files: 0, audio: 0, bytes: 0, lastModified: null };
      s.files++;
      if (item.kind === 'audio') s.audio++;
      s.bytes += item.size || 0;
      if (item.modifiedTime && (!s.lastModified || item.modifiedTime > s.lastModified)) s.lastModified = item.modifiedTime;
      out.set(pid, s);
    }
    return out;
  }, [index.items, artistId]);

  const counts = useMemo(() => ({
    active: local.filter(p => (p.status || 'active') === 'active').length,
    completed: local.filter(p => p.status === 'completed').length,
    archived: local.filter(p => p.status === 'archived').length,
    all: local.length,
  }), [local]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = local.filter(p => (status === 'all' || (p.status || 'active') === status) && (!q || p.title.toLowerCase().includes(q)));
    return [...list].sort((a, b) => {
      if (sort === 'name') return a.title.localeCompare(b.title, 'es', { numeric: true });
      if (sort === 'delivery') {
        const da = a.deliveryDate ? new Date(a.deliveryDate).getTime() : Infinity;
        const db = b.deliveryDate ? new Date(b.deliveryDate).getTime() : Infinity;
        return da - db;
      }
      const ra = stats.get(a.id)?.lastModified || a.updatedAt || a.createdAt || '';
      const rb = stats.get(b.id)?.lastModified || b.updatedAt || b.createdAt || '';
      return rb.localeCompare(ra);
    });
  }, [local, status, query, sort, stats]);

  const matrixFor = (project: Project) => matrices.find(m => m.projectId === project.id || m.projectId === project.driveFolderId);
  const campaignsFor = (project: Project) => campaigns.filter(c => c.driveFolderIds?.includes(project.id));

  const patchLocal = (id: string, patch: Partial<Project>) => setLocal(prev => prev.map(p => (p.id === id ? { ...p, ...patch } : p)));

  const changeStatus = async (project: Project, next: ProjectStatus) => {
    const prev = project.status;
    patchLocal(project.id, { status: next });
    try {
      await saveProject(project.id, { status: next });
      toast.success(`"${project.title}" → ${PROJECT_STATUS_META[next].label}`);
    } catch (err: any) {
      patchLocal(project.id, { status: prev });
      toast.error(err.message);
    }
  };

  const createMatrix = async (project: Project) => {
    const name = (await customPrompt('Nombre de la matriz', project.title, 'Nueva matriz vinculada'))?.trim();
    if (!name) return;
    const t = toast.loading('Creando matriz…');
    try {
      const res = await fetch(`/api/artists/${artistId}/matrices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, projectId: project.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      onMatricesChanged();
      toast.success('Matriz creada', { id: t, action: { label: 'Abrir', onClick: () => router.push(`/artists/${artistId}?tab=matrices&matrixId=${data.matrix.id}`) } });
    } catch (err: any) {
      toast.error(`No se pudo crear la matriz: ${err.message}`, { id: t });
    }
  };

  const trashProject = async (project: Project) => {
    const ok = await customConfirm(`"${project.title}" y todos sus archivos se moverán a la papelera de Google Drive. Podrás recuperarlos desde la papelera del explorador.`, 'Eliminar proyecto');
    if (!ok) return;
    const t = toast.loading('Eliminando…');
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('No se pudo eliminar el proyecto');
      setLocal(prev => prev.filter(p => p.id !== project.id));
      loadIndex(artistId, { force: true });
      toast.success('Proyecto movido a la papelera', { id: t });
      onRefresh();
    } catch (err: any) {
      toast.error(err.message, { id: t });
    }
  };

  const upload = (project: Project, files: File[]) => {
    openSmartUpload({ files, targetType: 'artist', artistId, projectId: project.id, onFinished: () => loadIndex(artistId, { force: true }) });
  };

  const menuFor = (project: Project): MenuItem[] => {
    const matrix = matrixFor(project);
    return [
      { heading: project.title },
      { label: 'Abrir proyecto', icon: 'FolderOpen', action: () => router.push(`/projects/${project.id}`) },
      { label: 'Ver en Archivos', icon: 'HardDrive', action: () => router.push(`/artists/${artistId}?tab=files&folderId=${project.id}`) },
      { label: 'Subir archivos', icon: 'UploadCloud', action: () => upload(project, []) },
      { separator: true },
      { label: 'Editar', icon: 'Edit3', action: () => setEditing(project) },
      ...(Object.keys(PROJECT_STATUS_META) as ProjectStatus[]).filter(s => s !== (project.status || 'active')).map(s => ({
        label: `Marcar como ${PROJECT_STATUS_META[s].label.toLowerCase()}`,
        icon: s === 'completed' ? 'CheckCircle2' : s === 'archived' ? 'Paperclip' : 'RotateCcw',
        action: () => changeStatus(project, s),
      })),
      { separator: true },
      matrix
        ? { label: 'Abrir matriz', icon: 'Table2', action: () => router.push(`/artists/${artistId}?tab=matrices&matrixId=${matrix.id}`) }
        : { label: 'Crear matriz vinculada', icon: 'Table2', action: () => createMatrix(project) },
      { label: 'Abrir en Google Drive', icon: 'ExternalLink', action: () => window.open(project.driveUrl || `https://drive.google.com/drive/folders/${project.id}`, '_blank', 'noopener') },
      { separator: true },
      { label: 'Eliminar proyecto', icon: 'Trash2', variant: 'danger', action: () => trashProject(project) },
    ];
  };

  const dropProps = (project: Project) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      if (dropId !== project.id) setDropId(project.id);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropId(prev => (prev === project.id ? null : prev));
    },
    onDrop: (e: React.DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      setDropId(null);
      upload(project, Array.from(e.dataTransfer.files));
    },
  });

  const FILTERS: { id: StatusFilter; label: string }[] = [
    { id: 'active', label: 'En curso' },
    { id: 'completed', label: 'Terminados' },
    { id: 'archived', label: 'Archivados' },
    { id: 'all', label: 'Todos' },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="relative flex-1 md:max-w-xs">
            <Search className="w-4 h-4 text-text-secondary absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar proyecto…" className="w-full h-10 bg-surface-elevated border border-border rounded-xl pl-9 pr-8 text-sm focus:outline-none focus:border-accent" />
            {query && <button type="button" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-text-secondary" aria-label="Borrar"><X className="w-4 h-4" /></button>}
          </div>
          <button type="button" onClick={onNewProject} className="md:hidden h-10 px-3 rounded-xl bg-accent text-white text-sm font-semibold inline-flex items-center gap-1.5 shrink-0">
            <Plus className="w-4 h-4" /> Nuevo
          </button>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide" data-no-swipe>
          {FILTERS.map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatus(f.id)}
              className={cn('h-9 px-3 rounded-full text-xs font-semibold whitespace-nowrap border shrink-0 transition-colors', status === f.id ? 'bg-accent/15 border-accent/60 text-accent' : 'border-border text-text-secondary hover:text-text-primary')}
            >
              {f.label} <span className="opacity-70">{counts[f.id]}</span>
            </button>
          ))}
          <select value={sort} onChange={e => setSort(e.target.value as any)} className="h-9 bg-surface-elevated border border-border rounded-xl px-2 text-xs font-semibold text-text-primary focus:outline-none shrink-0" aria-label="Ordenar">
            <option value="recent">Actividad reciente</option>
            <option value="name">Nombre</option>
            <option value="delivery">Fecha de entrega</option>
          </select>
          <div className="flex items-center bg-surface-elevated border border-border rounded-xl p-0.5 shrink-0">
            <button type="button" onClick={() => setViewMode('grid')} className={cn('w-8 h-8 flex items-center justify-center rounded-lg', viewMode === 'grid' ? 'bg-surface text-text-primary shadow-sm' : 'text-text-secondary')} aria-label="Cuadrícula"><LayoutGrid className="w-4 h-4" /></button>
            <button type="button" onClick={() => setViewMode('list')} className={cn('w-8 h-8 flex items-center justify-center rounded-lg', viewMode === 'list' ? 'bg-surface text-text-primary shadow-sm' : 'text-text-secondary')} aria-label="Lista"><List className="w-4 h-4" /></button>
          </div>
          <button type="button" onClick={onNewProject} className="hidden md:inline-flex h-9 px-3.5 rounded-xl bg-accent text-white text-sm font-semibold items-center gap-1.5 shrink-0 hover:bg-accent/90">
            <Plus className="w-4 h-4" /> Nuevo proyecto
          </button>
        </div>
      </div>

      {isLoading && local.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-44 rounded-2xl bg-surface-elevated border border-border animate-pulse" />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface-elevated/50 py-16 px-6 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-accent/10 text-accent flex items-center justify-center mb-3"><FolderOpen className="w-7 h-7" /></div>
          <p className="text-sm font-semibold text-text-primary">{query ? 'Ningún proyecto coincide' : status === 'active' ? 'No hay proyectos en curso' : 'No hay proyectos aquí'}</p>
          <p className="text-xs text-text-secondary mt-1 max-w-sm">Cada proyecto es una carpeta de {artistName} en Drive. Crea uno o arrastra archivos aquí para empezar.</p>
          <button type="button" onClick={onNewProject} className="mt-4 h-10 px-4 rounded-xl bg-accent text-white text-sm font-semibold inline-flex items-center gap-2"><Plus className="w-4 h-4" /> Nuevo proyecto</button>
        </div>
      ) : (
        <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3' : 'rounded-2xl border border-border bg-surface-elevated divide-y divide-border/50 overflow-hidden'}>
          {visible.map(project => {
            const s = stats.get(project.id);
            const matrix = matrixFor(project);
            const progress = matrix ? matrixProgress(matrix) : null;
            const projectCampaigns = campaignsFor(project);
            const TypeIcon = TYPE_ICON[project.type] || FolderOpen;
            const meta = PROJECT_STATUS_META[project.status || 'active'] || PROJECT_STATUS_META.active;
            const delivery = project.deliveryDate ? new Date(project.deliveryDate) : null;
            const overdue = delivery && (project.status || 'active') === 'active' && delivery.getTime() < Date.now() - 86_400_000;
            const soon = delivery && !overdue && (project.status || 'active') === 'active' && delivery.getTime() - Date.now() < 7 * 86_400_000;
            const isDrop = dropId === project.id;
            const statLine = s
              ? `${s.files} archivo${s.files === 1 ? '' : 's'}${s.audio ? ` · ${s.audio} audio${s.audio === 1 ? '' : 's'}` : ''} · ${formatBytes(s.bytes)}`
              : index.status === 'ready' ? 'Sin archivos' : null;

            const actions = (
              <div className="flex items-center gap-1 shrink-0">
                <Link
                  href={`/artists/${artistId}?tab=files&folderId=${project.id}`}
                  onClick={e => e.stopPropagation()}
                  className="w-9 h-9 flex items-center justify-center rounded-lg text-text-secondary hover:text-accent hover:bg-surface"
                  title="Ver en Archivos"
                  aria-label="Ver en Archivos"
                >
                  <Files className="w-4 h-4" />
                </Link>
                <button type="button" onClick={e => { e.preventDefault(); e.stopPropagation(); upload(project, []); }} className="w-9 h-9 flex items-center justify-center rounded-lg text-text-secondary hover:text-accent hover:bg-surface" title="Subir archivos" aria-label="Subir archivos">
                  <UploadCloud className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={e => { e.preventDefault(); e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); showMenu(r.right - 220, r.bottom + 4, menuFor(project)); }}
                  className="w-9 h-9 flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface"
                  aria-label="Más acciones"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
            );

            const badges = (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={cn('inline-flex items-center gap-1.5 h-6 px-2 rounded-full border text-[11px] font-semibold', meta.chip)}>
                  <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} /> {meta.label}
                </span>
                {delivery && (
                  <span className={cn('inline-flex items-center gap-1 h-6 px-2 rounded-full border text-[11px] font-medium',
                    overdue ? 'text-error bg-error/10 border-error/25' : soon ? 'text-warning bg-warning/10 border-warning/25' : 'text-text-secondary border-border')}>
                    {overdue ? <AlertTriangle className="w-3 h-3" /> : <CalendarClock className="w-3 h-3" />}
                    {delivery.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                  </span>
                )}
                {matrix && progress && (
                  <Link
                    href={`/artists/${artistId}?tab=matrices&matrixId=${matrix.id}`}
                    onClick={e => e.stopPropagation()}
                    className="inline-flex items-center gap-1 h-6 px-2 rounded-full border border-border text-[11px] font-medium text-text-secondary hover:text-accent hover:border-accent/40"
                    title={`Matriz: ${matrix.name}`}
                  >
                    <Table2 className="w-3 h-3" /> {progress.percent}%
                  </Link>
                )}
                {projectCampaigns.slice(0, 2).map(c => (
                  <span key={c.id} className="inline-flex items-center gap-1 h-6 px-2 rounded-full border border-border text-[11px] font-medium text-text-secondary" title={`Campaña: ${c.name}`}>
                    <span>{c.emoji || '🎯'}</span><span className="max-w-[90px] truncate">{c.name}</span>
                  </span>
                ))}
              </div>
            );

            if (viewMode === 'list') {
              return (
                <div
                  key={project.id}
                  {...dropProps(project)}
                  onClick={() => router.push(`/projects/${project.id}`)}
                  onContextMenu={e => { e.preventDefault(); showMenu(e.clientX, e.clientY, menuFor(project)); }}
                  className={cn('group flex items-center gap-3 px-3 md:px-4 py-3 cursor-pointer transition-colors', isDrop ? 'bg-accent/15 ring-2 ring-inset ring-accent' : 'hover:bg-surface/70', isDraggingFiles && !isDrop && 'ring-1 ring-inset ring-accent/20')}
                >
                  <span className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center shrink-0"><TypeIcon className="w-5 h-5" /></span>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-sm font-semibold text-text-primary truncate">{project.title}</p>
                      <span className="text-[10px] uppercase tracking-widest text-text-secondary shrink-0">{PROJECT_TYPE_LABELS[project.type] || 'Proyecto'}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {badges}
                      {statLine && <span className="text-[11px] text-text-secondary">{statLine}</span>}
                    </div>
                  </div>
                  {actions}
                </div>
              );
            }

            return (
              <div
                key={project.id}
                {...dropProps(project)}
                onClick={() => router.push(`/projects/${project.id}`)}
                onContextMenu={e => { e.preventDefault(); showMenu(e.clientX, e.clientY, menuFor(project)); }}
                className={cn(
                  'group relative flex flex-col rounded-2xl border bg-surface-elevated p-4 cursor-pointer transition-all hover:border-accent/40 hover:shadow-lg hover:shadow-accent/5',
                  isDrop ? 'border-accent ring-2 ring-accent/40 bg-accent/5 scale-[1.01]' : isDraggingFiles ? 'border-dashed border-accent/40' : 'border-border',
                )}
              >
                <div className="flex items-start gap-3">
                  <span className="w-11 h-11 rounded-xl bg-accent/10 text-accent flex items-center justify-center shrink-0"><TypeIcon className="w-5 h-5" /></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase tracking-widest font-bold text-text-secondary">{PROJECT_TYPE_LABELS[project.type] || 'Proyecto'}</p>
                    <h4 className="text-base font-bold text-text-primary truncate group-hover:text-accent transition-colors" title={project.title}>{project.title}</h4>
                  </div>
                  <div className="-mr-2 -mt-1">{actions}</div>
                </div>

                <div className="mt-3">{badges}</div>

                {progress && progress.total > 0 && (
                  <div className="mt-3 h-1.5 rounded-full bg-surface overflow-hidden" title={`${progress.done}/${progress.total} tareas de la matriz`}>
                    <div className="h-full rounded-full bg-gradient-to-r from-accent to-accent-light" style={{ width: `${progress.percent}%` }} />
                  </div>
                )}

                <div className="mt-auto pt-3 flex items-center justify-between gap-2 text-[11px] text-text-secondary">
                  <span className="inline-flex items-center gap-1.5 min-w-0 truncate">
                    {statLine ? <><AudioWaveform className="w-3.5 h-3.5 shrink-0" />{statLine}</> : <><Loader2 className="w-3 h-3 animate-spin" /> Contando archivos…</>}
                  </span>
                  {s?.lastModified && <span className="shrink-0">{formatRelativeTime(s.lastModified)}</span>}
                </div>

                {isDrop && (
                  <div className="pointer-events-none absolute inset-0 rounded-2xl flex items-center justify-center bg-accent/10 backdrop-blur-[1px]">
                    <span className="px-3 py-1.5 rounded-full bg-accent text-white text-xs font-bold shadow-lg inline-flex items-center gap-1.5"><UploadCloud className="w-3.5 h-3.5" /> Subir a {project.title}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {campaigns.length === 0 && local.length > 1 && (
        <p className="text-[11px] text-text-secondary flex items-center gap-1.5"><Target className="w-3.5 h-3.5" /> Agrupa proyectos relacionados en una campaña desde la pestaña Campañas.</p>
      )}

      <EditProjectModal
        project={editing}
        onClose={() => setEditing(null)}
        onSaved={saved => { patchLocal(saved.id, saved); loadIndex(artistId, { force: true }); }}
      />
    </div>
  );
}
