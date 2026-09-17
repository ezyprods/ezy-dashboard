'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  Loader2, Music, CheckCircle2, Circle, CreditCard, AlertCircle, Sparkles, Disc, Play, Pause,
  ChevronRight, Lock, Download, ExternalLink, Clock, TrendingUp, ListMusic, Eye, Wrench, RefreshCw, Search, X,
  FolderOpen, Home, Files, FileText, FileImage, Film, FolderArchive, File as FileIcon, ChevronDown, ChevronUp,
  Scissors, Tags, Activity, Layers, Table2,
} from 'lucide-react';
import { MusicDownloader } from '@/components/tools/MusicDownloader';
import { AudioConverter } from '@/components/tools/AudioConverter';
import { AudioTrimmer } from '@/components/tools/AudioTrimmer';
import { TagEditor } from '@/components/tools/TagEditor';
import { BpmKeyDetector } from '@/components/tools/BpmKeyDetector';
import { StemsSplitter } from '@/components/tools/StemsSplitter';
import { PortalReleasePlayer } from '@/components/releases/PortalReleasePlayer';
import { RealtimeCountdown } from '@/components/ui/RealtimeCountdown';
import { useAudioControls } from '@/lib/contexts/AudioContext';
import { PORTAL_TOOLS, type PortalToolId } from '@/types/portal';
import { cn, getCoverArtUrl, formatRelativeTime, triggerFileDownload } from '@/lib/utils';

const TOOL_ICONS: Record<string, React.ElementType> = { Download, RefreshCw, Scissors, Tags, Activity, Layers };

type Section = 'home' | 'files' | 'releases' | 'tools';
type FileFilter = 'all' | 'audio' | 'other';

const AUDIO_RE = /\.(wav|mp3|m4a|flac|aiff?|ogg|opus|aac)$/i;
const isAudio = (f: any) => (f.mimeType || '').startsWith('audio/') || AUDIO_RE.test(f.name || '');
const stripExt = (n: string) => n.replace(/\.[^.]+$/, '');

