'use client';

import { useState, useEffect } from 'react';
import { Loader2, Download, CheckCircle2, AlertCircle, Play, Music, Globe, Search, RefreshCw, ExternalLink } from 'lucide-react';
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

function getYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  return match ? match[1] : null;
}

export function MusicDownloader() {
  const [clientId] = useState(() => Math.random().toString(36).substring(2, 15));
  const [downloadedTasks, setDownloadedTasks] = useState(new Set<string>());
  const [url, setUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [tasks, setTasks] = useState<YtdlTask[]>([]);

  useEffect(() => {
    const eventSource = new EventSource('/api/tools/ytdl/events');
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'init') {
          setTasks(data.tasks.sort((a: YtdlTask, b: YtdlTask) => b.startTime - a.startTime));
        } else if (data.type === 'update') {
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

    return () => eventSource.close();
  }, []);

  // Auto-descargar cuando una tarea se completa legítimamente en el servidor
  useEffect(() => {
    tasks.forEach(task => {
      if (task.status === 'completed' && task.clientId === clientId && !downloadedTasks.has(task.id)) {
        setDownloadedTasks(prev => new Set(prev).add(task.id));
        const downloadUrl = `/api/tools/ytdl/file?taskId=${task.id}&url=${encodeURIComponent(task.resolvedUrl || task.url)}&title=${encodeURIComponent(task.title)}`;
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `${task.title}.mp3`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    });
  }, [tasks, clientId, downloadedTasks]);

  const handleSubmit = async () => {
    const inputUrl = url.trim();
    if (!inputUrl) return;

    setUrl('');
    setErrorMsg('');

    const taskId = Math.random().toString(36).substring(2, 15);
    const initialTask: YtdlTask = {
      id: taskId,
      clientId,
      url: inputUrl,
      title: inputUrl.startsWith('http') ? 'Analizando enlace...' : inputUrl,
      status: 'analysing',
      progress: 0,
      startTime: Date.now()
    };

    setTasks(prev => [initialTask, ...prev]);

    try {
      // Step 1: Fast Analyse (~50ms via oEmbed)
      const res = await fetch('/api/tools/ytdl/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: inputUrl })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al analizar el enlace');

      if (data.isPlaylist) {
        throw new Error('Las listas de reproducción no están soportadas aún en la versión web.');
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
        progress: 10
      } : t));

      // Step 2: Process download in background
      const processRes = await fetch('/api/tools/ytdl/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, url: inputUrl, clientId, taskId })
      });

      const processData = await processRes.json();
      if (!processRes.ok) {
        throw new Error(processData.error || 'Error al procesar el archivo');
      }

    } catch (err: any) {
      setTasks(prev => prev.map(t => t.id === taskId ? {
        ...t,
        status: 'error',
        error: err.message || 'Error en descarga'
      } : t));
    }
  };

  const getStatusIcon = (task: YtdlTask) => {
    const targetUrl = `/api/tools/ytdl/file?taskId=${task.id}&url=${encodeURIComponent(task.resolvedUrl || task.url)}&title=${encodeURIComponent(task.title)}`;
    const ytId = getYouTubeId(task.resolvedUrl || task.url);

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
          <div className="flex items-center gap-1.5">
            <a
              href={targetUrl}
              download={`${task.title}.mp3`}
              title="Reintentar descarga"
              className="p-1.5 hover:bg-accent/10 rounded-lg text-accent transition-colors flex items-center gap-1 text-xs font-bold cursor-pointer"
              onClick={(e) => e.stopPropagation()}
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reintentar
            </a>
            {ytId && (
              <a
                href={`https://cobalt.tools/?url=https://www.youtube.com/watch?v=${ytId}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Abrir en servidor espejo alternativo"
                className="p-1.5 bg-accent/10 hover:bg-accent/20 text-accent rounded-lg transition-colors flex items-center gap-1 text-xs font-bold"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="w-3.5 h-3.5" /> Espejo
              </a>
            )}
          </div>
        );
      default: return <Loader2 className="w-5 h-5 text-accent animate-spin" />;
    }
  };

  const getStatusText = (task: YtdlTask) => {
    switch(task.status) {
      case 'downloading': return `Descargando... ${task.progress.toFixed(0)}%`;
      case 'converting': return 'Convirtiendo a MP3 (320kbps)...';
      case 'completed': return 'Listo para descargar';
      case 'error': {
        if (task.error?.includes('bot') || task.error?.includes('Sign in')) {
          return 'Bloqueo temporal de YouTube en servidores cloud. Usa el botón "Espejo".';
        }
        return task.error || 'Error';
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
          <p className="text-sm sm:text-base text-text-secondary">Descarga audios en segundo plano y conviértelos a MP3 (320K) automáticamente. Pega varios enlaces para descargar simultáneamente.</p>
        </div>

        <div className="glass p-1.5 sm:p-2 rounded-2xl border border-border flex flex-col sm:flex-row items-stretch sm:items-center gap-2 focus-within:border-accent/50 focus-within:ring-1 focus-within:ring-accent/50 transition-all">
          <input 
            type="text" 
            placeholder="Pega el enlace o busca por nombre..."
            value={url}
            onChange={e => {
              setUrl(e.target.value);
              if (errorMsg) setErrorMsg('');
            }}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            className="flex-1 min-w-0 bg-transparent border-none focus:outline-none text-text-primary px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base placeholder:text-text-secondary/50"
          />
          <Button 
            onClick={handleSubmit}
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
                  {task.platform && (
                    <span className="flex items-center gap-1 text-text-secondary">
                      <Globe className="w-3.5 h-3.5" /> <span className="capitalize">{task.platform}</span>
                    </span>
                  )}
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
