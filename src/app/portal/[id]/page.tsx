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
            className={`p-2 rounded-full transition-colors ${currentTrackIndex === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/10 text-text-secondary hover:text-text-primary'}`}
          >
            <SkipBack className="w-5 h-5" />
          </button>
          <button
            onClick={() => setIsPlaying(prev => !prev)}
            className="w-12 h-12 bg-accent hover:bg-accent/90 text-white rounded-full flex items-center justify-center shadow-lg shadow-accent/30 transition-all hover:scale-105 active:scale-95"
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
          </button>
          <button
            onClick={() => currentTrackIndex < release.tracks.length - 1 && playTrack(currentTrackIndex + 1)}
            className={`p-2 rounded-full transition-colors ${currentTrackIndex === release.tracks.length - 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/10 text-text-secondary hover:text-text-primary'}`}
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

// ─── Feedback Form ────────────────────────────────────────────────────────────
function FeedbackPanel({ artistId, artistName }: { artistId: string; artistName: string }) {
  const [message, setMessage] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (!message.trim() || !authorName.trim()) return;
    setIsSending(true);
    try {
      const res = await fetch(`/api/portal/${artistId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, authorName })
      });
      if (!res.ok) throw new Error('Error');
      setSent(true);
      setMessage('');
    } catch {
      // ignore
    } finally {
      setIsSending(false);
    }
  };

  if (sent) {
    return (
      <div className="glass rounded-2xl border border-success/20 p-6 text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-6 h-6 text-success" />
        </div>
        <h4 className="font-bold text-text-primary">¡Mensaje enviado!</h4>
        <p className="text-sm text-text-secondary">Tu productor recibirá tu feedback.</p>
        <button
          onClick={() => setSent(false)}
          className="text-xs text-accent hover:text-accent-light transition-colors font-medium"
        >
          Enviar otro mensaje
        </button>
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl border border-border p-5 space-y-4">
      <div className="flex items-center gap-2 border-b border-border/50 pb-3">
        <MessageSquare className="w-4 h-4 text-accent" />
        <h3 className="font-bold text-sm text-text-primary uppercase tracking-wider">Enviar Feedback</h3>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-text-secondary font-medium mb-1.5">Tu nombre</label>
          <input
            type="text"
            value={authorName}
            onChange={e => setAuthorName(e.target.value)}
            placeholder={artistName}
            className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-accent transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs text-text-secondary font-medium mb-1.5">Tu mensaje</label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Cuéntame qué te parece, correcciones, ideas..."
            rows={4}
            className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-accent transition-colors resize-none"
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={!message.trim() || !authorName.trim() || isSending}
          className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent/90 text-white font-semibold text-sm py-2.5 rounded-xl transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {isSending ? 'Enviando...' : 'Enviar Feedback'}
        </button>
      </div>
    </div>
  );
}

// ─── Main Portal Page ─────────────────────────────────────────────────────────
export default function PortalPage() {
  const params = useParams();
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [activeReleaseId, setActiveReleaseId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<'overview' | 'releases' | 'feedback'>('overview');

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
      <div className="min-h-screen bg-[#0a0a0f] flex justify-center items-center">
        <div className="text-center space-y-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto">
              <Sparkles className="w-8 h-8 text-accent animate-pulse" />
            </div>
          </div>
          <p className="text-xs text-[#8888a0] font-medium tracking-widest uppercase">Cargando Portal...</p>
        </div>
      </div>
    );
  }

  if (!data || data.error) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-[#f0f0f5] flex justify-center items-center p-6">
        <div className="max-w-md w-full p-8 rounded-2xl border border-red-500/20 bg-red-500/5 text-center space-y-4 backdrop-blur-xl">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <h1 className="text-2xl font-bold">Portal no disponible</h1>
          <p className="text-[#8888a0] text-sm">El enlace no es válido, ha caducado o el artista no está configurado.</p>
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

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#f0f0f5] font-sans antialiased selection:bg-[#6c5ce7]/30">
      {/* Ambient glow */}
      <div className="fixed top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#6c5ce7]/8 to-transparent pointer-events-none z-0" />
      <div className="fixed top-40 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[#6c5ce7]/5 blur-[100px] rounded-full pointer-events-none z-0" />

      {/* Header */}
      <header className="border-b border-white/5 bg-[#0d0d14]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-5 py-3.5 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#6c5ce7]/15 flex items-center justify-center border border-[#6c5ce7]/25">
              <Sparkles className="w-4.5 h-4.5 text-[#a29bfe]" />
            </div>
            <div>
              <p className="text-[9px] text-[#6c5ce7] font-bold uppercase tracking-[0.15em]">{data.producerName || 'EZY Studio'}</p>
              <h1 className="text-sm font-bold text-white leading-tight">Portal de {data.artist.name}</h1>
            </div>
          </div>

          {/* Nav tabs */}
          <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1">
            {[
              { key: 'overview', label: 'Overview', icon: TrendingUp },
              ...(data.releases?.length > 0 ? [{ key: 'releases', label: 'Previews', icon: ListMusic }] : []),
              { key: 'feedback', label: 'Feedback', icon: MessageSquare },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveSection(key as any)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeSection === key
                    ? 'bg-[#6c5ce7] text-white shadow-lg shadow-[#6c5ce7]/20'
                    : 'text-[#8888a0] hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:block">{label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs text-[#8888a0] px-3 py-1.5 rounded-full bg-white/5 border border-white/8">
            <div className="w-1.5 h-1.5 rounded-full bg-[#00b894] animate-pulse" />
            <span className="font-medium hidden sm:block">Seguro</span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 py-8 relative z-10">

        {/* ── OVERVIEW SECTION ── */}
        {activeSection === 'overview' && (
          <div className="space-y-6 animate-fade-in">
            {/* Stats row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[#13131a] border border-white/8 rounded-2xl p-4">
                <p className="text-xs text-[#8888a0] font-medium mb-2 flex items-center gap-1.5"><Music className="w-3.5 h-3.5" /> Proyectos</p>
                <p className="text-2xl font-black text-white">{data.projects.length}</p>
                <p className="text-[10px] text-[#8888a0] mt-0.5">activos</p>
              </div>
              <div className="bg-[#13131a] border border-white/8 rounded-2xl p-4">
                <p className="text-xs text-[#8888a0] font-medium mb-2 flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" /> Progreso</p>
                <p className="text-2xl font-black text-[#a29bfe]">{progressPercent}%</p>
                <p className="text-[10px] text-[#8888a0] mt-0.5">{completedTasks}/{totalTasks} tareas</p>
              </div>
              {data.finances && (
                <>
                  <div className="bg-[#13131a] border border-white/8 rounded-2xl p-4">
                    <p className="text-xs text-[#8888a0] font-medium mb-2 flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5" /> Pagado</p>
                    <p className="text-2xl font-black text-[#00b894]">{data.finances.totalPaid}€</p>
                    <p className="text-[10px] text-[#8888a0] mt-0.5">de {data.finances.totalBudget}€</p>
                  </div>
                  <div className="bg-[#13131a] border border-white/8 rounded-2xl p-4">
                    <p className="text-xs text-[#8888a0] font-medium mb-2 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" /> Pendiente</p>
                    <p className={`text-2xl font-black ${data.finances.pendingPayment > 0 ? 'text-[#fdcb6e]' : 'text-[#00b894]'}`}>
                      {data.finances.pendingPayment}€
                    </p>
                    <p className="text-[10px] text-[#8888a0] mt-0.5">{data.finances.pendingPayment > 0 ? 'por liquidar' : '¡al día!'}</p>
                  </div>
                </>
              )}
            </div>

            {/* Main grid of modules */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {visibleModules.map((mod: any) => {
                // ─── Projects module ───────────────────────────────────────
                if (mod.type === 'projects') {
                  return (
                    <div key={mod.id} className="bg-[#13131a] rounded-2xl border border-white/8 p-5 space-y-3">
                      <div className="flex items-center gap-2 pb-3 border-b border-white/5">
                        <Music className="w-4 h-4 text-[#a29bfe]" />
                        <h3 className="text-xs font-bold text-[#8888a0] uppercase tracking-widest">{mod.title || 'Tus Proyectos'}</h3>
                      </div>
                      {data.projects.length === 0 ? (
                        <p className="text-sm text-[#8888a0] italic py-4 text-center">No hay proyectos activos.</p>
                      ) : (
                        <div className="space-y-2">
                          {data.projects.map((project: any) => {
                            const isActive = project.id === selectedProjectId;
                            const pTasks = project.tasks?.length || 0;
                            const pDone = project.tasks?.filter((t: any) => t.status === 'completed').length || 0;
                            const pPct = pTasks > 0 ? Math.round((pDone / pTasks) * 100) : 0;
                            return (
                              <button
                                key={project.id}
                                onClick={() => setSelectedProjectId(project.id)}
                                className={`w-full text-left p-3 rounded-xl border transition-all duration-200 ${
                                  isActive
                                    ? 'border-[#6c5ce7]/40 bg-[#6c5ce7]/10'
                                    : 'border-white/6 bg-white/3 hover:border-white/12 hover:bg-white/5'
                                }`}
                              >
                                <div className="flex justify-between items-start gap-2 mb-2">
                                  <span className="font-bold text-sm text-white truncate">{project.title}</span>
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${
                                    project.status === 'active' ? 'bg-[#6c5ce7]/20 text-[#a29bfe]' : 'bg-[#00b894]/20 text-[#00b894]'
                                  }`}>
                                    {project.status === 'active' ? 'En curso' : 'Terminado'}
                                  </span>
                                </div>
                                {pTasks > 0 && (
                                  <div>
                                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                      <div className="h-full bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] rounded-full transition-all" style={{ width: `${pPct}%` }} />
                                    </div>
                                    <p className="text-[10px] text-[#8888a0] mt-1">{pDone}/{pTasks} tareas · {pPct}%</p>
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }

                // ─── Tasks module ──────────────────────────────────────────
                if (mod.type === 'tasks') {
                  if (!activeProject) return null;
                  return (
                    <div key={mod.id} className="bg-[#13131a] rounded-2xl border border-white/8 p-5 flex flex-col gap-4">
                      <div className="flex items-center gap-2 pb-3 border-b border-white/5">
                        <CheckCircle2 className="w-4 h-4 text-[#a29bfe]" />
                        <h3 className="text-xs font-bold text-[#8888a0] uppercase tracking-widest">{mod.title || 'Estado del Trabajo'}</h3>
                      </div>

                      {/* Progress ring */}
                      {totalTasks > 0 && (
                        <div className="flex items-center gap-4 mb-1">
                          <div className="relative w-14 h-14 shrink-0">
                            <svg className="w-full h-full -rotate-90" viewBox="0 0 56 56">
                              <circle cx="28" cy="28" r="22" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
                              <circle
                                cx="28" cy="28" r="22" fill="none"
                                stroke="url(#progressGrad)" strokeWidth="6"
                                strokeLinecap="round"
                                strokeDasharray={`${2 * Math.PI * 22}`}
                                strokeDashoffset={`${2 * Math.PI * 22 * (1 - progressPercent / 100)}`}
                                className="transition-all duration-1000"
                              />
                              <defs>
                                <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                  <stop offset="0%" stopColor="#6c5ce7" />
                                  <stop offset="100%" stopColor="#a29bfe" />
                                </linearGradient>
                              </defs>
                            </svg>
                            <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-white">{progressPercent}%</span>
                          </div>
                          <div>
                            <p className="text-white font-bold">{completedTasks} completadas</p>
                            <p className="text-xs text-[#8888a0]">{totalTasks - completedTasks} pendientes</p>
                          </div>
                        </div>
                      )}

                      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                        {activeProject.tasks && activeProject.tasks.length > 0 ? (
                          activeProject.tasks.map((task: any) => {
                            const isCompleted = task.status === 'completed';
                            return (
                              <div
                                key={task.id}
                                className={`flex items-center gap-3 p-2.5 rounded-xl border transition-colors ${
                                  isCompleted
                                    ? 'bg-[#00b894]/8 border-[#00b894]/15 text-[#8888a0]'
                                    : 'bg-white/3 border-white/6 text-white'
                                }`}
                              >
                                <div className="shrink-0">
                                  {isCompleted
                                    ? <CheckCircle2 className="w-4 h-4 text-[#00b894]" />
                                    : <Circle className="w-4 h-4 text-[#8888a0]/40" />
                                  }
                                </div>
                                <span className={`text-xs font-semibold leading-normal ${isCompleted ? 'line-through opacity-60' : ''}`}>
                                  {task.title}
                                </span>
                              </div>
                            );
                          })
                        ) : (
                          <div className="py-8 text-center">
                            <p className="text-xs text-[#8888a0] italic">No hay tareas configuradas.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                // ─── Bounces / Audios module ───────────────────────────────
                if (mod.type === 'bounces') {
                  if (!activeProject) return null;
                  return (
                    <div key={mod.id} className="bg-[#13131a] rounded-2xl border border-white/8 p-5 flex flex-col gap-4 lg:col-span-2">
                      <div className="flex items-center justify-between pb-3 border-b border-white/5">
                        <div className="flex items-center gap-2">
                          <Headphones className="w-4 h-4 text-[#a29bfe]" />
                          <h3 className="text-xs font-bold text-[#8888a0] uppercase tracking-widest">{mod.title || 'Últimas Mezclas / Audios'}</h3>
                        </div>
                        {paywallLocked && (
                          <div className="flex items-center gap-1.5 text-[10px] text-[#fdcb6e] bg-[#fdcb6e]/10 border border-[#fdcb6e]/20 px-2.5 py-1 rounded-full font-semibold">
                            <Lock className="w-3 h-3" /> Descarga bloqueada
                          </div>
                        )}
                      </div>

                      {activeProject.bounces && activeProject.bounces.length > 0 ? (
                        <div className="space-y-3">
                          {activeProject.bounces.map((file: any) => (
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
                        <div className="flex flex-col items-center justify-center py-12 text-center bg-white/2 rounded-xl border border-dashed border-white/8">
                          <Music className="w-8 h-8 text-[#8888a0] opacity-40 mb-2" />
                          <p className="text-xs text-[#8888a0] italic">No hay audios disponibles para este proyecto.</p>
                        </div>
                      )}
                    </div>
                  );
                }

                // ─── Finances module ───────────────────────────────────────
                if (mod.type === 'finances') {
                  if (!data.finances) return null;
                  const pct = data.finances.totalBudget > 0
                    ? Math.round((data.finances.totalPaid / data.finances.totalBudget) * 100)
                    : 0;
                  return (
                    <div key={mod.id} className="bg-[#13131a] rounded-2xl border border-white/8 p-5 space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-white/5">
                        <div className="flex items-center gap-2">
                          <CreditCard className="w-4 h-4 text-[#a29bfe]" />
                          <h3 className="text-xs font-bold text-[#8888a0] uppercase tracking-widest">{mod.title || 'Resumen Financiero'}</h3>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-[#8888a0]">Presupuesto Total</span>
                          <span className="font-bold text-sm text-white">{data.finances.totalBudget}€</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-[#8888a0]">Total Abonado</span>
                          <span className="font-bold text-sm text-[#00b894]">{data.finances.totalPaid}€</span>
                        </div>

                        {/* Payment progress bar */}
                        <div className="pt-1">
                          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-[#00b894] to-[#00cec9] rounded-full transition-all duration-1000"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-[#8888a0] mt-1 text-right">{pct}% liquidado</p>
                        </div>

                        <div className={`flex justify-between items-center pt-3 border-t border-white/5 ${data.finances.pendingPayment > 0 ? '' : ''}`}>
                          <span className="text-sm font-semibold text-white">Pendiente</span>
                          <span className={`text-xl font-black ${data.finances.pendingPayment > 0 ? 'text-[#fdcb6e]' : 'text-[#00b894]'}`}>
                            {data.finances.pendingPayment}€
                          </span>
                        </div>
                        {data.finances.pendingPayment > 0 && (
                          <p className="text-[10px] text-[#fdcb6e] flex items-center gap-1.5 bg-[#fdcb6e]/8 border border-[#fdcb6e]/15 p-2.5 rounded-xl">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            Listo para facturación y cobro final.
                          </p>
                        )}
                      </div>
                    </div>
                  );
                }

                // ─── Releases module (quick preview) ──────────────────────
                if (mod.type === 'releases') {
                  if (!data.releases || data.releases.length === 0) return null;
                  return (
                    <div key={mod.id} className="bg-[#13131a] rounded-2xl border border-white/8 p-5 space-y-3">
                      <div className="flex items-center justify-between pb-3 border-b border-white/5">
                        <div className="flex items-center gap-2">
                          <Disc className="w-4 h-4 text-[#a29bfe]" />
                          <h3 className="text-xs font-bold text-[#8888a0] uppercase tracking-widest">{mod.title || 'Previews'}</h3>
                        </div>
                        <button
                          onClick={() => setActiveSection('releases')}
                          className="text-[10px] text-[#6c5ce7] hover:text-[#a29bfe] font-semibold flex items-center gap-1 transition-colors"
                        >
                          Ver todas <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="space-y-2">
                        {data.releases.slice(0, 3).map((r: any) => (
                          <button
                            key={r.id}
                            onClick={() => { setActiveReleaseId(r.id); setActiveSection('releases'); }}
                            className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-white/5 hover:border-[#6c5ce7]/30 hover:bg-[#6c5ce7]/5 transition-all text-left group"
                          >
                            <div className="w-10 h-10 rounded-lg overflow-hidden bg-surface border border-white/8 flex items-center justify-center shrink-0">
                              {r.coverArtId
                                ? <img src={`/api/audio/${r.coverArtId}`} alt="" className="w-full h-full object-cover" />
                                : <Disc className="w-5 h-5 text-[#8888a0]/40" />
                              }
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-white truncate">{r.title}</p>
                              <p className="text-[10px] text-[#8888a0]">{r.tracks?.length || 0} canciones</p>
                            </div>
                            <Play className="w-4 h-4 text-[#6c5ce7] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                }

                return null;
              })}
            </div>

            {/* Shared Matrices */}
            {data.sharedMatrices && data.sharedMatrices.length > 0 && (
              <div className="space-y-4 mt-2">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#a29bfe]" />
                  Estado de la Producción
                </h2>
                <div className="space-y-5">
                  {data.sharedMatrices.map((matrix: any) => (
                    <div key={matrix.id} className="bg-[#13131a] rounded-2xl border border-white/8 p-5 overflow-hidden">
                      <h3 className="text-xs font-bold text-[#8888a0] uppercase tracking-widest mb-4">{matrix.name}</h3>
                      <div className="overflow-x-auto bg-white/2 rounded-xl border border-white/5">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-white/8 bg-white/3">
                              <th className="p-3 text-[#8888a0] font-bold">Canción / Track</th>
                              {matrix.productionGrid?.columns?.map((col: any) => (
                                <th key={col.id} className="p-3 text-[#8888a0] font-bold text-center">{col.name}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {matrix.productionGrid?.rows?.map((row: any) => (
                              <tr key={row.id} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                                <td className="p-3 font-semibold text-white">{row.name}</td>
                                {matrix.productionGrid?.columns?.map((col: any) => {
                                  const cell = row.cells?.[col.id] || {};
                                  const status = cell.status || 'todo';
                                  const statusStyles: Record<string, string> = {
                                    todo: 'bg-white/5 border-white/10 text-[#8888a0]',
                                    in_progress: 'bg-[#6c5ce7]/15 border-[#6c5ce7]/30 text-[#a29bfe]',
                                    review: 'bg-[#fdcb6e]/15 border-[#fdcb6e]/30 text-[#fdcb6e]',
                                    done: 'bg-[#00b894]/15 border-[#00b894]/30 text-[#00b894]'
                                  };
                                  const statusLabels: Record<string, string> = {
                                    todo: 'Pendiente', in_progress: 'En progreso',
                                    review: 'Revisión', done: 'Hecho'
                                  };
                                  return (
                                    <td key={col.id} className="p-3 text-center">
                                      <span className={`px-2.5 py-1 rounded-full border text-[10px] font-bold ${statusStyles[status] || statusStyles.todo}`}>
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
        )}

        {/* ── RELEASES / PREVIEWS SECTION ── */}
        {activeSection === 'releases' && (
          <div className="animate-fade-in">
            {data.releases && data.releases.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Release list */}
                <div className="space-y-3">
                  <h2 className="text-sm font-bold text-[#8888a0] uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Disc className="w-4 h-4" /> Lanzamientos
                  </h2>
                  {data.releases.map((r: any) => (
                    <button
                      key={r.id}
                      onClick={() => setActiveReleaseId(r.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                        activeReleaseId === r.id
                          ? 'border-[#6c5ce7]/40 bg-[#6c5ce7]/10'
                          : 'border-white/6 bg-white/2 hover:border-white/12 hover:bg-white/4'
                      }`}
                    >
                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-[#1a1a25] border border-white/8 flex items-center justify-center shrink-0">
                        {r.coverArtId
                          ? <img src={`/api/audio/${r.coverArtId}`} alt="" className="w-full h-full object-cover" />
                          : <Disc className="w-6 h-6 text-[#8888a0]/30" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-white text-sm truncate">{r.title}</p>
                        <p className="text-[10px] text-[#8888a0] mt-0.5">{r.tracks?.length || 0} canciones</p>
                      </div>
                      {activeReleaseId === r.id && <ChevronRight className="w-4 h-4 text-[#6c5ce7] shrink-0" />}
                    </button>
                  ))}
                </div>

                {/* Player */}
                <div className="lg:col-span-2">
                  {activeRelease ? (
                    <div className="bg-[#13131a] rounded-2xl border border-white/8 p-6">
                      <h2 className="text-lg font-bold text-white mb-1">{activeRelease.title}</h2>
                      <p className="text-xs text-[#8888a0] mb-6">{activeRelease.tracks?.length || 0} canciones · Escucha exclusiva</p>
                      <ReleasePlayer release={activeRelease} />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-64 bg-[#13131a] rounded-2xl border border-white/8">
                      <p className="text-[#8888a0] text-sm">Selecciona un lanzamiento</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <Disc className="w-16 h-16 text-[#8888a0]/30 mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">Sin previews todavía</h3>
                <p className="text-[#8888a0] text-sm">Tu productor aún no ha publicado ningún lanzamiento.</p>
              </div>
            )}
          </div>
        )}

        {/* ── FEEDBACK SECTION ── */}
        {activeSection === 'feedback' && (
          <div className="animate-fade-in max-w-2xl mx-auto">
            <div className="mb-8 text-center">
              <h2 className="text-2xl font-bold text-white mb-2">Enviar Feedback</h2>
              <p className="text-[#8888a0] text-sm">¿Tienes alguna corrección, idea o comentario? Tu productor lo recibirá directamente.</p>
            </div>
            <FeedbackPanel artistId={params.id as string} artistName={data.artist.name} />

            {/* Info cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
              {[
                { icon: MessageSquare, title: 'Comunicación directa', desc: 'Tu mensaje llega directamente al productor' },
                { icon: Clock, title: 'Respuesta rápida', desc: 'Se revisará en la próxima sesión' },
                { icon: Star, title: 'Tu opinión importa', desc: 'El feedback mejora el resultado final' },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="bg-[#13131a] border border-white/8 rounded-2xl p-4 text-center">
                  <div className="w-10 h-10 rounded-xl bg-[#6c5ce7]/10 flex items-center justify-center mx-auto mb-3">
                    <Icon className="w-5 h-5 text-[#a29bfe]" />
                  </div>
                  <h4 className="font-bold text-white text-sm mb-1">{title}</h4>
                  <p className="text-[10px] text-[#8888a0]">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-16 border-t border-white/5 py-6">
        <div className="max-w-6xl mx-auto px-5 flex items-center justify-between">
          <p className="text-xs text-[#8888a0]">
            Portal seguro por <span className="text-[#6c5ce7] font-semibold">{data.producerName || 'EZY Studio'}</span>
          </p>
          <p className="text-xs text-[#8888a0]/50">Powered by EZY Dashboard</p>
        </div>
      </footer>
    </div>
  );
}
