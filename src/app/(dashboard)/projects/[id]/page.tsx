'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft, ChevronRight, Edit3, UploadCloud, HardDrive, Table2, X, ExternalLink, CalendarClock, Lock,
  AlertTriangle, MoreHorizontal, Plus, Clock, Disc, Disc3, Library, Sparkles, FolderOpen,
} from 'lucide-react';
import { ProductionGridBoard } from '@/components/projects/ProductionGrid';
import { TimeTrackerWidget } from '@/components/projects/TimeTrackerWidget';
import { FileExplorer } from '@/components/explorer/FileExplorer';
import { EditProjectModal, PROJECT_STATUS_META, saveProject } from '@/components/projects/EditProjectModal';
import { useIndex, loadIndex } from '@/components/explorer/driveStore';
import { formatBytes } from '@/components/explorer/fileKinds';
import { useContextMenu } from '@/lib/contexts/ContextMenuContext';
import { useDropContext, useGlobalDragDrop } from '@/lib/contexts/GlobalDragDropContext';
import { useAppData } from '@/lib/contexts/AppDataContext';
import { customConfirm, customPrompt } from '@/lib/dialog';
import { PROJECT_TYPE_LABELS } from '@/lib/constants';
import { matrixProgress } from '@/lib/matrixStats';
import { cn } from '@/lib/utils';
import type { Project, ProjectStatus } from '@/types';

