'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  Loader2, Music, CheckCircle2, Circle, Headphones, CreditCard,
  AlertCircle, Sparkles, MessageSquare, Send, Disc, Play, Pause,
  SkipForward, SkipBack, ChevronRight, Lock, Download, ExternalLink,
  Star, Clock, TrendingUp, ListMusic, Eye
} from 'lucide-react';
import { WaveformPlayer } from '@/components/projects/WaveformPlayer';
import { useAudio } from '@/lib/contexts/AudioContext';
import { isBrowserCompatible } from '@/lib/utils';

// ─── Mini audio player for releases ──────────────────────────────────────────
function ReleasePlayer({ release }: { release: any }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const currentTrack = release?.tracks?.[currentTrackIndex];

  useEffect(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.play().catch(() => setIsPlaying(false));
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying, currentTrackIndex]);

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const curr = audioRef.current.currentTime;
      const dur = audioRef.current.duration || 1;
      setProgress((curr / dur) * 100);
      setCurrentTime(curr);
      setDuration(dur);
    }
  };

  const handleTrackEnd = () => {
    if (release && currentTrackIndex < release.tracks.length - 1) {
      setCurrentTrackIndex(prev => prev + 1);
    } else {
      setIsPlaying(false);
      setProgress(0);
      setCurrentTime(0);
    }
  };

  const playTrack = (index: number) => {
    if (currentTrackIndex === index) {
      setIsPlaying(prev => !prev);
    } else {
      setCurrentTrackIndex(index);
      setIsPlaying(true);
      setProgress(0);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const seekTo = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = pos * duration;
  };

  return (
    <div className="space-y-4">
      {currentTrack && (
        <audio
          ref={audioRef}
          src={`/api/audio/${currentTrack.newFileId}`}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleTrackEnd}
          onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        />
      )}

      {/* Current playing card */}
      <div className="bg-gradient-to-br from-accent/10 to-accent/5 border border-accent/20 rounded-2xl p-5">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-xl overflow-hidden bg-surface border border-border flex items-center justify-center shadow-lg shadow-accent/10 shrink-0">
            {release.coverArtId ? (
              <img src={`/api/audio/${release.coverArtId}`} alt="Cover" className="w-full h-full object-cover" />
            ) : (
              <Disc className="w-8 h-8 text-accent/40" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-accent font-bold uppercase tracking-widest mb-1">Escucha Exclusiva</p>
            <h4 className="font-bold text-text-primary truncate">{currentTrack?.title || release.title}</h4>
            <p className="text-xs text-text-secondary mt-0.5">
              Pista {currentTrackIndex + 1} de {release.tracks.length}
            </p>
          </div>
        </div>

        {/* Progress */}
        <div
          className="h-1.5 bg-surface-elevated rounded-full mb-2 cursor-pointer overflow-hidden"
          onClick={seekTo}
        >
          <div
            className="h-full bg-gradient-to-r from-accent to-accent-light rounded-full transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] font-mono text-text-secondary mb-4">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-5">
          <button
            onClick={() => currentTrackIndex > 0 && playTrack(currentTrackIndex - 1)}
            className={`p-2 rounded-full transition-colors ${currentTrackIndex === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-surface-elevated text-text-secondary hover:text-text-primary'}`}
          >
            <SkipBack className="w-5 h-5" />
          </button>
          <button
            onClick={() => setIsPlaying(prev => !prev)}
            className="w-12 h-12 bg-accent hover:bg-accent/90 text-text-primary rounded-full flex items-center justify-center shadow-lg shadow-accent/30 transition-all hover:scale-105 active:scale-95"
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
          </button>
          <button
            onClick={() => currentTrackIndex < release.tracks.length - 1 && playTrack(currentTrackIndex + 1)}
            className={`p-2 rounded-full transition-colors ${currentTrackIndex === release.tracks.length - 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-surface-elevated text-text-secondary hover:text-text-primary'}`}
          >
            <SkipForward className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Tracklist */}
      <div className="space-y-1">
        {release.tracks.map((track: any, index: number) => (
          <button
            key={track.id}
            onClick={() => playTrack(index)}
            className={`w-full flex items-center gap-3 p-2.5 rounded-xl border transition-all text-left group ${
              currentTrackIndex === index
                ? 'border-accent/30 bg-accent/8 text-text-primary'
                : 'border-transparent text-text-secondary hover:border-border/60 hover:text-text-primary hover:bg-surface-elevated/30'
            }`}
          >
            <div className="w-6 text-center shrink-0">
              {currentTrackIndex === index && isPlaying ? (
                <div className="flex items-center justify-center gap-0.5 h-4">
                  <div className="w-0.5 bg-accent h-3 animate-[bounce_0.8s_ease-in-out_infinite]" />
                  <div className="w-0.5 bg-accent h-4 animate-[bounce_0.8s_ease-in-out_infinite_100ms]" />
                  <div className="w-0.5 bg-accent h-2 animate-[bounce_0.8s_ease-in-out_infinite_200ms]" />
                </div>
              ) : (
                <span className={`text-xs font-mono ${currentTrackIndex === index ? 'text-accent' : 'text-text-secondary/60'}`}>
                  {index + 1}
                </span>
              )}
            </div>
            <span className={`text-xs font-semibold flex-1 truncate ${currentTrackIndex === index ? 'text-text-primary' : ''}`}>
              {track.title}
            </span>
            <Play className="w-3.5 h-3.5 opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main Portal Page ─────────────────────────────────────────────────────────
export default function PortalPage() {
  const params = useParams();
  const { playTrack } = useAudio();
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [activeReleaseId, setActiveReleaseId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'overview' | 'releases'>('overview');

  useEffect(() => {
    // Force light theme for portal page
    const html = document.documentElement;
    const isDark = html.classList.contains('dark');
    html.classList.remove('dark');
    html.classList.add('light');
    return () => {
      if (isDark) {
        html.classList.remove('light');
        html.classList.add('dark');
      }
    };
  }, []);

  useEffect(() => {
    const fetchPortal = async () => {
      try {
        const res = await fetch(`/api/portal/${params.id}`);
        if (!res.ok) throw new Error('Portal no encontrado');
        const json = await res.json();
        setData(json);
        if (json.projects && json.projects.length > 0) {
          setSelectedProjectId(json.projects[0].id);
        }
        if (json.releases && json.releases.length > 0) {
          setActiveReleaseId(json.releases[0].id);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPortal();
  }, [params.id]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex justify-center items-center">
        <div className="text-center space-y-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto">
              <Sparkles className="w-8 h-8 text-accent animate-pulse" />
            </div>
          </div>
          <p className="text-xs text-text-secondary font-medium tracking-widest uppercase">Cargando Portal...</p>
        </div>
      </div>
    );
  }

  if (!data || data.error) {
    return (
      <div className="min-h-screen bg-background text-text-primary flex justify-center items-center p-6">
        <div className="max-w-md w-full p-8 rounded-2xl border border-red-500/20 bg-red-500/5 text-center space-y-4 backdrop-blur-xl">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <h1 className="text-2xl font-bold">Portal no disponible</h1>
          <p className="text-text-secondary text-sm">El artista no está configurado o el enlace no es válido. Si crees que es un error, contacta a tu productor.</p>
        </div>
      </div>
    );
  }

  const activeProject = data.projects.find((p: any) => p.id === selectedProjectId) || data.projects[0];
  const totalTasks = activeProject?.tasks?.length || 0;
  const completedTasks = activeProject?.tasks?.filter((t: any) => t.status === 'completed').length || 0;
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const paywallLocked = activeProject?.requirePaymentForDownload && data.finances?.pendingPayment > 0;
  const activeRelease = data.releases?.find((r: any) => r.id === activeReleaseId) || data.releases?.[0];

  const visibleModules = (data.config?.modules || []).filter((m: any) => m.isVisible !== false).sort((a: any, b: any) => a.order - b.order);

  const hasReleases = data.releases && data.releases.length > 0;
  const hasFinances = data.finances;
  const showSidebar = (hasReleases && visibleModules.some((m: any) => m.type === 'releases')) ||
                      (hasFinances && visibleModules.some((m: any) => m.type === 'finances'));

  const renderBounces = () => {
    const mod = visibleModules.find((m: any) => m.type === 'bounces');
    if (!mod || !activeProject) return null;
    return (
      <div key={mod.id} className="bg-surface rounded-2xl border border-border p-6 flex flex-col gap-4 shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Headphones className="w-5 h-5 text-accent" />
            <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">{mod.title || 'Últimas Mezclas / Audios'}</h3>
          </div>
          {paywallLocked && (
            <div className="flex items-center gap-1.5 text-[10px] text-warning bg-[#fdcb6e]/10 border border-[#fdcb6e]/20 px-2.5 py-1 rounded-full font-semibold">
              <Lock className="w-3 h-3" /> Descarga bloqueada
            </div>
          )}
        </div>

        {activeProject.bounces && activeProject.bounces.length > 0 ? (
          <div className="space-y-4">
            {[...activeProject.bounces].sort((a, b) => {
              const parseDate = (filename: string) => {
                const match = filename.match(/\[(\d{2})-(\d{2})-(\d{4})\]/);
                if (match) {
                  const [, day, month, year] = match;
                  return new Date(parseInt(year), parseInt(month) - 1, parseInt(day)).getTime();
                }
                return 0;
              };
              const dateA = parseDate(a.name || '');
              const dateB = parseDate(b.name || '');
              
              if (dateA !== dateB) {
                return dateB - dateA; // Newest first
              }
              // Fallback to modifiedTime
              const timeA = new Date(a.modifiedTime || 0).getTime();
              const timeB = new Date(b.modifiedTime || 0).getTime();
              return timeB - timeA;
            }).map((file: any) => (
              <WaveformPlayer
                key={file.id}
                fileId={file.id}
                fileName={file.name}
                artistName={data.artist.name}
                isPortal={true}
                paywallLocked={paywallLocked}
                modifiedTime={file.modifiedTime}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center bg-white/2 rounded-xl border border-dashed border-border">
            <Music className="w-10 h-10 text-text-secondary opacity-40 mb-2" />
            <p className="text-sm text-text-secondary italic">No hay audios disponibles para este proyecto.</p>
          </div>
        )}
      </div>
    );
  };

  const renderTasks = () => {
    const mod = visibleModules.find((m: any) => m.type === 'tasks');
    if (!mod) return null;

    const matrices = data.sharedMatrices || [];
    const projectTasks = activeProject?.tasks || [];

    let totalMatrixTasks = 0;
    let completedMatrixTasks = 0;
    matrices.forEach((matrix: any) => {
      const columns = matrix.productionGrid?.columns || [];
      const rows = matrix.productionGrid?.rows || [];
      totalMatrixTasks += columns.length * rows.length;
      rows.forEach((row: any) => {
        columns.forEach((col: any) => {
          if (row.cells?.[col.id]?.status === 'done') {
            completedMatrixTasks++;
          }
        });
      });
    });

    const hasProjectTasks = projectTasks.length > 0;
    const hasMatrices = matrices.length > 0;

    if (!hasProjectTasks && !hasMatrices) {
      return (
        <div key={mod.id} className="bg-surface rounded-2xl border border-border p-6 flex flex-col gap-4 shadow-sm">
          <div className="flex items-center gap-2 pb-3 border-b border-border">
            <CheckCircle2 className="w-5 h-5 text-accent" />
            <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">{mod.title || 'Estado del Trabajo'}</h3>
          </div>
          <div className="flex flex-col items-center justify-center py-16 text-center bg-white/2 rounded-xl border border-dashed border-border">
            <CheckCircle2 className="w-10 h-10 text-text-secondary opacity-40 mb-2" />
            <p className="text-sm text-text-secondary italic">No hay tareas ni matrices asignadas para este proyecto.</p>
          </div>
        </div>
      );
    }

    return (
      <div key={mod.id} className="bg-surface rounded-2xl border border-border p-6 flex flex-col gap-5 shadow-sm">
        <div className="flex items-center gap-2 pb-3 border-b border-border">
          <CheckCircle2 className="w-5 h-5 text-accent" />
          <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">{mod.title || 'Estado del Trabajo'}</h3>
        </div>

        {hasProjectTasks && (
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-text-secondary uppercase tracking-widest">Tareas del Proyecto</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {projectTasks.map((t: any) => (
                <div key={t.id} className="flex items-center gap-3 p-3 rounded-xl border border-border/60 bg-surface-elevated/40">
                  {t.status === 'completed' ? (
                    <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-text-secondary/50 shrink-0" />
                  )}
                  <span className={`text-xs font-medium ${t.status === 'completed' ? 'line-through text-text-secondary' : 'text-text-primary'}`}>
                    {t.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {hasMatrices && (
          <div className="space-y-6">
            {totalMatrixTasks > 0 && (
              <div className="flex items-center gap-4 bg-surface-elevated/30 p-4 rounded-xl border border-border/50">
                <div className="relative w-14 h-14 shrink-0">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 56 56">
                    <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(0,0,0,0.04)" strokeWidth="6" />
                    <circle
                      cx="28" cy="28" r="22" fill="none"
                      stroke="url(#progressGradTasks)" strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 22}`}
                      strokeDashoffset={`${2 * Math.PI * 22 * (1 - (totalMatrixTasks > 0 ? Math.round((completedMatrixTasks / totalMatrixTasks) * 100) : 0) / 100)}`}
                      className="transition-all duration-1000"
                    />
                    <defs>
                      <linearGradient id="progressGradTasks" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#6c5ce7" />
                        <stop offset="100%" stopColor="#a29bfe" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-text-primary">
                    {totalMatrixTasks > 0 ? Math.round((completedMatrixTasks / totalMatrixTasks) * 100) : 0}%
                  </span>
                </div>
                <div>
                  <p className="text-text-primary font-bold text-sm">Seguimiento de Producción</p>
                  <p className="text-xs text-text-secondary">{completedMatrixTasks} de {totalMatrixTasks} tareas de la matriz completadas</p>
                </div>
              </div>
            )}

            <div className="space-y-6">
              {matrices.map((matrix: any) => (
                <div key={matrix.id} className="bg-background rounded-xl border border-border overflow-hidden">
                  <h3 className="text-xs font-bold text-text-secondary uppercase tracking-widest p-4 pb-2 bg-surface-elevated/40 border-b border-border/40">{matrix.name}</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-border bg-surface-elevated/20">
                          <th className="p-3 text-text-secondary font-bold">Elemento</th>
                          {matrix.productionGrid?.columns?.map((col: any) => (
                            <th key={col.id} className="p-3 text-text-secondary font-bold text-center">{col.name}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {matrix.productionGrid?.rows?.map((row: any) => (
                          <tr key={row.id} className="border-b border-border hover:bg-surface-elevated/10 transition-colors">
                            <td className="p-3 font-semibold text-text-primary">
                              <div className="flex items-center gap-2">
                                {row.linkedFile && (
                                  <div className="flex items-center gap-1 shrink-0 bg-surface-elevated px-1.5 py-0.5 rounded border border-border/50">
                                    {(row.linkedFile.mimeType?.includes('audio/') || /\.(wav|mp3|m4a|flac|aiff|ogg)$/i.test(row.linkedFile.name)) && (
                                      <button onClick={(e) => { e.stopPropagation(); playTrack({ id: row.linkedFile.id, name: row.name || row.linkedFile.name, url: `/api/audio/${row.linkedFile.id}`, artistName: data?.artistConfig?.artistName || 'Artista' }); }} className="text-accent hover:text-accent-light transition-colors" title="Reproducir audio">
                                        <Play className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                    {row.linkedFile.webViewLink && (
                                      <a href={isBrowserCompatible(row.linkedFile.mimeType) ? `/api/files/${row.linkedFile.id}?inline=true` : row.linkedFile.webViewLink} target="_blank" rel="noopener noreferrer" className="text-text-secondary hover:text-text-primary transition-colors" title="Ver en Navegador">
                                        <ExternalLink className="w-3.5 h-3.5" />
                                      </a>
                                    )}
                                    {row.linkedFile.webContentLink && (
                                      <a href={`/api/files/${row.linkedFile.id}?inline=false`} className="text-text-secondary hover:text-text-primary transition-colors" title="Descargar archivo">
                                        <Download className="w-3.5 h-3.5" />
                                      </a>
                                    )}
                                  </div>
                                )}
                                <span className="truncate">{row.name}</span>
                              </div>
                            </td>
                            {matrix.productionGrid?.columns?.map((col: any) => {
                              const cell = row.cells?.[col.id] || {};
                              const status = cell.status || 'todo';
                              const statusStyles: Record<string, string> = {
                                todo: 'border-border bg-surface text-text-secondary',
                                in_progress: 'border-accent/25 bg-accent/5 text-accent-light',
                                review: 'border-warning/25 bg-warning/5 text-warning',
                                done: 'border-success/25 bg-success/5 text-success'
                              };
                              const statusLabels: Record<string, string> = {
                                todo: 'Pendiente', in_progress: 'En progreso',
                                review: 'Revisión', done: 'Hecho'
                              };
                              const IconMap: Record<string, any> = {
                                todo: Circle,
                                in_progress: Clock,
                                review: Eye,
                                done: CheckCircle2
                              };
                              const StatusIcon = IconMap[status] || Circle;

                              return (
                                <td key={col.id} className="p-3 text-center">
                                  <span className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold w-28 text-center transition-all ${statusStyles[status] || statusStyles.todo}`}>
                                    <StatusIcon className="w-3.5 h-3.5 shrink-0" />
                                    {statusLabels[status] || 'Pendiente'}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderFinances = () => {
    const mod = visibleModules.find((m: any) => m.type === 'finances');
    if (!mod || !data.finances) return null;
    const pct = data.finances.totalBudget > 0
      ? Math.round((data.finances.totalPaid / data.finances.totalBudget) * 100)
      : 0;
    return (
      <div key={mod.id} className="bg-surface rounded-2xl border border-border p-5 space-y-4 shadow-sm">
        <div className="flex items-center gap-2 pb-3 border-b border-border">
          <CreditCard className="w-5 h-5 text-accent" />
          <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">{mod.title || 'Resumen Financiero'}</h3>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-xs text-text-secondary font-medium">Presupuesto Total</span>
            <span className="font-bold text-sm text-text-primary">{data.finances.totalBudget}€</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-text-secondary font-medium">Total Abonado</span>
            <span className="font-bold text-sm text-success">{data.finances.totalPaid}€</span>
          </div>

          <div className="pt-1">
            <div className="h-2 bg-surface-elevated rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-success to-emerald-400 rounded-full transition-all duration-1000"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-[10px] text-text-secondary mt-1 text-right font-medium">{pct}% liquidado</p>
          </div>

          <div className="flex justify-between items-center pt-3 border-t border-border">
            <span className="text-xs font-semibold text-text-primary">Pendiente</span>
            <span className={`text-lg font-black ${data.finances.pendingPayment > 0 ? 'text-warning' : 'text-success'}`}>
              {data.finances.pendingPayment}€
            </span>
          </div>
          {data.finances.pendingPayment > 0 && (
            <p className="text-[10px] text-warning flex items-center gap-1.5 bg-[#fdcb6e]/8 border border-[#fdcb6e]/15 p-2.5 rounded-xl">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              Listo para facturación y cobro final.
            </p>
          )}
        </div>
      </div>
    );
  };

  const renderReleases = () => {
    const mod = visibleModules.find((m: any) => m.type === 'releases');
    if (!mod || !data.releases || data.releases.length === 0) return null;
    return (
      <div key={mod.id} className="bg-surface rounded-2xl border border-border p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Disc className="w-5 h-5 text-accent" />
            <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">{mod.title || 'Previews'}</h3>
          </div>
          <button
            onClick={() => setActiveSection('releases')}
            className="text-[10px] text-accent hover:text-accent-light font-bold flex items-center gap-0.5 transition-colors"
          >
            Ver todas <ChevronRight className="w-3 h-3" />
          </button>
        </div>
        <div className="space-y-2.5">
          {data.releases.slice(0, 3).map((r: any) => (
            <button
              key={r.id}
              onClick={() => { setActiveReleaseId(r.id); setActiveSection('releases'); }}
              className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-border hover:border-accent/30 hover:bg-accent/5 transition-all text-left group"
            >
              <div className="w-10 h-10 rounded-lg overflow-hidden bg-surface border border-border flex items-center justify-center shrink-0">
                {r.coverArtId
                  ? <img src={`/api/audio/${r.coverArtId}`} alt="" className="w-full h-full object-cover" />
                  : <Disc className="w-5 h-5 text-text-secondary/40" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-text-primary truncate">{r.title}</p>
                <p className="text-[10px] text-text-secondary">{r.tracks?.length || 0} canciones</p>
              </div>
              <Play className="w-4 h-4 text-accent opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </button>
          ))}
        </div>
      </div>
    );
  };

  const mainModules = visibleModules.filter((m: any) => m.type === 'bounces' || m.type === 'tasks');

  return (
    <div className="min-h-screen bg-background text-text-primary font-sans antialiased selection:bg-accent/30">
      {/* Ambient glow */}
      <div className="fixed top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#6c5ce7]/8 to-transparent pointer-events-none z-0" />
      <div className="fixed top-40 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-accent/5 blur-[100px] rounded-full pointer-events-none z-0" />

      {/* Header */}
      <header className="border-b border-border bg-surface/90 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-[1600px] w-[95%] mx-auto px-5 py-3.5 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center border border-[#6c5ce7]/25">
              <Sparkles className="w-4.5 h-4.5 text-accent-light" />
            </div>
            <div>
              <p className="text-[9px] text-accent font-bold uppercase tracking-[0.15em]">Portal de</p>
              <h1 className="text-lg font-bold text-text-primary leading-tight">{data.artist.name}</h1>
            </div>
          </div>

          {/* Nav tabs */}
          <div className="flex items-center gap-1 bg-surface-elevated rounded-xl p-1">
            {[
              { key: 'overview', label: 'Overview', icon: TrendingUp },
              ...(data.releases?.length > 0 ? [{ key: 'releases', label: 'Previews', icon: ListMusic }] : []),
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveSection(key as any)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeSection === key
                    ? 'bg-accent text-white shadow-lg shadow-[#6c5ce7]/20'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:block">{label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs text-text-secondary px-3 py-1.5 rounded-full bg-surface-elevated border border-border">
            <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            <span className="font-medium hidden sm:block">Seguro</span>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] w-[95%] mx-auto px-5 py-8 relative z-10">

        {/* ── OVERVIEW SECTION ── */}
        {activeSection === 'overview' && (
          <div className="space-y-6 animate-fade-in">
            {/* Stats row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-surface border border-border rounded-2xl p-4 shadow-sm">
                <p className="text-xs text-text-secondary font-medium mb-2 flex items-center gap-1.5"><Music className="w-3.5 h-3.5 text-accent" /> Proyectos</p>
                <p className="text-2xl font-black text-text-primary">{data.projects.length}</p>
                <p className="text-[10px] text-text-secondary mt-0.5">activos</p>
              </div>
              <div className="bg-surface border border-border rounded-2xl p-4 shadow-sm">
                <p className="text-xs text-text-secondary font-medium mb-2 flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 text-accent" /> Progreso</p>
                <p className="text-2xl font-black text-accent-light">{progressPercent}%</p>
                <p className="text-[10px] text-text-secondary mt-0.5">{completedTasks}/{totalTasks} tareas</p>
              </div>
              {data.finances && visibleModules.some((m: any) => m.type === 'finances') && (
                <>
                  <div className="bg-surface border border-border rounded-2xl p-4 shadow-sm">
                    <p className="text-xs text-text-secondary font-medium mb-2 flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5 text-accent" /> Pagado</p>
                    <p className="text-2xl font-black text-success">{data.finances.totalPaid}€</p>
                    <p className="text-[10px] text-text-secondary mt-0.5">de {data.finances.totalBudget}€</p>
                  </div>
                  <div className="bg-surface border border-border rounded-2xl p-4 shadow-sm">
                    <p className="text-xs text-text-secondary font-medium mb-2 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 text-accent" /> Pendiente</p>
                    <p className={`text-2xl font-black ${data.finances.pendingPayment > 0 ? 'text-warning' : 'text-success'}`}>
                      {data.finances.pendingPayment}€
                    </p>
                    <p className="text-[10px] text-text-secondary mt-0.5">{data.finances.pendingPayment > 0 ? 'por liquidar' : '¡al día!'}</p>
                  </div>
                </>
              )}
            </div>

            {/* Project Header / Selector */}
            {data.projects.length > 0 && (
              <div className="bg-surface border border-border rounded-2xl p-4 flex flex-wrap justify-between items-center shadow-sm gap-4">
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-xs font-bold text-text-secondary uppercase tracking-wider mr-2">
                    {data.projects.length > 1 ? 'Proyecto:' : 'Proyecto Activo:'}
                  </span>
                  {data.projects.length > 1 ? (
                    data.projects.map((proj: any) => (
                      <button
                        key={proj.id}
                        onClick={() => setSelectedProjectId(proj.id)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                          selectedProjectId === proj.id
                            ? 'bg-accent text-white shadow-lg shadow-accent/20'
                            : 'bg-surface-elevated border border-border hover:bg-surface-elevated/80 text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        {proj.title}
                      </button>
                    ))
                  ) : (
                    <span className="px-4 py-2 rounded-xl text-xs font-bold bg-accent text-white shadow-lg shadow-accent/20">
                      {activeProject?.title}
                    </span>
                  )}
                </div>
                
                {activeProject?.driveUrl && (
                  <button 
                    onClick={() => {
                       window.open(activeProject.driveUrl, '_blank');
                       alert('Se abrirá Google Drive. Haz clic en el botón "Descargar" arriba a la derecha para descargar toda la carpeta.');
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-elevated border border-border hover:bg-accent hover:text-white hover:border-accent text-text-secondary transition-colors text-xs font-bold"
                  >
                    <Download className="w-4 h-4" />
                    Descargar Carpeta
                  </button>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-6 items-start">
              {/* Main Column */}
              <div className={`space-y-6 ${showSidebar ? 'lg:col-span-8' : 'lg:col-span-12'}`}>
                {mainModules.map((mod: any) => {
                  if (mod.type === 'bounces') return renderBounces();
                  if (mod.type === 'tasks') return renderTasks();
                  return null;
                })}
              </div>

              {/* Sidebar Column */}
              {showSidebar && (
                <div className="lg:col-span-4 space-y-6">
                  {visibleModules
                    .filter((m: any) => m.type === 'releases' || m.type === 'finances')
                    .map((mod: any) => {
                      if (mod.type === 'releases') return renderReleases();
                      if (mod.type === 'finances') return renderFinances();
                      return null;
                    })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── RELEASES / PREVIEWS SECTION ── */}
        {activeSection === 'releases' && (
          <div className="animate-fade-in">
            {data.releases && data.releases.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Release list */}
                <div className="space-y-3">
                  <h2 className="text-sm font-bold text-text-secondary uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Disc className="w-4 h-4" /> Lanzamientos
                  </h2>
                  {data.releases.map((r: any) => (
                    <button
                      key={r.id}
                      onClick={() => setActiveReleaseId(r.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                        activeReleaseId === r.id
                          ? 'border-[#6c5ce7]/40 bg-accent/10'
                          : 'border-border bg-white/2 hover:border-border hover:bg-white/4'
                      }`}
                    >
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-[#1a1a25] border border-border flex items-center justify-center shrink-0">
                        {r.coverArtId
                          ? <img src={`/api/audio/${r.coverArtId}`} alt="" className="w-full h-full object-cover" />
                          : <Disc className="w-6 h-6 text-text-secondary/30" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-text-primary text-sm truncate">{r.title}</p>
                        <p className="text-[10px] text-text-secondary mt-0.5">{r.tracks?.length || 0} canciones</p>
                      </div>
                      {activeReleaseId === r.id && <ChevronRight className="w-4 h-4 text-accent shrink-0" />}
                    </button>
                  ))}
                </div>

                {/* Player */}
                <div className="lg:col-span-2">
                  {activeRelease ? (
                    <div className="bg-surface rounded-2xl border border-border p-6">
                      <h2 className="text-lg font-bold text-text-primary mb-1">{activeRelease.title}</h2>
                      <p className="text-xs text-text-secondary mb-6">{activeRelease.tracks?.length || 0} canciones · Escucha exclusiva</p>
                      <ReleasePlayer release={activeRelease} />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-64 bg-surface rounded-2xl border border-border">
                      <p className="text-text-secondary text-sm">Selecciona un lanzamiento</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <Disc className="w-16 h-16 text-text-secondary/30 mb-4" />
                <h3 className="text-xl font-bold text-text-primary mb-2">Sin previews todavía</h3>
                <p className="text-text-secondary text-sm">Tu productor aún no ha publicado ningún lanzamiento.</p>
              </div>
            )}
          </div>
        )}


      </main>

      {/* Footer */}
      <footer className="mt-16 py-6">
        <div className="max-w-6xl mx-auto px-5 flex items-center justify-between">
        </div>
      </footer>
    </div>
  );
}
