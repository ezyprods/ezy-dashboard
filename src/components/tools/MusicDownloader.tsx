'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, Download, CheckCircle2, Play, Music, Search, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface YtdlTask {
  id: string;
  clientId?: string;
  url: string;
  resolvedUrl?: string;
  title: string;
  thumbnail?: string;
  platform?: string;
  status: 'analysing' | 'downloading' | 'converting' | 'completed' | 'error';
  progress: number;
  error?: string;
  startTime: number;
}

export function MusicDownloader() {
  const [clientId] = useState(() => Math.random().toString(36).substring(2, 15));
  const [downloadedTasks, setDownloadedTasks] = useState(new Set<string>());
  const [url, setUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [tasks, setTasks] = useState<YtdlTask[]>([]);
  const downloadedRef = useRef<Set<string>>(new Set());

  // Listen to SSE events for cross-tab or server-driven updates
  useEffect(() => {
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/tools/ytdl/events');
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'init' && Array.isArray(data.tasks)) {
            // MERGE server tasks with active client tasks (never wipe out in-flight client tasks)
            setTasks(prev => {
              const activeLocal = prev.filter(t => t.status === 'analysing' || t.status === 'downloading' || t.status === 'converting');
              const serverTaskIds = new Set(data.tasks.map((t: YtdlTask) => t.id));
              const merged = [...data.tasks];
              for (const local of activeLocal) {
                if (!serverTaskIds.has(local.id)) {
                  merged.push(local);
                }
              }
              return merged.sort((a: YtdlTask, b: YtdlTask) => b.startTime - a.startTime);
            });
          } else if (data.type === 'update' && data.task) {
            setTasks(prev => {
              const index = prev.findIndex(t => t.id === data.task.id);
              if (index === -1) return [data.task, ...prev];
              const newTasks = [...prev];
              newTasks[index] = data.task;
              return newTasks;
            });
          }
        } catch (e) {}
      };
    } catch (e) {}

    return () => {
      if (eventSource) eventSource.close();
    };
  }, []);

  const triggerDownload = (taskId: string, targetUrl: string, title: string) => {
    if (downloadedRef.current.has(taskId)) return;
    downloadedRef.current.add(taskId);
    setDownloadedTasks(prev => new Set(prev).add(taskId));

    const downloadUrl = `/api/tools/ytdl/file?taskId=${taskId}&url=${encodeURIComponent(targetUrl)}&title=${encodeURIComponent(title)}`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `${title}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Auto-download listener for tasks completed via SSE
  useEffect(() => {
    tasks.forEach(task => {
      if (task.status === 'completed' && task.clientId === clientId && !downloadedRef.current.has(task.id)) {
        triggerDownload(task.id, task.resolvedUrl || task.url, task.title);
      }
    });
  }, [tasks, clientId]);

  const handleSubmit = async (targetUrlOverride?: string) => {
    const inputUrl = (targetUrlOverride || url).trim();
    if (!inputUrl) return;

    if (!targetUrlOverride) {
      setUrl('');
    }
    setErrorMsg('');

    const taskId = Math.random().toString(36).substring(2, 15);
    const initialTask: YtdlTask = {
      id: taskId,
      clientId,
      url: inputUrl,
      title: inputUrl.startsWith('http') ? 'Analizando enlace...' : inputUrl,
      status: 'analysing',
      progress: 5,
      startTime: Date.now()
    };

    setTasks(prev => [initialTask, ...prev]);

    // Smooth simulated progress while waiting for backend response
    let currentProgress = 15;
    const progressInterval = setInterval(() => {
      currentProgress = Math.min(currentProgress + 8, 88);
      setTasks(prev => prev.map(t => {
        if (t.id === taskId && (t.status === 'downloading' || t.status === 'analysing')) {
          return {
            ...t,
            progress: Math.max(t.progress, currentProgress),
            status: currentProgress > 65 ? 'converting' : 'downloading'
          };
        }
        return t;
      }));
    }, 450);

    try {
      // Step 1: Fast Analyse (~50ms)
      const res = await fetch('/api/tools/ytdl/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: inputUrl })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al analizar el enlace');

      if (data.isPlaylist) {
        throw new Error('Las listas de reproducción completas no están soportadas aún en la versión web.');
      }

      const songTitle = data.title || inputUrl;
      const songUrl = data.resolvedUrl || inputUrl;

      // Update card title and thumbnail
      setTasks(prev => prev.map(t => t.id === taskId ? {
        ...t,
        title: songTitle,
        thumbnail: data.thumbnail,
        platform: data.platform,
        resolvedUrl: songUrl,
        status: 'downloading',
        progress: 25
      } : t));

      // Step 2: Process download in background
      const processRes = await fetch('/api/tools/ytdl/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, url: inputUrl, clientId, taskId })
      });

      const processData = await processRes.json();
      clearInterval(progressInterval);

      if (!processRes.ok) {
        throw new Error(processData.error || 'Error al procesar el archivo');
      }

      // Step 3: Complete task immediately and trigger download
      setTasks(prev => prev.map(t => t.id === taskId ? {
        ...t,
        status: 'completed',
        progress: 100
      } : t));

      triggerDownload(taskId, songUrl, songTitle);

    } catch (err: any) {
      clearInterval(progressInterval);
      setTasks(prev => prev.map(t => t.id === taskId ? {
        ...t,
        status: 'error',
        error: err.message || 'Error en descarga'
      } : t));
    }
  };

  const getPlatformBadge = (platform?: string) => {
    if (!platform) return null;
    switch(platform.toLowerCase()) {
      case 'spotify':
        return (
          <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold text-[11px] bg-emerald-500/10 px-2 py-0.5 rounded-md">
            Spotify
          </span>
        );
      case 'soundcloud':
        return (
          <span className="inline-flex items-center gap-1 text-orange-400 font-semibold text-[11px] bg-orange-500/10 px-2 py-0.5 rounded-md">
            SoundCloud
          </span>
        );
      case 'youtube':
        return (
          <span className="inline-flex items-center gap-1 text-red-400 font-semibold text-[11px] bg-red-500/10 px-2 py-0.5 rounded-md">
            YouTube
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-text-secondary font-semibold text-[11px] bg-surface-elevated px-2 py-0.5 rounded-md capitalize">
            {platform}
          </span>
        );
    }
  };

  const getStatusIcon = (task: YtdlTask) => {
    const targetUrl = `/api/tools/ytdl/file?taskId=${task.id}&url=${encodeURIComponent(task.resolvedUrl || task.url)}&title=${encodeURIComponent(task.title)}`;

    switch(task.status) {
      case 'downloading': return <Download className="w-5 h-5 text-blue-500 animate-pulse" />;
      case 'converting': return <RefreshCw className="w-5 h-5 text-purple-500 animate-spin" />;
      case 'completed':
        return (
          <a
            href={targetUrl}
            download={`${task.title}.mp3`}
            title="Descargar MP3"
            className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 font-bold text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <CheckCircle2 className="w-4 h-4" /> Bajar MP3
          </a>
        );
      case 'error': 
        return (
          <button
            type="button"
            title="Reintentar descarga"
            className="p-1.5 hover:bg-accent/10 rounded-lg text-accent transition-colors flex items-center gap-1 text-xs font-bold cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              handleSubmit(task.url);
            }}
          >
            <RefreshCw className="w-3.5 h-3.5" /> Reintentar
          </button>
        );
      default: return <Loader2 className="w-5 h-5 text-accent animate-spin" />;
    }
  };

  const getStatusText = (task: YtdlTask) => {
    switch(task.status) {
      case 'downloading': return `Descargando... ${task.progress.toFixed(0)}%`;
      case 'converting': return 'Convirtiendo a MP3 (320kbps)...';
      case 'completed': return 'Guardado en Descargas';
      case 'error': {
        const err = task.error || 'Error en la descarga';
        if (err.includes('Sign in to confirm') || err.includes('bot')) {
          return 'Error temporal del servidor. Reintenta en unos segundos.';
        }
        if (err.includes('not found') || err.includes('unavailable') || err.includes('404')) {
          return 'Audio no encontrado o no disponible.';
        }
        if (err.includes('private') || err.includes('login_required')) {
          return 'Este contenido es privado o requiere inicio de sesión.';
        }
        if (err.includes('Todos los motores')) {
          return 'Error al descargar. Reintenta en unos segundos.';
        }
        return err.length > 120 ? err.substring(0, 117) + '...' : err;
      }
      default: return 'Analizando...';
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto py-8 sm:py-12 flex flex-col items-center gap-8 relative">
      <div className="absolute top-0 left-0 w-full h-64 bg-accent/5 blur-[100px] rounded-full pointer-events-none" />
      
      {/* Cabecera y Buscador */}
      <div className="max-w-2xl w-full z-10 text-center space-y-6 bg-surface border border-border/50 rounded-2xl p-6 sm:p-8 shadow-2xl">
        <div>
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-accent/10 border border-accent/20 rounded-2xl flex items-center justify-center mx-auto mb-4 sm:mb-6">
            <Play className="w-6 h-6 sm:w-8 sm:h-8 text-accent" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-text-primary mb-2 sm:mb-3">SoundBox Cloud</h2>
          <p className="text-sm sm:text-base text-text-secondary">Descarga audios de <strong className="text-text-primary">YouTube</strong>, <strong className="text-emerald-400">Spotify</strong> y <strong className="text-orange-400">SoundCloud</strong> en segundo plano y conviértelos a MP3 (320K) automáticamente.</p>
        </div>

        <div className="glass p-1.5 sm:p-2 rounded-2xl border border-border flex flex-col sm:flex-row items-stretch sm:items-center gap-2 focus-within:border-accent/50 focus-within:ring-1 focus-within:ring-accent/50 transition-all">
          <input 
            type="text" 
            placeholder="Pega enlace de YouTube, Spotify, SoundCloud o busca..."
            value={url}
            onChange={e => {
              setUrl(e.target.value);
              if (errorMsg) setErrorMsg('');
            }}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            className="flex-1 min-w-0 bg-transparent border-none focus:outline-none text-text-primary px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base placeholder:text-text-secondary/50"
          />
          <Button 
            onClick={() => handleSubmit()}
            disabled={!url.trim()}
            className="rounded-xl px-4 sm:px-6 py-2 sm:py-3 font-bold shrink-0 whitespace-nowrap w-full sm:w-auto"
          >
            <Search className="w-4 h-4 mr-2" /> Buscar y Bajar
          </Button>
        </div>

        {errorMsg && <p className="text-sm text-danger font-medium animate-in fade-in slide-in-from-top-2">{errorMsg}</p>}
      </div>

      {/* Lista de Tareas */}
      {tasks.length > 0 && (
        <div className="w-full max-w-3xl flex flex-col gap-3 z-10 animate-in fade-in">
          <div className="flex items-center justify-between mb-2 px-1">
            <h3 className="text-lg font-bold text-text-primary">Centro de Descargas</h3>
            <span className="text-sm font-medium text-text-secondary bg-surface-elevated px-3 py-1 rounded-full">
              {tasks.filter(t => t.status === 'downloading' || t.status === 'converting' || t.status === 'analysing').length} activas
            </span>
          </div>
          
          {tasks.map(task => (
            <div key={task.id} className="glass bg-surface/50 p-3 sm:p-4 rounded-xl flex items-center gap-4 border border-border/50 relative overflow-hidden transition-all duration-300">
              {/* Barra de progreso de fondo */}
              {(task.status === 'downloading' || task.status === 'converting' || task.status === 'completed') && (
                <div 
                  className={`absolute left-0 top-0 bottom-0 opacity-10 transition-all duration-300 ${task.status === 'completed' ? 'bg-emerald-500 w-full' : 'bg-accent'}`}
                  style={{ width: task.status !== 'completed' ? `${task.progress}%` : undefined }}
                />
              )}
              
              {task.thumbnail ? (
                <img src={task.thumbnail} alt="thumbnail" className="w-12 h-12 sm:w-14 sm:h-14 object-cover rounded-lg border border-border/50 z-10 shadow-md" />
              ) : (
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-surface-elevated flex items-center justify-center rounded-lg z-10 shadow-md">
                  <Music className="w-5 h-5 sm:w-6 sm:h-6 text-text-secondary" />
                </div>
              )}
              
              <div className="flex-1 min-w-0 z-10">
                <h4 className="font-bold text-sm sm:text-base text-text-primary line-clamp-1">{task.title}</h4>
                <div className="flex items-center gap-2 mt-1 text-[11px] sm:text-xs font-medium">
                  {getPlatformBadge(task.platform)}
                  {task.platform && <span className="text-text-secondary/50">•</span>}
                  <span className={`${task.status === 'error' ? 'text-danger' : (task.status === 'completed' ? 'text-emerald-500' : 'text-accent')}`}>
                    {getStatusText(task)}
                  </span>
                </div>
              </div>

              <div className="pl-3 sm:pl-4 border-l border-border/50 z-10 flex flex-col items-center justify-center">
                {getStatusIcon(task)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