const TYPE_ICON: Record<string, React.ElementType> = { single: Disc, ep: Disc3, album: Library, free: Sparkles };

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const { showMenu } = useContextMenu();
  const { openSmartUpload } = useGlobalDragDrop();
  const { artists } = useAppData();

  const [project, setProject] = useState<Project | null>(null);
  const [matrix, setMatrix] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);

  const fetchProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(res.status === 404 ? 'Este proyecto ya no existe o se movió a la papelera' : (data.error || 'No se pudo cargar el proyecto'));
      setProject({ ...data.project, id: projectId, driveFolderId: projectId });
      let linked = data.linkedMatrix || null;
      if (!linked && data.project?.artistId) {
        const mres = await fetch(`/api/artists/${data.project.artistId}/matrices`);
        if (mres.ok) {
          const mdata = await mres.json();
          linked = (mdata.matrices || []).find((m: any) => m.projectId === projectId) || null;
        }
      }
      setMatrix(linked);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    setIsLoading(true);
    setProject(null);
    setMatrix(null);
    fetchProject();
  }, [fetchProject]);

  const artist = artists.find(a => a.id === project?.artistId);
  const index = useIndex(projectId, !!project);

  useDropContext(project ? {
    mode: 'artist',
    artistId: project.artistId,
    projectId,
    label: `Subir a ${project.title}`,
    hint: 'Suéltalo sobre una carpeta para elegir el destino exacto',
    onFinished: () => loadIndex(projectId, { force: true }),
  } : null);

  const stats = useMemo(() => {
    const files = index.items.filter(i => !i.isFolder);
    return { ready: index.status === 'ready' || files.length > 0, files: files.length, audio: files.filter(f => f.kind === 'audio').length, bytes: files.reduce((s, f) => s + (f.size || 0), 0) };
  }, [index.items, index.status]);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="h-8 w-56 rounded-lg bg-surface-elevated animate-pulse" />
        <div className="h-36 rounded-2xl bg-surface-elevated border border-border animate-pulse" />
        <div className="h-[420px] rounded-2xl bg-surface-elevated border border-border animate-pulse" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="rounded-2xl border border-error/20 bg-surface-elevated p-10 text-center max-w-lg mx-auto mt-10">
        <AlertTriangle className="w-12 h-12 text-error mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">No se pudo abrir el proyecto</h2>
        <p className="text-text-secondary text-sm mb-6">{error}</p>
        <button type="button" onClick={() => router.back()} className="h-10 px-4 rounded-xl bg-accent text-white text-sm font-semibold">Volver</button>
      </div>
    );
  }

  const status = project.status || 'active';
  const meta = PROJECT_STATUS_META[status] || PROJECT_STATUS_META.active;
  const TypeIcon = TYPE_ICON[project.type] || FolderOpen;
  const progress = matrix ? matrixProgress(matrix) : null;
  const delivery = project.deliveryDate ? new Date(project.deliveryDate) : null;
  const overdue = delivery && status === 'active' && delivery.getTime() < Date.now() - 86_400_000;
  const artistHref = `/artists/${project.artistId}?tab=projects`;

  const changeStatus = async (next: ProjectStatus) => {
    const prev = project.status;
    setProject(p => (p ? { ...p, status: next } : p));
    try {
      await saveProject(projectId, { status: next });
      toast.success(`Proyecto ${PROJECT_STATUS_META[next].label.toLowerCase()}`);
    } catch (err: any) {
      setProject(p => (p ? { ...p, status: prev } : p));
      toast.error(err.message);
    }
  };

  const createMatrix = async () => {
    const name = (await customPrompt('Nombre de la matriz', project.title, 'Nueva matriz'))?.trim();
    if (!name) return;
    const t = toast.loading('Creando matriz…');
    try {
      const res = await fetch(`/api/artists/${project.artistId}/matrices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, projectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      setMatrix(data.matrix);
      setMatrixOpen(true);
      toast.success('Matriz creada', { id: t });
    } catch (err: any) {
      toast.error(`No se pudo crear la matriz: ${err.message}`, { id: t });
    }
  };

  const trashProject = async () => {
    if (!await customConfirm(`"${project.title}" y todos sus archivos se moverán a la papelera de Google Drive.`, 'Eliminar proyecto')) return;
    const t = toast.loading('Eliminando…');
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('No se pudo eliminar el proyecto');
      toast.success('Proyecto movido a la papelera', { id: t });
      loadIndex(project.artistId, { force: true });
      router.push(artistHref);
    } catch (err: any) {
      toast.error(err.message, { id: t });
    }
  };

  const moreMenu = (x: number, y: number) => showMenu(x, y, [
    { heading: project.title },
    { label: 'Editar proyecto', icon: 'Edit3', action: () => setEditing(true) },
    ...(Object.keys(PROJECT_STATUS_META) as ProjectStatus[]).filter(s => s !== status).map(s => ({
      label: `Marcar como ${PROJECT_STATUS_META[s].label.toLowerCase()}`,
      icon: s === 'completed' ? 'CheckCircle2' : s === 'archived' ? 'Paperclip' : 'RotateCcw',
      action: () => changeStatus(s),
    })),
    { separator: true },
    matrix ? { label: 'Abrir matriz', icon: 'Table2', action: () => setMatrixOpen(true) } : { label: 'Crear matriz vinculada', icon: 'Table2', action: createMatrix },
    { label: 'Registro de tiempo', icon: 'Clock', action: () => setTimeOpen(true) },
    { label: 'Ver en el perfil del artista', icon: 'User', action: () => router.push(`/artists/${project.artistId}?tab=files&folderId=${projectId}`) },
    { label: 'Abrir en Google Drive', icon: 'HardDrive', action: () => window.open(project.driveUrl || `https://drive.google.com/drive/folders/${projectId}`, '_blank', 'noopener') },
    { separator: true },
    { label: 'Eliminar proyecto', icon: 'Trash2', variant: 'danger', action: trashProject },
  ]);

  return (
    <div className="space-y-5 md:space-y-6 animate-fade-in">
      <nav className="flex items-center gap-1.5 text-sm min-w-0">
        <Link href={artistHref} className="inline-flex items-center gap-1.5 h-9 pr-1 text-text-secondary hover:text-text-primary shrink-0">
          <ArrowLeft className="w-4 h-4" /> <span className="truncate max-w-[40vw]">{artist?.name || 'Artista'}</span>
        </Link>
        <ChevronRight className="w-4 h-4 text-text-secondary/50 shrink-0" />
        <span className="font-semibold text-text-primary truncate">{project.title}</span>
      </nav>

      <section className="relative overflow-hidden rounded-2xl border border-border bg-surface-elevated p-4 md:p-6">
        <div className="absolute -top-24 -right-16 w-72 h-72 rounded-full bg-accent/10 blur-[80px] pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center gap-5">
          <div className="flex items-start gap-4 min-w-0 flex-1">
            <span className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-accent/15 text-accent flex items-center justify-center shrink-0"><TypeIcon className="w-7 h-7" /></span>
            <div className="min-w-0 space-y-2">
              <p className="text-[11px] uppercase tracking-widest font-bold text-text-secondary">{PROJECT_TYPE_LABELS[project.type] || 'Proyecto'}</p>
              <h1 className="text-2xl md:text-3xl font-black text-text-primary tracking-tight break-words">{project.title}</h1>
              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" onClick={e => { const r = e.currentTarget.getBoundingClientRect(); showMenu(r.left, r.bottom + 4, (Object.keys(PROJECT_STATUS_META) as ProjectStatus[]).map(s => ({ label: PROJECT_STATUS_META[s].label, checked: s === status, action: () => s !== status && changeStatus(s) }))); }} className={cn('inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-xs font-semibold', meta.chip)}>
                  <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} /> {meta.label}
                </button>
                {delivery && (
                  <span className={cn('inline-flex items-center gap-1 h-7 px-2.5 rounded-full border text-xs font-medium', overdue ? 'text-error bg-error/10 border-error/25' : 'text-text-secondary border-border')}>
                    {overdue ? <AlertTriangle className="w-3.5 h-3.5" /> : <CalendarClock className="w-3.5 h-3.5" />}
                    Entrega {delivery.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                )}
                {project.releaseDate && (
                  <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-border text-xs font-medium text-text-secondary">
                    Lanzamiento {new Date(project.releaseDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                )}
                {project.requirePaymentForDownload && (
                  <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-warning/30 bg-warning/10 text-xs font-medium text-warning" title="Las descargas del portal se bloquean mientras haya pagos pendientes">
                    <Lock className="w-3.5 h-3.5" /> Descargas protegidas
                  </span>
                )}
              </div>
              {project.notes && <p className="text-sm text-text-secondary whitespace-pre-line line-clamp-3 max-w-2xl">{project.notes}</p>}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 lg:w-[340px] shrink-0">
            <div className="rounded-xl bg-surface border border-border px-3 py-2.5">
              <p className="text-lg font-black text-text-primary leading-none">{stats.ready ? stats.files : '…'}</p>
              <p className="text-[10px] uppercase tracking-widest font-bold text-text-secondary mt-1">Archivos</p>
            </div>
            <div className="rounded-xl bg-surface border border-border px-3 py-2.5">
              <p className="text-lg font-black text-text-primary leading-none truncate">{stats.ready ? formatBytes(stats.bytes) : '…'}</p>
              <p className="text-[10px] uppercase tracking-widest font-bold text-text-secondary mt-1">Tamaño</p>
            </div>
            <button type="button" onClick={() => (matrix ? setMatrixOpen(true) : createMatrix())} className="rounded-xl bg-surface border border-border px-3 py-2.5 text-left hover:border-accent/40">
              <p className="text-lg font-black text-text-primary leading-none">{progress ? `${progress.percent}%` : '—'}</p>
              <p className="text-[10px] uppercase tracking-widest font-bold text-text-secondary mt-1">{matrix ? 'Matriz' : 'Crear matriz'}</p>
            </button>
          </div>
        </div>

        {progress && progress.total > 0 && (
          <div className="relative mt-4 h-1.5 rounded-full bg-surface overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-accent to-accent-light" style={{ width: `${progress.percent}%` }} />
          </div>
        )}

        <div className="relative flex items-center gap-2 mt-5 overflow-x-auto scrollbar-hide -mx-1 px-1" data-no-swipe>
          <button type="button" onClick={() => openSmartUpload({ files: [], targetType: 'artist', artistId: project.artistId, projectId, onFinished: () => loadIndex(projectId, { force: true }) })} className="h-10 px-4 rounded-xl bg-accent text-white text-sm font-semibold inline-flex items-center gap-2 shrink-0 hover:bg-accent/90">
            <UploadCloud className="w-4 h-4" /> Subir
          </button>
          <button type="button" onClick={() => setEditing(true)} className="h-10 px-3.5 rounded-xl border border-border text-sm font-medium inline-flex items-center gap-2 shrink-0 hover:bg-surface">
            <Edit3 className="w-4 h-4" /> Editar
          </button>
          {matrix ? (
            <button type="button" onClick={() => setMatrixOpen(true)} className="h-10 px-3.5 rounded-xl border border-border text-sm font-medium inline-flex items-center gap-2 shrink-0 hover:bg-surface">
              <Table2 className="w-4 h-4 text-accent" /> Matriz
            </button>
          ) : (
            <button type="button" onClick={createMatrix} className="h-10 px-3.5 rounded-xl border border-dashed border-border text-sm font-medium inline-flex items-center gap-2 shrink-0 hover:bg-surface text-text-secondary">
              <Plus className="w-4 h-4" /> Matriz
            </button>
          )}
          <button type="button" onClick={() => setTimeOpen(true)} className="h-10 px-3.5 rounded-xl border border-border text-sm font-medium inline-flex items-center gap-2 shrink-0 hover:bg-surface">
            <Clock className="w-4 h-4" /> Tiempo
          </button>
          <a href={project.driveUrl || `https://drive.google.com/drive/folders/${projectId}`} target="_blank" rel="noopener noreferrer" className="hidden md:inline-flex h-10 px-3.5 rounded-xl border border-border text-sm font-medium items-center gap-2 shrink-0 hover:bg-surface">
            <HardDrive className="w-4 h-4" /> Drive
          </a>
          <button type="button" onClick={e => { const r = e.currentTarget.getBoundingClientRect(); moreMenu(r.right - 230, r.bottom + 6); }} className="h-10 w-10 rounded-xl border border-border inline-flex items-center justify-center shrink-0 hover:bg-surface ml-auto" aria-label="Más acciones">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </section>

      <FileExplorer
        rootId={projectId}
        rootName={project.title}
        scope={{ type: 'artist', artistId: project.artistId, artistEmail: artist?.email || undefined }}
      />

      <EditProjectModal project={editing ? project : null} onClose={() => setEditing(false)} onSaved={saved => setProject(p => (p ? { ...p, ...saved } : p))} />

      {timeOpen && (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center md:p-6" role="dialog" aria-modal="true" aria-label="Registro de tiempo">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setTimeOpen(false)} />
          <div className="relative w-full md:max-w-md bg-surface-elevated border-t md:border border-border rounded-t-[28px] md:rounded-2xl shadow-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] animate-slide-up">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold">Registro de tiempo</h3>
              <button type="button" onClick={() => setTimeOpen(false)} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-surface" aria-label="Cerrar"><X className="w-5 h-5" /></button>
            </div>
            <TimeTrackerWidget projectId={projectId} />
          </div>
        </div>
      )}

      {matrixOpen && matrix && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 md:p-6" role="dialog" aria-modal="true" aria-label="Matriz del proyecto">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={() => { setMatrixOpen(false); fetchProject(); }} />
          <div className="relative w-full max-w-6xl max-h-[92dvh] flex flex-col rounded-2xl border border-border bg-surface-elevated shadow-2xl animate-scale-in">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 shrink-0">
              <Table2 className="w-5 h-5 text-accent shrink-0" />
              <h3 className="font-bold text-text-primary truncate flex-1">{matrix.name}</h3>
              <Link href={`/artists/${project.artistId}?tab=matrices&matrixId=${matrix.id}`} className="h-9 px-3 rounded-lg text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface inline-flex items-center gap-1.5">
                <ExternalLink className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Abrir en matrices</span>
              </Link>
              <button type="button" onClick={() => { setMatrixOpen(false); fetchProject(); }} className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-surface" aria-label="Cerrar"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-3 md:p-5">
              <ProductionGridBoard
                artistId={project.artistId}
                matrixId={matrix.id}
                matrixName={matrix.name}
                artistName={artist?.name}
                initialGrid={matrix.productionGrid}
                initialProjectId={projectId}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