function formatSize(bytes?: string | number) {
  const n = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
  if (!n || isNaN(n)) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(i >= 2 ? 1 : 0)} ${units[i]}`;
}

function fileIcon(file: any) {
  const name = (file.name || '').toLowerCase();
  const mime = file.mimeType || '';
  if (mime.startsWith('image/')) return { Icon: FileImage, cls: 'text-emerald-400 bg-emerald-500/10' };
  if (mime.startsWith('video/')) return { Icon: Film, cls: 'text-rose-400 bg-rose-500/10' };
  if (mime.includes('pdf') || /\.(pdf|docx?|txt)$/.test(name)) return { Icon: FileText, cls: 'text-orange-400 bg-orange-500/10' };
  if (/\.(zip|rar|7z)$/.test(name)) return { Icon: FolderArchive, cls: 'text-amber-400 bg-amber-500/10' };
  return { Icon: FileIcon, cls: 'text-text-secondary bg-surface' };
}

export default function PortalPage() {
  const params = useParams();
  const artistId = params.id as string;
  const { currentTrack, isPlaying, playTrack } = useAudioControls();

  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [section, setSection] = useState<Section>('home');
  const [projectId, setProjectId] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FileFilter>('all');
  const [openReleaseId, setOpenReleaseId] = useState<string | null>(null);
  const [activeToolId, setActiveToolId] = useState<PortalToolId>('downloader');
  const [expandedMatrix, setExpandedMatrix] = useState<string | null>(null);

  const fetchPortal = useCallback(async (silent = false) => {
    if (silent) setIsRefreshing(true);
    try {
      const res = await fetch(`/api/portal/${artistId}`, { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const json = await res.json();
      setData(json);
      setFailed(false);
      if (json.artist?.name) document.title = `${json.artist.name} · Portal`;
      setOpenReleaseId(prev => (prev && json.releases?.some((r: any) => r.id === prev) ? prev : null));
      setProjectId(prev => (json.projects?.some((p: any) => p.id === prev) ? prev : 'all'));
    } catch {
      if (!silent) setFailed(true);
      else toast.error('No se pudo actualizar');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [artistId]);

  useEffect(() => { fetchPortal(); }, [fetchPortal]);

  const config = data?.config || {};
  const modules: any[] = useMemo(() => (config.modules || []).filter((m: any) => m.isVisible !== false).sort((a: any, b: any) => a.order - b.order), [config.modules]);
  const moduleOf = (type: string) => modules.find(m => m.type === type);
  const allowedTools: PortalToolId[] = Array.isArray(config.allowedTools) ? config.allowedTools : (config.enableTools ? PORTAL_TOOLS.map(t => t.id) : []);
  const toolsEnabled = !!config.enableTools && allowedTools.length > 0;

  useEffect(() => {
    if (allowedTools.length && !allowedTools.includes(activeToolId)) setActiveToolId(allowedTools[0]);
  }, [allowedTools, activeToolId]);

  const projects: any[] = data?.projects || [];
  const realProjects = projects.filter(p => p.id !== 'all' && p.id !== 'general');
  const allFiles: any[] = projects.find(p => p.id === 'all')?.files || [];
  const pending = data?.finances?.pendingPayment || 0;
  const projectById = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);

  const isLocked = (file: any) => {
    const p = file.projectId ? projectById.get(file.projectId) : null;
    return !!(p?.requirePaymentForDownload && pending > 0);
  };

  const currentProject = projectById.get(projectId) || projects[0];
  const visibleFiles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (currentProject?.files || []).filter((f: any) =>
      (filter === 'all' || (filter === 'audio' ? isAudio(f) : !isAudio(f))) && (!q || (f.name || '').toLowerCase().includes(q)));
  }, [currentProject, query, filter]);

  const play = (file: any) => {
    playTrack({
      id: file.id,
      name: stripExt(file.name),
      url: `/api/audio/${file.id}`,
      artistName: data?.artist?.name,
      bpm: file.bpm,
      musicalKey: file.key,
      pathSegments: [{ name: data?.artist?.name || 'Portal' }, ...(file.parentFolderName ? [{ name: file.parentFolderName }] : [])],
    });
  };

  const handleDownloadRelease = (release: any) => {
    const tracks = release?.tracks || [];
    if (tracks.length === 0) {
      toast.error('No hay canciones para descargar');
      return;
    }
    toast.success(tracks.length === 1 ? `Descargando ${tracks[0].title || release.title}...` : `Descargando ${tracks.length} canciones...`);
    tracks.forEach((track: any, idx: number) => {
      const fileId = track.newFileId || track.originalFileId;
      if (fileId) {
        setTimeout(() => {
          triggerFileDownload(fileId, track.title);
        }, idx * 600);
      }
    });
  };

  // ─── States ─────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto">
            <Sparkles className="w-8 h-8 text-accent animate-pulse" />
          </div>
          <p className="text-xs text-text-secondary font-semibold tracking-widest uppercase">Cargando tu portal…</p>
        </div>
      </div>
    );
  }

  if (failed || !data) {
    return (
      <div className="min-h-[100dvh] bg-background text-text-primary flex items-center justify-center p-6">
        <div className="max-w-md w-full p-8 rounded-2xl border border-border bg-surface-elevated text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-error mx-auto" />
          <h1 className="text-2xl font-bold">Portal no disponible</h1>
          <p className="text-text-secondary text-sm">El enlace no es válido o el portal no está configurado. Si crees que es un error, contacta con tu productor.</p>
          <button type="button" onClick={() => { setIsLoading(true); fetchPortal(); }} className="h-10 px-4 rounded-xl border border-border text-sm hover:bg-surface">Reintentar</button>
        </div>
      </div>
    );
  }

  const weekAgo = Date.now() - 7 * 86_400_000;
  const newThisWeek = allFiles.filter(f => (f.effectiveDate || 0) > weekAgo).length;
  const sharedMatrices: any[] = data.sharedMatrices || [];
  const activeMatrices = sharedMatrices.filter(m => m.stats?.total > 0 && m.stats.done < m.stats.total);
  const avgProgress = activeMatrices.length ? Math.round(activeMatrices.reduce((s, m) => s + m.stats.percent, 0) / activeMatrices.length) : null;

  const navItems: { key: Section; label: string; icon: React.ElementType; show: boolean }[] = [
    { key: 'home', label: 'Inicio', icon: Home, show: true },
    { key: 'files', label: 'Archivos', icon: Files, show: !!moduleOf('bounces') },
    { key: 'releases', label: 'Previews', icon: ListMusic, show: !!moduleOf('releases') && data.releases?.length > 0 },
    { key: 'tools', label: 'Herramientas', icon: Wrench, show: toolsEnabled },
  ];

  const openProjectFiles = (id: string) => {
    setProjectId(id);
    setQuery('');
    setFilter('all');
    setSection('files');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ─── Pieces ─────────────────────────────────────────────────────────────
  const FileRow = ({ file, showProject }: { file: any; showProject?: boolean }) => {
    const audio = isAudio(file);
    const active = currentTrack?.id === file.id;
    const playing = active && isPlaying;
    const locked = isLocked(file);
    const { Icon, cls } = fileIcon(file);
    const date = file.effectiveDate ? new Date(file.effectiveDate) : null;
    return (
      <div className={cn('group flex items-center gap-3 px-3 md:px-4 py-2.5 transition-colors', active ? 'bg-accent/5' : 'hover:bg-surface/60')}>
        {audio ? (
          <button type="button" onClick={() => play(file)} className={cn('w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all cursor-pointer', active ? 'bg-accent text-white shadow-md shadow-accent/30' : 'bg-violet-500/10 text-violet-400 hover:bg-accent hover:text-white')} aria-label={playing ? 'Pausar' : 'Reproducir'}>
            {playing ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current translate-x-px" />}
          </button>
        ) : (
          <span className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', cls)}><Icon className="w-5 h-5" /></span>
        )}
        <div 
          onClick={audio ? () => play(file) : undefined}
          className={cn('flex-1 min-w-0 select-none', audio && 'cursor-pointer')}
        >
          <p className={cn('text-sm font-medium truncate transition-colors', active ? 'text-accent font-semibold' : 'text-text-primary', audio && 'hover:text-accent')} title={file.name}>{audio ? stripExt(file.name) : file.name}</p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-text-secondary">
            {date && <span>{formatRelativeTime(date.toISOString())}</span>}
            {file.size && <span>· {formatSize(file.size)}</span>}
            {file.bpm && <span className="font-mono font-bold text-amber-400">{file.bpm} BPM</span>}
            {file.key && <span className="font-mono font-bold text-violet-400">{file.key}</span>}
            {showProject && file.parentFolderName && <span className="truncate max-w-[180px]">· {file.parentFolderName}</span>}
            {file.expiresAt && <RealtimeCountdown expiresAt={file.expiresAt} />}
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {!audio && !locked && (
            <a href={`/api/files/${file.id}?inline=true`} target="_blank" rel="noopener noreferrer" className="hidden sm:flex w-9 h-9 rounded-lg items-center justify-center text-text-secondary hover:text-accent hover:bg-surface" title="Ver" aria-label="Ver"><Eye className="w-4 h-4" /></a>
          )}
          {locked ? (
            <span className="w-9 h-9 rounded-lg flex items-center justify-center text-warning" title="Descarga disponible cuando el pago esté completado"><Lock className="w-4 h-4" /></span>
          ) : (
            <button 
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                triggerFileDownload(file.id, file.name);
              }}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-text-secondary hover:text-accent hover:bg-surface cursor-pointer" 
              title="Descargar" 
              aria-label="Descargar"
            >
              <Download className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  };

  const statusIcon = (status: string) => status === 'done' ? <CheckCircle2 className="w-3.5 h-3.5 text-success" /> : status === 'in_progress' ? <Clock className="w-3.5 h-3.5 text-accent" /> : status === 'review' ? <Eye className="w-3.5 h-3.5 text-warning" /> : <Circle className="w-3.5 h-3.5 text-text-secondary/50" />;
  const statusLabel: Record<string, string> = { todo: 'Pendiente', in_progress: 'En progreso', review: 'Revisión', done: 'Hecho' };

  const renderHomeModule = (mod: any) => {
    if (mod.type === 'bounces') {
      const latest = allFiles.slice(0, 8);
      return (
        <section key={mod.id} className="rounded-2xl border border-border bg-surface-elevated overflow-hidden">
          <div className="flex items-center gap-2 px-4 md:px-5 h-14 border-b border-border/60">
            <Music className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-bold flex-1 truncate">{mod.title || 'Últimas mezclas y archivos'}</h2>
            <button type="button" onClick={() => openProjectFiles('all')} className="text-xs font-semibold text-accent inline-flex items-center gap-0.5">Ver todo <ChevronRight className="w-3.5 h-3.5" /></button>
          </div>
          {latest.length === 0 ? (
            <p className="text-sm text-text-secondary text-center py-10">Todavía no hay archivos. Tu productor los subirá aquí.</p>
          ) : (
            <div className="divide-y divide-border/40">{latest.map(f => <FileRow key={f.id} file={f} showProject />)}</div>
          )}
          {realProjects.length > 0 && (
            <div className="border-t border-border/60 p-3 md:p-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-text-secondary mb-2 px-1">Proyectos</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {projects.filter(p => p.id !== 'all').map(p => (
                  <button key={p.id} type="button" onClick={() => openProjectFiles(p.id)} className="text-left rounded-xl border border-border bg-surface/40 hover:border-accent/40 hover:bg-surface p-3 transition-colors">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="w-4 h-4 text-accent shrink-0" />
                      <span className="text-sm font-semibold text-text-primary truncate flex-1">{p.title}</span>
                      {p.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-success shrink-0" />}
                    </div>
                    <p className="text-[11px] text-text-secondary mt-1">{p.files.length} archivo{p.files.length === 1 ? '' : 's'}{p.lastActivity ? ` · ${formatRelativeTime(new Date(p.lastActivity).toISOString())}` : ''}</p>
                    {typeof p.progress === 'number' && (
                      <div className="mt-2 h-1.5 rounded-full bg-surface overflow-hidden"><div className="h-full bg-accent rounded-full" style={{ width: `${p.progress}%` }} /></div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      );
    }

    if (mod.type === 'tasks') {
      if (sharedMatrices.length === 0) return null;
      return (
        <section key={mod.id} className="rounded-2xl border border-border bg-surface-elevated overflow-hidden">
          <div className="flex items-center gap-2 px-4 md:px-5 h-14 border-b border-border/60">
            <TrendingUp className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-bold flex-1 truncate">{mod.title || 'Estado del trabajo'}</h2>
          </div>
          <div className="divide-y divide-border/50">
            {sharedMatrices.map(m => {
              const open = expandedMatrix === m.id;
              const cols = m.productionGrid?.columns || [];
              const rows = m.productionGrid?.rows || [];
              return (
                <div key={m.id}>
                  <button type="button" onClick={() => setExpandedMatrix(open ? null : m.id)} className="w-full flex items-center gap-3 px-4 md:px-5 py-3 text-left hover:bg-surface/50">
                    <span className="w-9 h-9 rounded-xl bg-accent/10 text-accent flex items-center justify-center shrink-0"><Table2 className="w-4 h-4" /></span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-text-primary truncate">{m.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1.5 rounded-full bg-surface overflow-hidden"><div className={cn('h-full rounded-full', m.stats.percent === 100 ? 'bg-success' : 'bg-accent')} style={{ width: `${m.stats.percent}%` }} /></div>
                        <span className="text-xs font-bold text-text-primary w-10 text-right">{m.stats.percent}%</span>
                      </div>
                    </div>
                    <ChevronDown className={cn('w-4 h-4 text-text-secondary transition-transform shrink-0', open && 'rotate-180')} />
                  </button>
                  {open && (
                    <div className="px-2 md:px-4 pb-4 animate-fade-in">
                      {/* Phone: one card per song */}
                      <div className="md:hidden space-y-2">
                        {rows.map((row: any) => (
                          <div key={row.id} className="rounded-xl border border-border p-3">
                            <p className="text-sm font-semibold text-text-primary mb-2">{row.name}</p>
                            <div className="grid grid-cols-2 gap-1.5">
                              {cols.filter((c: any) => !c.type || c.type === 'status' || c.type === 'file').map((c: any) => {
                                const cell = row.cells?.[c.id] || {};
                                return (
                                  <div key={c.id} className="flex items-center gap-1.5 text-[11px] text-text-secondary min-w-0">
                                    {statusIcon(cell.status || 'todo')}<span className="truncate">{c.name}</span>
                                    {c.type === 'file' && cell.fileId && isAudio({ name: cell.fileName }) && (
                                      <button type="button" onClick={() => play({ id: cell.fileId, name: cell.fileName })} className="text-accent ml-auto" aria-label="Reproducir"><Play className="w-3 h-3" /></button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* Desktop: table */}
                      <div className="hidden md:block overflow-x-auto rounded-xl border border-border">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-surface/60 border-b border-border">
                              <th className="text-left font-semibold text-text-secondary p-2.5">Tema</th>
                              {cols.map((c: any) => <th key={c.id} className="text-left font-semibold text-text-secondary p-2.5 whitespace-nowrap">{c.name}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((row: any) => (
                              <tr key={row.id} className="border-b border-border/50 last:border-b-0">
                                <td className="p-2.5 font-semibold text-text-primary whitespace-nowrap">{row.name}</td>
                                {cols.map((c: any) => {
                                  const cell = row.cells?.[c.id] || {};
                                  const type = c.type || 'status';
                                  if (type === 'file') {
                                    return (
                                      <td key={c.id} className="p-2.5">
                                        {cell.fileId ? (
                                          <span className="inline-flex items-center gap-1.5 max-w-[180px]">
                                            {isAudio({ name: cell.fileName }) && <button type="button" onClick={() => play({ id: cell.fileId, name: cell.fileName })} className="text-accent shrink-0" aria-label="Reproducir"><Play className="w-3.5 h-3.5" /></button>}
                                            <span className="truncate" title={cell.fileName}>{cell.fileName}</span>
                                          </span>
                                        ) : <span className="text-text-secondary/40">—</span>}
                                      </td>
                                    );
                                  }
                                  if (type === 'checklist') {
                                    const list = cell.checklist || [];
                                    return <td key={c.id} className="p-2.5 text-text-secondary">{list.length ? `${list.filter((i: any) => i.done).length}/${list.length}` : '—'}</td>;
                                  }
                                  if (type === 'text') return <td key={c.id} className="p-2.5 text-text-primary max-w-[180px] truncate" title={cell.textValue || cell.notes}>{cell.textValue || cell.notes || <span className="text-text-secondary/40">—</span>}</td>;
                                  if (type === 'date') return <td key={c.id} className="p-2.5 text-text-secondary whitespace-nowrap">{cell.dueDate || '—'}</td>;
                                  return <td key={c.id} className="p-2.5"><span className="inline-flex items-center gap-1.5 whitespace-nowrap">{statusIcon(cell.status || 'todo')}{statusLabel[cell.status || 'todo']}</span></td>;
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      );
    }

    if (mod.type === 'releases') {
      if (!data.releases?.length) return null;
      return (
        <section key={mod.id} className="rounded-2xl border border-border bg-surface-elevated overflow-hidden">
          <div className="flex items-center gap-2 px-4 md:px-5 h-14 border-b border-border/60">
            <Disc className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-bold flex-1 truncate">{mod.title || 'Previews y lanzamientos'}</h2>
            <button type="button" onClick={() => setSection('releases')} className="text-xs font-semibold text-accent inline-flex items-center gap-0.5 hover:underline">
              Ver todo <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="divide-y divide-border/40">
            {data.releases.map((r: any) => {
              const isOpen = openReleaseId === r.id;
              return (
                <div key={r.id}>
                  <div className="flex items-center gap-3 px-4 md:px-5 py-3 hover:bg-surface/40 transition-colors">
                    <div 
                      onClick={() => setOpenReleaseId(isOpen ? null : r.id)}
                      className="w-11 h-11 rounded-xl overflow-hidden bg-surface border border-border flex items-center justify-center shrink-0 cursor-pointer"
                    >
                      {r.coverArtId ? (
                        <img src={getCoverArtUrl(r.coverArtId, 160)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Disc className="w-5 h-5 text-accent/50" />
                      )}
                    </div>
                    <div 
                      onClick={() => setOpenReleaseId(isOpen ? null : r.id)}
                      className="flex-1 min-w-0 cursor-pointer select-none"
                    >
                      <p className="text-sm font-semibold text-text-primary truncate hover:text-accent transition-colors">{r.title}</p>
                      <p className="text-[11px] text-text-secondary">{r.tracks?.length || 0} canciones · Escucha exclusiva</p>
                    </div>
                    {r.tracks && r.tracks.length > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDownloadRelease(r);
                        }}
                        className="h-8 px-2.5 md:px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 bg-surface border border-border/80 text-text-secondary hover:text-accent hover:border-accent/40 transition-all shrink-0 cursor-pointer"
                        title={r.tracks.length === 1 ? "Descargar audio" : "Descargar canciones"}
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Descargar</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setOpenReleaseId(isOpen ? null : r.id)}
                      className={cn(
                        "h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-all shrink-0 cursor-pointer",
                        isOpen
                          ? "bg-surface border border-border text-text-secondary hover:text-text-primary"
                          : "bg-accent/10 hover:bg-accent text-accent hover:text-white"
                      )}
                    >
                      {isOpen ? (
                        <>
                          <ChevronUp className="w-3.5 h-3.5" /> Cerrar
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-3.5 h-3.5" /> Abrir preview
                        </>
                      )}
                    </button>
                  </div>
                  {isOpen && (
                    <div className="p-4 md:p-5 border-t border-border/60 bg-surface/20 animate-fade-in">
                      <PortalReleasePlayer
                        release={r}
                        allowArtistEdit={moduleOf('releases')?.config?.allowArtistEdit}
                        bounces={allFiles}
                        portalToken={config.token}
                        artistId={artistId}
                        onReleaseUpdate={(updated: any) =>
                          setData((d: any) => ({
                            ...d,
                            releases: d.releases.map((rel: any) => (rel.id === updated.id ? updated : rel)),
                          }))
                        }
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      );
    }

    if (mod.type === 'finances') {
      const f = data.finances;
      if (!f || !f.totalBudget) return null;
      const pct = Math.min(100, Math.round((f.totalPaid / f.totalBudget) * 100));
      return (
        <section key={mod.id} className="rounded-2xl border border-border bg-surface-elevated p-4 md:p-5 space-y-3">
          <div className="flex items-center gap-2"><CreditCard className="w-4 h-4 text-accent" /><h2 className="text-sm font-bold flex-1">{mod.title || 'Resumen financiero'}</h2></div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-surface p-3"><p className="text-lg font-black">{f.totalBudget}€</p><p className="text-[11px] text-text-secondary">Presupuesto</p></div>
            <div className="rounded-xl bg-surface p-3"><p className="text-lg font-black text-success">{f.totalPaid}€</p><p className="text-[11px] text-text-secondary">Pagado</p></div>
            <div className="rounded-xl bg-surface p-3"><p className={cn('text-lg font-black', f.pendingPayment > 0 ? 'text-warning' : 'text-success')}>{f.pendingPayment}€</p><p className="text-[11px] text-text-secondary">Pendiente</p></div>
          </div>
          <div className="h-2 rounded-full bg-surface overflow-hidden"><div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} /></div>
        </section>
      );
    }
    return null;
  };

  return (
    <div className="min-h-[100dvh] bg-background text-text-primary antialiased selection:bg-accent/30">
      <div className="fixed inset-x-0 top-0 h-80 bg-gradient-to-b from-accent/10 to-transparent pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-xl pt-[env(safe-area-inset-top)]">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl overflow-hidden bg-accent/15 border border-accent/25 flex items-center justify-center shrink-0">
            {data.artist.photoUrl ? <img src={data.artist.photoUrl} alt="" className="w-full h-full object-cover" /> : <span className="text-sm font-black text-accent">{(data.artist.name || '?').slice(0, 2).toUpperCase()}</span>}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-accent truncate">{data.producerName || 'EZY Studio'}</p>
            <h1 className="text-base font-bold leading-tight truncate">{data.artist.name}</h1>
          </div>
          <nav className="hidden md:flex items-center gap-1 bg-surface-elevated rounded-xl p-1 border border-border/60">
            {navItems.filter(n => n.show).map(({ key, label, icon: Icon }) => (
              <button key={key} type="button" onClick={() => setSection(key)} className={cn('h-9 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors', section === key ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text-primary')}>
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </nav>
          <button type="button" onClick={() => fetchPortal(true)} className="w-10 h-10 rounded-xl border border-border flex items-center justify-center text-text-secondary hover:text-accent" aria-label="Actualizar" title="Actualizar">
            <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
          </button>
        </div>
        {/* Mobile nav */}
        <nav className="md:hidden flex items-center gap-1 px-3 pb-2 overflow-x-auto scrollbar-hide">
          {navItems.filter(n => n.show).map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" onClick={() => setSection(key)} className={cn('h-9 px-3 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shrink-0', section === key ? 'bg-accent text-white' : 'bg-surface-elevated text-text-secondary border border-border/60')}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </nav>
      </header>

      <main className={cn('relative max-w-6xl mx-auto px-4 py-6 md:py-8 space-y-4', currentTrack ? 'pb-40' : 'pb-24')}>
        {section === 'home' && (
          <div className="space-y-4 animate-fade-in">
            <section className="relative overflow-hidden rounded-2xl border border-border bg-surface-elevated p-5 md:p-6">
              <div className="absolute -top-20 -right-10 w-64 h-64 rounded-full bg-accent/15 blur-[80px] pointer-events-none" />
              <p className="relative text-2xl md:text-3xl font-black tracking-tight">Hola, {data.artist.name} 👋</p>
              {data.welcomeMessage ? (
                <p className="relative text-sm text-text-secondary mt-2 whitespace-pre-line max-w-2xl">{data.welcomeMessage}</p>
              ) : (
                <p className="relative text-sm text-text-secondary mt-2">Aquí tienes tus archivos, el estado del trabajo y todo lo que comparte contigo {data.producerName || 'tu productor'}.</p>
              )}
              <div className="relative grid grid-cols-2 md:grid-cols-4 gap-2 mt-5">
                <div className="rounded-xl bg-surface border border-border p-3"><p className="text-xl font-black">{realProjects.filter(p => p.status !== 'archived').length}</p><p className="text-[11px] text-text-secondary">Proyectos</p></div>
                <div className="rounded-xl bg-surface border border-border p-3"><p className="text-xl font-black">{allFiles.length}</p><p className="text-[11px] text-text-secondary">Archivos</p></div>
                <div className="rounded-xl bg-surface border border-border p-3"><p className={cn('text-xl font-black', newThisWeek > 0 && 'text-accent')}>{newThisWeek}</p><p className="text-[11px] text-text-secondary">Nuevos esta semana</p></div>
                <div className="rounded-xl bg-surface border border-border p-3"><p className="text-xl font-black">{avgProgress === null ? '—' : `${avgProgress}%`}</p><p className="text-[11px] text-text-secondary">Progreso</p></div>
              </div>
              {pending > 0 && realProjects.some(p => p.requirePaymentForDownload) && (
                <p className="relative mt-4 text-xs text-warning flex items-center gap-2 rounded-xl bg-warning/10 border border-warning/25 px-3 py-2">
                  <Lock className="w-4 h-4 shrink-0" /> Algunas descargas se desbloquearán cuando el pago pendiente esté completado.
                </p>
              )}
            </section>

            {modules.map(renderHomeModule)}
          </div>
        )}

        {section === 'files' && (
          <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 items-start animate-fade-in">
            <aside className="lg:sticky lg:top-24 rounded-2xl border border-border bg-surface-elevated p-2">
              <div className="lg:hidden relative">
                <select value={projectId} onChange={e => setProjectId(e.target.value)} className="w-full h-11 appearance-none bg-surface border border-border rounded-xl pl-3 pr-9 text-sm font-semibold focus:outline-none">
                  {projects.map(p => <option key={p.id} value={p.id}>{p.title} ({p.files.length})</option>)}
                </select>
                <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-text-secondary" />
              </div>
              <div className="hidden lg:block space-y-0.5">
                {projects.map(p => (
                  <button key={p.id} type="button" onClick={() => setProjectId(p.id)} className={cn('w-full flex items-center gap-2.5 h-10 px-3 rounded-xl text-sm text-left transition-colors', projectId === p.id ? 'bg-accent/15 text-text-primary font-semibold' : 'text-text-secondary hover:bg-surface hover:text-text-primary')}>
                    {p.id === 'all' ? <Files className="w-4 h-4 shrink-0" /> : p.id === 'general' ? <Disc className="w-4 h-4 shrink-0" /> : <FolderOpen className="w-4 h-4 shrink-0" />}
                    <span className="flex-1 truncate">{p.title}</span>
                    <span className="text-[11px] opacity-70">{p.files.length}</span>
                  </button>
                ))}
              </div>
            </aside>

            <section className="rounded-2xl border border-border bg-surface-elevated overflow-hidden">
              <div className="p-3 md:p-4 border-b border-border/60 space-y-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold flex-1 truncate">{currentProject?.title}</h2>
                  {currentProject?.requirePaymentForDownload && pending > 0 && <span className="text-[11px] text-warning inline-flex items-center gap-1"><Lock className="w-3.5 h-3.5" /> Descargas bloqueadas</span>}
                  {currentProject?.driveUrl && !(currentProject.requirePaymentForDownload && pending > 0) && (
                    <a href={currentProject.driveUrl} target="_blank" rel="noopener noreferrer" className="h-9 px-3 rounded-xl border border-border text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-surface" title="Abre la carpeta en Google Drive para descargarla completa">
                      <ExternalLink className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Descargar carpeta</span>
                    </a>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-text-secondary absolute left-3 top-1/2 -translate-y-1/2" />
                    <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar archivos…" className="w-full h-10 bg-surface border border-border rounded-xl pl-9 pr-8 text-sm focus:outline-none focus:border-accent" />
                    {query && <button type="button" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-text-secondary" aria-label="Borrar"><X className="w-4 h-4" /></button>}
                  </div>
                  <div className="flex p-0.5 rounded-xl bg-surface border border-border h-10 shrink-0">
                    {(['all', 'audio', 'other'] as FileFilter[]).map(f => (
                      <button key={f} type="button" onClick={() => setFilter(f)} className={cn('px-3 rounded-lg text-xs font-semibold', filter === f ? 'bg-surface-elevated text-text-primary shadow-sm' : 'text-text-secondary')}>
                        {f === 'all' ? 'Todo' : f === 'audio' ? 'Audios' : 'Otros'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {visibleFiles.length === 0 ? (
                <p className="text-sm text-text-secondary text-center py-14">{query || filter !== 'all' ? 'No hay archivos que coincidan' : 'Este proyecto todavía no tiene archivos'}</p>
              ) : (
                <div className="divide-y divide-border/40">{visibleFiles.map((f: any) => <FileRow key={f.id} file={f} showProject={projectId === 'all'} />)}</div>
              )}
            </section>
          </div>
        )}

        {section === 'releases' && (
          <div className="space-y-4 animate-fade-in">
            <div className="rounded-2xl border border-border bg-surface-elevated p-4 md:p-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center shrink-0">
                <Disc className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold text-text-primary">Previews y Lanzamientos</h2>
                <p className="text-xs text-text-secondary">Escuchas exclusivas y descargas directas de tus canciones</p>
              </div>
            </div>

            {data.releases?.length ? (
              <div className="space-y-3">
                {data.releases.map((r: any) => {
                  const isOpen = openReleaseId === r.id;
                  return (
                    <div key={r.id} className="rounded-2xl border border-border bg-surface-elevated overflow-hidden transition-all shadow-sm">
                      <div className="flex items-center gap-3.5 p-3.5 md:p-4">
                        <div 
                          onClick={() => setOpenReleaseId(isOpen ? null : r.id)}
                          className="w-12 h-12 md:w-14 md:h-14 rounded-xl overflow-hidden bg-surface border border-border flex items-center justify-center shrink-0 cursor-pointer"
                        >
                          {r.coverArtId ? (
                            <img src={getCoverArtUrl(r.coverArtId, 200)} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Disc className="w-6 h-6 text-accent/50" />
                          )}
                        </div>
                        <div 
                          onClick={() => setOpenReleaseId(isOpen ? null : r.id)}
                          className="flex-1 min-w-0 cursor-pointer select-none"
                        >
                          <h3 className="text-sm md:text-base font-bold text-text-primary truncate hover:text-accent transition-colors">{r.title}</h3>
                          <p className="text-xs text-text-secondary mt-0.5">
                            {r.tracks?.length || 0} canciones · Escucha exclusiva
                          </p>
                        </div>
                        {r.tracks && r.tracks.length > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDownloadRelease(r);
                            }}
                            className="h-9 px-3 md:px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 bg-surface border border-border text-text-secondary hover:text-accent hover:border-accent/40 transition-all shrink-0 cursor-pointer"
                            title={r.tracks.length === 1 ? "Descargar audio" : "Descargar canciones"}
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Descargar</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setOpenReleaseId(isOpen ? null : r.id)}
                          className={cn(
                            "h-9 px-3.5 md:px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 transition-all cursor-pointer",
                            isOpen
                              ? "bg-surface border border-border text-text-secondary hover:text-text-primary"
                              : "bg-accent text-white shadow-md shadow-accent/25 hover:bg-accent/90"
                          )}
                        >
                          {isOpen ? (
                            <>
                              <ChevronUp className="w-3.5 h-3.5" /> Cerrar preview
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-3.5 h-3.5" /> Abrir preview
                            </>
                          )}
                        </button>
                      </div>

                      {isOpen && (
                        <div className="border-t border-border/60 p-4 md:p-6 bg-surface/30 animate-fade-in">
                          <PortalReleasePlayer
                            release={r}
                            allowArtistEdit={moduleOf('releases')?.config?.allowArtistEdit}
                            bounces={allFiles}
                            portalToken={config.token}
                            artistId={artistId}
                            onReleaseUpdate={(updated: any) =>
                              setData((d: any) => ({
                                ...d,
                                releases: d.releases.map((rel: any) => (rel.id === updated.id ? updated : rel)),
                              }))
                            }
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-text-secondary text-center py-20">Todavía no hay previews publicadas.</p>
            )}
          </div>
        )}

        {section === 'tools' && toolsEnabled && (
          <div className="space-y-5 animate-fade-in">
            {allowedTools.length > 1 && (
              <div className="flex gap-1.5 overflow-x-auto scrollbar-hide p-1 rounded-2xl border border-border bg-surface-elevated w-fit max-w-full mx-auto">
                {PORTAL_TOOLS.filter(t => allowedTools.includes(t.id)).map(tool => {
                  const Icon = TOOL_ICONS[tool.iconName] || Wrench;
                  return (
                    <button key={tool.id} type="button" onClick={() => setActiveToolId(tool.id)} className={cn('h-10 px-3.5 rounded-xl text-xs font-bold inline-flex items-center gap-2 shrink-0', activeToolId === tool.id ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text-primary')}>
                      <Icon className="w-4 h-4" /> {tool.shortName}
                    </button>
                  );
                })}
              </div>
            )}
            {activeToolId === 'downloader' && <MusicDownloader />}
            {activeToolId === 'converter' && <AudioConverter />}
            {activeToolId === 'trimmer' && <AudioTrimmer />}
            {activeToolId === 'tags' && <TagEditor />}
            {activeToolId === 'detector' && <BpmKeyDetector />}
            {activeToolId === 'stems' && <StemsSplitter />}
          </div>
        )}
      </main>
    </div>
  );
}
