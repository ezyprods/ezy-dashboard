'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Loader2,
  Download,
  CheckCircle2,
  Play,
  Music,
  Search,
  RefreshCw,
  ListMusic,
  Check,
  X,
  Sliders,
  ClipboardPaste,
  Sparkles,
  Edit3,
  Volume2,
  Scissors,
  Settings2,
  ChevronDown,
  ChevronUp,
  Heart,
  Library,
  Lock,
  LogOut,
  TriangleAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';

interface YtdlTask {
  id: string;
  clientId?: string;
  url: string;
  resolvedUrl?: string;
  title: string;
  thumbnail?: string;
  platform?: string;
  format?: string;
  quality?: string;
  status: 'analysing' | 'downloading' | 'converting' | 'completed' | 'error';
  progress: number;
  error?: string;
  startTime: number;
}

interface PlaylistTrackItem {
  videoId: string;
  url: string;
  title: string;
  thumbnail: string;
  duration?: string;
}

interface PlaylistPromptData {
  type: 'pure_playlist' | 'video_with_playlist';
  singleVideo?: {
    title: string;
    thumbnail: string;
    resolvedUrl: string;
    platform: string;
  };
  playlist: {
    id: string;
    title: string;
    trackCount: number;
    thumbnail?: string;
    tracks: PlaylistTrackItem[];
    /** Spotify only let us read part of it (see limitReason). */
    isTruncated?: boolean;
    limitReason?: 'connect' | 'not_owner' | null;
  };
  originalTaskId?: string;
}

interface SpotifyStatus {
  configured: boolean;
  connected: boolean;
  displayName: string | null;
}

interface MySpotifyPlaylist {
  id: string;
  name: string;
  url: string;
  thumbnail: string;
  trackCount: number | null;
  owner: string;
  fullAccess: boolean;
}

interface CustomConfirmData {
  url: string;
  resolvedUrl: string;
  title: string;
  thumbnail?: string;
  platform: string;
}

export function MusicDownloader() {
  const [clientId] = useState(() => Math.random().toString(36).substring(2, 15));
  const [url, setUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [tasks, setTasks] = useState<YtdlTask[]>([]);
  const [playlistPrompt, setPlaylistPrompt] = useState<PlaylistPromptData | null>(null);
  const [customConfirm, setCustomConfirm] = useState<CustomConfirmData | null>(null);
  const [customTitleInput, setCustomTitleInput] = useState('');
  const [isAnalysingCustom, setIsAnalysingCustom] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  // Settings state (matching yt-to-mp3-local capabilities)
  const [audioFormat, setAudioFormat] = useState<'mp3' | 'wav' | 'flac' | 'm4a'>('mp3');
  const [audioQuality, setAudioQuality] = useState<'320' | '256' | '192' | '128'>('320');
  const [namingMode, setNamingMode] = useState<'auto' | 'custom'>('auto');
  const [normalizeVolume, setNormalizeVolume] = useState(false);
  const [trimSilence, setTrimSilence] = useState(false);

  const downloadedRef = useRef<Set<string>>(new Set());

  // Spotify account connection (needed to read full playlists & Liked Songs)
  const [spotify, setSpotify] = useState<SpotifyStatus | null>(null);
  const [myPlaylists, setMyPlaylists] = useState<MySpotifyPlaylist[] | null>(null);
  const [showMyPlaylists, setShowMyPlaylists] = useState(false);
  const [loadingMyPlaylists, setLoadingMyPlaylists] = useState(false);

  const refreshSpotifyStatus = async () => {
    try {
      const res = await fetch('/api/spotify/session', { cache: 'no-store' });
      if (res.ok) setSpotify(await res.json());
    } catch (e) {}
  };

  useEffect(() => {
    refreshSpotifyStatus();
  }, []);

  const connectSpotify = () => {
    window.location.href = '/api/spotify/login';
  };

  const disconnectSpotify = async () => {
    await fetch('/api/spotify/session', { method: 'DELETE' });
    setMyPlaylists(null);
    setShowMyPlaylists(false);
    await refreshSpotifyStatus();
    toast.success('Spotify desconectado');
  };

  const openMyPlaylists = async () => {
    setShowMyPlaylists(true);
    if (myPlaylists) return;
    setLoadingMyPlaylists(true);
    try {
      const res = await fetch('/api/spotify/playlists', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudieron cargar tus playlists');
      setMyPlaylists(data.playlists);
    } catch (e: any) {
      toast.error(e.message);
      setShowMyPlaylists(false);
      await refreshSpotifyStatus();
    } finally {
      setLoadingMyPlaylists(false);
    }
  };

  // Listen to SSE events for cross-tab or server-driven updates
  useEffect(() => {
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/tools/ytdl/events');
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'init' && Array.isArray(data.tasks)) {
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

  // Ids whose file could not be saved even after retries (shown with a retry button).
  const [failedFiles, setFailedFiles] = useState<Set<string>>(new Set());

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  // Fetches the file ourselves (with retries) and saves it from a blob. A plain
  // <a href> download is handed to the browser's download manager, which gives up
  // with "El sitio no estaba disponible" on any transient network/server hiccup
  // and never retries — the cause of random failed tracks in big batches.
  const saveFile = async (taskId: string, targetUrl: string, title: string, format: string): Promise<boolean> => {
    const downloadUrl = `/api/tools/ytdl/file?taskId=${taskId}&url=${encodeURIComponent(targetUrl)}&title=${encodeURIComponent(title)}&format=${format}`;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const res = await fetch(downloadUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const expected = Number(res.headers.get('Content-Length') || 0);
        if (blob.size < 1024 || (expected && blob.size !== expected)) {
          throw new Error('Archivo incompleto');
        }
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = `${title.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || 'audio'}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
        return true;
      } catch (e) {
        await sleep(1000 * (attempt + 1));
      }
    }
    return false;
  };

  const triggerDownload = async (taskId: string, targetUrl: string, title: string, format = 'mp3', force = false) => {
    if (!force && downloadedRef.current.has(taskId)) return;
    downloadedRef.current.add(taskId);
    setFailedFiles(prev => {
      if (!prev.has(taskId)) return prev;
      const next = new Set(prev);
      next.delete(taskId);
      return next;
    });

    const ok = await saveFile(taskId, targetUrl, title, format);
    if (!ok) {
      setFailedFiles(prev => new Set(prev).add(taskId));
    }
  };

  // Auto-download listener for tasks completed via SSE
  useEffect(() => {
    tasks.forEach(task => {
      if (task.status === 'completed' && task.clientId === clientId && !downloadedRef.current.has(task.id)) {
        triggerDownload(task.id, task.resolvedUrl || task.url, task.title, task.format || audioFormat);
      }
    });
  }, [tasks, clientId, audioFormat]);

  const handlePasteClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          setUrl(text.trim());
          if (errorMsg) setErrorMsg('');
        }
      }
    } catch (e) {
      console.warn('Clipboard read failed:', e);
    }
  };

  const processSingleTrackDownload = async (track: {
    url: string;
    resolvedUrl?: string;
    title: string;
    thumbnail?: string;
    platform?: string;
    existingTaskId?: string;
    format?: string;
    quality?: string;
  }) => {
    const taskId = track.existingTaskId || Math.random().toString(36).substring(2, 15);
    const selectedFormat = track.format || audioFormat;
    const selectedQuality = track.quality || audioQuality;

    if (!track.existingTaskId) {
      const initialTask: YtdlTask = {
        id: taskId,
        clientId,
        url: track.url,
        resolvedUrl: track.resolvedUrl || track.url,
        title: track.title,
        thumbnail: track.thumbnail,
        platform: track.platform || 'youtube',
        format: selectedFormat,
        quality: selectedQuality,
        status: 'downloading',
        progress: 15,
        startTime: Date.now(),
      };
      setTasks(prev => [initialTask, ...prev]);
    } else {
      setTasks(prev => prev.map(t => t.id === taskId ? {
        ...t,
        title: track.title,
        thumbnail: track.thumbnail,
        platform: track.platform || 'youtube',
        resolvedUrl: track.resolvedUrl || track.url,
        format: selectedFormat,
        quality: selectedQuality,
        status: 'downloading',
        progress: 25,
      } : t));
    }

    try {
      // Transient failures (YouTube throttling, dropped connection) are common in
      // big batches, so retry the whole resolve+download a few times.
      let data: any = null;
      let lastError = 'Error en descarga';
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetch('/api/tools/ytdl/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: track.url,
              resolvedUrl: track.resolvedUrl,
              title: track.title,
              thumbnail: track.thumbnail,
              platform: track.platform,
              clientId,
              taskId,
              format: selectedFormat,
              quality: selectedQuality,
              normalize: normalizeVolume,
              trimSilence: trimSilence,
            }),
          });
          const body = await res.json();
          if (!res.ok) throw new Error(body.error || 'Error en descarga');
          data = body;
          break;
        } catch (e: any) {
          lastError = e?.message || lastError;
          if (attempt < 2) await sleep(2000 * (attempt + 1));
        }
      }
      if (!data) throw new Error(lastError);

      // Bulk-pasted Spotify tracks only get their real title during processing.
      const finalTitle: string = data.title || track.title;
      setTasks(prev => prev.map(t => t.id === taskId ? {
        ...t,
        title: finalTitle,
        thumbnail: t.thumbnail || data.thumbnail,
        status: 'completed',
        progress: 100,
        format: selectedFormat,
      } : t));

      await triggerDownload(taskId, track.resolvedUrl || track.url, finalTitle, selectedFormat);

    } catch (err: any) {
      setTasks(prev => prev.map(t => t.id === taskId ? {
        ...t,
        status: 'error',
        error: err.message || 'Error en descarga'
      } : t));
    }
  };

  const handleDownloadFullPlaylist = async (tracks: PlaylistTrackItem[], originalTaskId?: string) => {
    if (originalTaskId) {
      setTasks(prev => prev.filter(t => t.id !== originalTaskId));
    }
    setPlaylistPrompt(null);

    // Create task entries for all tracks so the user sees all items in the UI immediately
    const preparedTracks = tracks.map((tr) => {
      const taskId = Math.random().toString(36).substring(2, 15);
      const detectedPlatform = tr.url.includes('spotify')
        ? 'spotify'
        : tr.url.includes('soundcloud')
        ? 'soundcloud'
        : 'youtube';

      return {
        taskId,
        url: tr.url,
        resolvedUrl: tr.url,
        title: tr.title,
        thumbnail: tr.thumbnail,
        platform: detectedPlatform,
      };
    });

    const initialTasks: YtdlTask[] = preparedTracks.map((item) => ({
      id: item.taskId,
      clientId,
      url: item.url,
      resolvedUrl: item.resolvedUrl,
      title: item.title,
      thumbnail: item.thumbnail,
      platform: item.platform,
      format: audioFormat,
      quality: audioQuality,
      status: 'downloading' as const,
      progress: 5,
      startTime: Date.now(),
    }));

    setTasks(prev => [...initialTasks, ...prev]);

    // Concurrency worker queue (max 2 parallel downloads to maintain optimal CDN speed & avoid timeouts)
    const CONCURRENCY = 2;
    let nextIndex = 0;

    const runWorker = async () => {
      while (nextIndex < preparedTracks.length) {
        const item = preparedTracks[nextIndex++];
        try {
          await processSingleTrackDownload({
            url: item.url,
            resolvedUrl: item.resolvedUrl,
            title: item.title,
            thumbnail: item.thumbnail,
            platform: item.platform,
            existingTaskId: item.taskId,
            format: audioFormat,
            quality: audioQuality,
          });
        } catch (e) {}
      }
    };

    const workers = [];
    for (let w = 0; w < Math.min(CONCURRENCY, preparedTracks.length); w++) {
      workers.push(runWorker());
    }
  };

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
      title: 'Analizando enlace...',
      status: 'analysing',
      progress: 0,
      startTime: Date.now(),
      format: audioFormat,
      quality: audioQuality,
    };

    setTasks(prev => [initialTask, ...prev]);

    try {
      const analyseRes = await fetch('/api/tools/ytdl/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: inputUrl }),
      });

      if (!analyseRes.ok) {
        const errData = await analyseRes.json();
        throw new Error(errData.error || 'Error al analizar el enlace');
      }

      const meta = await analyseRes.json();

      // Case 1: Pure playlist (Spotify, YouTube, SoundCloud)
      const isPurePlaylist = Boolean(
        (meta.isPlaylist && meta.playlist) ||
        (meta.isPlaylist && Array.isArray(meta.tracks) && meta.tracks.length > 0)
      );

      if (isPurePlaylist) {
        const pl = meta.playlist || {
          id: meta.playlistId || 'playlist',
          title: meta.title || 'Lista de Reproducción',
          trackCount: meta.trackCount || meta.tracks?.length || 0,
          thumbnail: meta.thumbnail,
          tracks: meta.tracks || [],
        };
        setTasks(prev => prev.filter(t => t.id !== taskId));
        setPlaylistPrompt({
          type: 'pure_playlist',
          playlist: {
            id: pl.id,
            title: pl.title,
            trackCount: pl.trackCount,
            thumbnail: pl.thumbnail,
            tracks: pl.tracks || [],
            isTruncated: pl.isTruncated,
            limitReason: pl.limitReason,
          },
          originalTaskId: taskId,
        });
        return;
      }

      // Case 2: Video inside a playlist (YouTube video with list=)
      const isVideoWithPlaylist = Boolean(
        (meta.isPlaylistWithVideo && meta.playlist && meta.singleVideo) ||
        (meta.hasPlaylistContext && meta.playlistInfo)
      );

      if (isVideoWithPlaylist) {
        const pl = meta.playlist || meta.playlistInfo;
        const sv = meta.singleVideo || {
          title: meta.title,
          thumbnail: meta.thumbnail,
          resolvedUrl: meta.resolvedUrl,
          platform: meta.platform || 'youtube',
        };
        setTasks(prev => prev.filter(t => t.id !== taskId));
        setPlaylistPrompt({
          type: 'video_with_playlist',
          singleVideo: {
            title: sv.title,
            thumbnail: sv.thumbnail,
            resolvedUrl: sv.resolvedUrl,
            platform: sv.platform || 'youtube',
          },
          playlist: {
            id: pl.id,
            title: pl.title,
            trackCount: pl.trackCount,
            thumbnail: pl.thumbnail,
            tracks: pl.tracks || [],
          },
          originalTaskId: taskId,
        });
        return;
      }

      // Case 3: Custom Naming Mode enabled by user
      if (namingMode === 'custom') {
        setTasks(prev => prev.filter(t => t.id !== taskId));
        setCustomTitleInput(meta.title || '');
        setCustomConfirm({
          url: inputUrl,
          resolvedUrl: meta.resolvedUrl || inputUrl,
          title: meta.title || '',
          thumbnail: meta.thumbnail,
          platform: meta.platform || 'youtube',
        });
        return;
      }

      // Case 4: Standard single track download (Automatic Mode)
      setTasks(prev => prev.map(t => t.id === taskId ? {
        ...t,
        title: meta.title || t.title,
        thumbnail: meta.thumbnail,
        platform: meta.platform,
        resolvedUrl: meta.resolvedUrl,
        status: 'downloading',
        progress: 10,
      } : t));

      const processRes = await fetch('/api/tools/ytdl/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: inputUrl,
          resolvedUrl: meta.resolvedUrl,
          title: meta.title,
          thumbnail: meta.thumbnail,
          platform: meta.platform,
          clientId,
          taskId,
          format: audioFormat,
          quality: audioQuality,
          normalize: normalizeVolume,
          trimSilence: trimSilence,
        }),
      });

      if (!processRes.ok) {
        const data = await processRes.json();
        throw new Error(data.error || 'Error al iniciar descarga');
      }

      setTasks(prev => prev.map(t => t.id === taskId ? {
        ...t,
        status: 'completed',
        progress: 100,
      } : t));

      triggerDownload(taskId, meta.resolvedUrl || inputUrl, meta.title || 'audio', audioFormat);

    } catch (err: any) {
      setTasks(prev => prev.map(t => t.id === taskId ? {
        ...t,
        status: 'error',
        error: err.message || 'Error en descarga'
      } : t));
    }
  };

  const handleCustomConfirmDownload = async () => {
    if (!customConfirm) return;
    const item = customConfirm;
    const finalTitle = customTitleInput.trim() || item.title;
    setCustomConfirm(null);

    await processSingleTrackDownload({
      url: item.url,
      resolvedUrl: item.resolvedUrl,
      title: finalTitle,
      thumbnail: item.thumbnail,
      platform: item.platform,
      format: audioFormat,
      quality: audioQuality,
    });
  };

  // Handle auto-start or initial URL passed via query parameters (e.g. from Dashboard quick downloader)
  const initialUrlHandledRef = useRef(false);
  useEffect(() => {
    if (typeof window === 'undefined' || initialUrlHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);

    // Returning from the Spotify OAuth flow (/api/spotify/callback)
    const spotifyResult = params.get('spotify');
    if (spotifyResult) {
      initialUrlHandledRef.current = true;
      if (spotifyResult === 'connected') {
        toast.success(`Spotify conectado${params.get('name') ? ` como ${params.get('name')}` : ''}. Ya puedes bajar playlists completas.`);
      } else {
        toast.error(params.get('reason') || 'No se pudo conectar Spotify');
      }
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    const paramUrl = params.get('url') || params.get('link') || params.get('q');
    const autoStart = params.get('autostart') === 'true' || params.get('download') === 'true';

    if (paramUrl) {
      initialUrlHandledRef.current = true;
      setUrl(paramUrl);
      if (autoStart) {
        handleSubmit(paramUrl);
      }
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

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
    switch(task.status) {
      case 'downloading': return <Download className="w-5 h-5 text-blue-500 animate-pulse" />;
      case 'converting': return <RefreshCw className="w-5 h-5 text-purple-500 animate-spin" />;
      case 'completed':
        return (
          <button
            type="button"
            title={failedFiles.has(task.id) ? 'La descarga falló, reintentar' : `Bajar ${(task.format || 'mp3').toUpperCase()}`}
            className={`p-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 font-bold text-xs ${failedFiles.has(task.id) ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400' : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500'}`}
            onClick={(e) => {
              e.stopPropagation();
              triggerDownload(task.id, task.resolvedUrl || task.url, task.title, task.format || audioFormat, true);
            }}
          >
            {failedFiles.has(task.id)
              ? <><RefreshCw className="w-4 h-4" /> Reintentar guardado</>
              : <><CheckCircle2 className="w-4 h-4" /> Bajar {(task.format || 'mp3').toUpperCase()}</>}
          </button>
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
    const fmt = (task.format || audioFormat).toUpperCase();
    switch(task.status) {
      case 'downloading': return `Descargando... ${task.progress.toFixed(0)}%`;
      case 'converting': return `Procesando ${fmt} (${task.quality || audioQuality}k)...`;
      case 'completed': return `Guardado en Descargas (${fmt})`;
      case 'error': {
        const err = task.error || 'Error en la descarga';
        if (err.includes('Sign in to confirm') || err.includes('bot')) {
          return 'Error temporal del servidor. Reintenta en unos segundos.';
        }
        if (err.includes('Hacer pública') || err.includes('Añadir a mi perfil') || err.includes('Asegúrate de que sea pública')) {
          return err;
        }
        if (err.includes('not found') || err.includes('unavailable') || err.includes('404')) {
          return 'Audio no encontrado o no disponible.';
        }
        if (err.includes('login_required')) {
          return 'Este contenido requiere inicio de sesión.';
        }
        if (err.includes('Todos los motores')) {
          return 'Error al descargar. Reintenta en unos segundos.';
        }
        return err;
      }
      default: return 'Analizando...';
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto py-8 sm:py-12 flex flex-col items-center gap-8 relative">
      <div className="absolute top-0 left-0 w-full h-64 bg-accent/5 blur-[100px] rounded-full pointer-events-none" />
      
      {/* Cabecera y Buscador con Opciones Flexibles */}
      <div className="max-w-2xl w-full z-10 text-center space-y-6 bg-surface border border-border/50 rounded-2xl p-6 sm:p-8 shadow-2xl">
        <div>
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-accent/10 border border-accent/20 rounded-2xl flex items-center justify-center mx-auto mb-4 sm:mb-6">
            <Play className="w-6 h-6 sm:w-8 sm:h-8 text-accent" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-text-primary mb-2 sm:mb-3">Mp3 Downloader</h2>
          <p className="text-sm sm:text-base text-text-secondary">Descarga canciones o listas completas de <strong className="text-text-primary">YouTube</strong>, <strong className="text-emerald-400">Spotify</strong> y <strong className="text-orange-400">SoundCloud</strong> con máxima flexibilidad.</p>
        </div>

        {/* Input Bar con Botón Pegar */}
        <div className="glass p-1.5 sm:p-2 rounded-2xl border border-border flex flex-col sm:flex-row items-stretch sm:items-center gap-2 focus-within:border-accent/50 focus-within:ring-1 focus-within:ring-accent/50 transition-all">
          <div className="flex-1 flex items-center min-w-0">
            <input 
              type="text" 
              placeholder="Pega enlaces de YouTube, Spotify o SoundCloud..."
              value={url}
              onChange={e => {
                setUrl(e.target.value);
                if (errorMsg) setErrorMsg('');
              }}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              className="flex-1 min-w-0 bg-transparent border-none focus:outline-none text-text-primary px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base placeholder:text-text-secondary/50"
            />
            <button
              type="button"
              onClick={handlePasteClipboard}
              title="Pegar desde el portapapeles"
              className="p-2 text-text-secondary hover:text-accent hover:bg-surface-elevated rounded-xl transition-all mr-1 cursor-pointer"
            >
              <ClipboardPaste className="w-5 h-5" />
            </button>
          </div>
          <Button 
            onClick={() => handleSubmit()}
            disabled={!url.trim()}
            className="rounded-xl px-4 sm:px-6 py-2 sm:py-3 font-bold shrink-0 whitespace-nowrap w-full sm:w-auto shadow-lg"
          >
            <Search className="w-4 h-4 mr-2" /> Buscar y Bajar
          </Button>
        </div>

        {/* Conexión con Spotify (playlists completas y Canciones que te gustan) */}
        {spotify?.configured && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-left">
            <div className="flex-1 min-w-0 text-xs sm:text-sm">
              {spotify.connected ? (
                <span className="text-text-secondary">
                  <strong className="text-emerald-400">Spotify conectado</strong> como {spotify.displayName}. Tus playlists se bajan completas.
                </span>
              ) : (
                <span className="text-text-secondary">
                  <strong className="text-emerald-400">Conecta Spotify</strong> para bajar tus playlists completas y tus canciones favoritas, sin límite de 100.
                </span>
              )}
            </div>
            {spotify.connected ? (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={openMyPlaylists}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Library className="w-3.5 h-3.5" /> Mis playlists
                </button>
                <button
                  type="button"
                  onClick={disconnectSpotify}
                  title="Desconectar Spotify"
                  className="p-1.5 text-text-secondary hover:text-danger hover:bg-surface-elevated rounded-lg transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={connectSpotify}
                className="shrink-0 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black transition-colors cursor-pointer"
              >
                Conectar Spotify
              </button>
            )}
          </div>
        )}

        {/* BARRA DE CONFIGURACIÓN RÁPIDA (Formato, Calidad y Nomenclatura) */}
        <div className="pt-2 border-t border-border/40 space-y-4 text-left">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* 1. Selector de Formato */}
            <div className="bg-surface-elevated/50 p-3 rounded-xl border border-border/60">
              <label className="text-[11px] font-bold text-text-secondary uppercase tracking-wider block mb-1.5">Formato</label>
              <div className="grid grid-cols-4 gap-1">
                {(['mp3', 'wav', 'flac', 'm4a'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setAudioFormat(fmt)}
                    className={`py-1.5 text-xs font-bold rounded-lg uppercase transition-all cursor-pointer ${
                      audioFormat === fmt
                        ? 'bg-accent text-white shadow-sm'
                        : 'bg-surface hover:bg-surface-elevated text-text-secondary hover:text-text-primary border border-border/40'
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Selector de Calidad (Bitrate) */}
            <div className="bg-surface-elevated/50 p-3 rounded-xl border border-border/60">
              <label className="text-[11px] font-bold text-text-secondary uppercase tracking-wider block mb-1.5">
                Calidad {audioFormat === 'wav' || audioFormat === 'flac' ? '(Sin pérdida)' : ''}
              </label>
              {audioFormat === 'wav' || audioFormat === 'flac' ? (
                <div className="py-1.5 px-2 bg-surface text-center rounded-lg text-xs font-bold text-emerald-400 border border-border/40">
                  {audioFormat === 'wav' ? '16-bit PCM Lossless' : '24-bit Hi-Fi FLAC'}
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-1">
                  {(['320', '256', '192', '128'] as const).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setAudioQuality(q)}
                      className={`py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                        audioQuality === q
                          ? 'bg-accent text-white shadow-sm'
                          : 'bg-surface hover:bg-surface-elevated text-text-secondary hover:text-text-primary border border-border/40'
                      }`}
                    >
                      {q}k
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 3. Modo de Nomenclatura */}
            <div className="bg-surface-elevated/50 p-3 rounded-xl border border-border/60">
              <label className="text-[11px] font-bold text-text-secondary uppercase tracking-wider block mb-1.5">Nombre del Archivo</label>
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => setNamingMode('auto')}
                  className={`py-1.5 px-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer ${
                    namingMode === 'auto'
                      ? 'bg-accent text-white shadow-sm'
                      : 'bg-surface hover:bg-surface-elevated text-text-secondary hover:text-text-primary border border-border/40'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" /> Auto
                </button>
                <button
                  type="button"
                  onClick={() => setNamingMode('custom')}
                  className={`py-1.5 px-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1 transition-all cursor-pointer ${
                    namingMode === 'custom'
                      ? 'bg-accent text-white shadow-sm'
                      : 'bg-surface hover:bg-surface-elevated text-text-secondary hover:text-text-primary border border-border/40'
                  }`}
                >
                  <Edit3 className="w-3.5 h-3.5" /> Editar
                </button>
              </div>
            </div>
          </div>

          {/* AJUSTES AVANZADOS (Colapsables: Normalizar Volumen & Recortar Silencios) */}
          <div className="bg-surface-elevated/30 rounded-xl border border-border/40 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
              className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-bold text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-accent" /> Procesamiento de Audio & DSP
              </span>
              {showAdvancedSettings ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showAdvancedSettings && (
              <div className="p-4 pt-1 border-t border-border/40 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-in fade-in duration-150">
                {/* Toggle: Normalizar Volumen */}
                <label className="flex items-start gap-3 p-3 bg-surface rounded-xl border border-border/50 cursor-pointer hover:border-accent/40 transition-all">
                  <input
                    type="checkbox"
                    checked={normalizeVolume}
                    onChange={e => setNormalizeVolume(e.target.checked)}
                    className="mt-0.5 rounded border-border text-accent focus:ring-accent accent-accent w-4 h-4 cursor-pointer"
                  />
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-text-primary">
                      <Volume2 className="w-3.5 h-3.5 text-accent" /> Normalizar volumen
                    </div>
                    <p className="text-[11px] text-text-secondary mt-0.5 leading-tight">
                      Aplica loudness standard (EBU R128) para igualar el nivel sonoro entre canciones.
                    </p>
                  </div>
                </label>

                {/* Toggle: Recortar Silencios */}
                <label className="flex items-start gap-3 p-3 bg-surface rounded-xl border border-border/50 cursor-pointer hover:border-accent/40 transition-all">
                  <input
                    type="checkbox"
                    checked={trimSilence}
                    onChange={e => setTrimSilence(e.target.checked)}
                    className="mt-0.5 rounded border-border text-accent focus:ring-accent accent-accent w-4 h-4 cursor-pointer"
                  />
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-text-primary">
                      <Scissors className="w-3.5 h-3.5 text-accent" /> Recortar silencios
                    </div>
                    <p className="text-[11px] text-text-secondary mt-0.5 leading-tight">
                      Elimina pausas muertas al inicio y al final de los archivos descargados.
                    </p>
                  </div>
                </label>
              </div>
            )}
          </div>
        </div>

        {errorMsg && <p className="text-sm text-danger font-medium animate-in fade-in slide-in-from-top-2">{errorMsg}</p>}
      </div>

      {/* MODAL DE CONFIRMACIÓN Y EDICIÓN PERSONALIZADA (Custom Naming Modal) */}
      {customConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-surface border border-border rounded-2xl p-6 sm:p-8 max-w-lg w-full shadow-2xl relative space-y-6 animate-in zoom-in-95 duration-200">
            <button 
              type="button"
              onClick={() => setCustomConfirm(null)}
              className="absolute top-4 right-4 p-2 text-text-secondary hover:text-text-primary rounded-lg hover:bg-surface-elevated transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
                <Edit3 className="w-6 h-6 text-accent" />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-text-primary">Confirmar Descarga</h3>
                <p className="text-xs sm:text-sm text-text-secondary">Edita el nombre del archivo o ajusta las opciones antes de bajarlo.</p>
              </div>
            </div>

            <div className="space-y-4">
              {customConfirm.thumbnail && (
                <div className="relative rounded-xl overflow-hidden border border-border aspect-video max-h-44 w-full bg-surface-elevated flex items-center justify-center">
                  <img src={customConfirm.thumbnail} alt="" className="w-full h-full object-cover" />
                  <div className="absolute top-2 left-2">
                    {getPlatformBadge(customConfirm.platform)}
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-text-secondary uppercase tracking-wider block mb-1.5">Nombre del Archivo</label>
                <input
                  type="text"
                  value={customTitleInput}
                  onChange={e => setCustomTitleInput(e.target.value)}
                  placeholder="Título de la canción..."
                  className="w-full bg-surface-elevated border border-border focus:border-accent focus:outline-none rounded-xl px-4 py-2.5 text-sm text-text-primary font-medium"
                />
              </div>

              <div className="p-3 bg-surface-elevated/50 rounded-xl border border-border/40 text-xs text-text-secondary flex items-center justify-between">
                <span>Formato de salida: <strong className="text-text-primary uppercase">{audioFormat}</strong></span>
                <span>Calidad: <strong className="text-text-primary">{audioFormat === 'wav' || audioFormat === 'flac' ? 'Lossless' : `${audioQuality} kbps`}</strong></span>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={handleCustomConfirmDownload}
                  className="flex-1 py-3 font-bold rounded-xl shadow-lg"
                >
                  <Download className="w-4 h-4 mr-2" /> Descargar {audioFormat.toUpperCase()}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setCustomConfirm(null)}
                  className="py-3 px-5 font-bold rounded-xl"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: MIS PLAYLISTS DE SPOTIFY */}
      {showMyPlaylists && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-surface border border-border rounded-2xl p-5 sm:p-6 max-w-lg w-full max-h-[85vh] flex flex-col shadow-2xl relative gap-4 animate-in zoom-in-95 duration-200">
            <button
              type="button"
              onClick={() => setShowMyPlaylists(false)}
              className="absolute top-4 right-4 p-2 text-text-secondary hover:text-text-primary rounded-lg hover:bg-surface-elevated transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 pr-10">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <Library className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-text-primary">Mis playlists de Spotify</h3>
                <p className="text-xs text-text-secondary">Elige una y se descarga completa.</p>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto -mx-2 px-2 space-y-1.5">
              {loadingMyPlaylists && (
                <div className="py-10 flex justify-center">
                  <Loader2 className="w-6 h-6 text-accent animate-spin" />
                </div>
              )}
              {!loadingMyPlaylists && myPlaylists?.length === 0 && (
                <p className="py-8 text-center text-sm text-text-secondary">No tienes playlists en Spotify.</p>
              )}
              {!loadingMyPlaylists && myPlaylists?.map((pl) => (
                <button
                  key={pl.id}
                  type="button"
                  onClick={() => {
                    setShowMyPlaylists(false);
                    handleSubmit(pl.url);
                  }}
                  className="w-full text-left p-2 rounded-xl hover:bg-surface-elevated border border-transparent hover:border-border transition-all flex items-center gap-3 cursor-pointer"
                >
                  {pl.id === 'liked' ? (
                    <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-indigo-600 to-emerald-400 flex items-center justify-center shrink-0">
                      <Heart className="w-5 h-5 text-white fill-white" />
                    </div>
                  ) : pl.thumbnail ? (
                    <img src={pl.thumbnail} alt="" className="w-11 h-11 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-11 h-11 rounded-lg bg-surface-elevated flex items-center justify-center shrink-0">
                      <ListMusic className="w-5 h-5 text-text-secondary" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-sm text-text-primary line-clamp-1">{pl.name}</h4>
                    <p className="text-xs text-text-secondary line-clamp-1">
                      {pl.trackCount != null ? `${pl.trackCount} canciones · ` : ''}
                      {pl.fullAccess ? pl.owner : `de ${pl.owner} · solo 100`}
                    </p>
                  </div>
                  {!pl.fullAccess && (
                    <span title="No es tuya: Spotify solo deja leer las primeras 100">
                      <Lock className="w-4 h-4 text-text-secondary/60 shrink-0" />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL / DIALOG PARA LISTAS DE REPRODUCCIÓN */}
      {playlistPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-surface border border-border rounded-2xl p-6 sm:p-8 max-w-lg w-full shadow-2xl relative space-y-6 animate-in zoom-in-95 duration-200">
            <button 
              type="button"
              onClick={() => setPlaylistPrompt(null)}
              className="absolute top-4 right-4 p-2 text-text-secondary hover:text-text-primary rounded-lg hover:bg-surface-elevated transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
                <ListMusic className="w-6 h-6 text-accent" />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-text-primary">
                  {playlistPrompt.type === 'pure_playlist' ? 'Lista de Reproducción Detectada' : '¿Qué deseas descargar?'}
                </h3>
                <p className="text-xs sm:text-sm text-text-secondary">
                  {playlistPrompt.type === 'pure_playlist'
                    ? `Se encontraron ${playlistPrompt.playlist.trackCount} canciones en esta lista.`
                    : 'El enlace incluye una canción específica y pertenece a una lista.'}
                </p>
              </div>
            </div>

            {/* CASO: VIDEO DENTRO DE UNA PLAYLIST (ELECCIÓN INTELIGENTE) */}
            {playlistPrompt.type === 'video_with_playlist' && playlistPrompt.singleVideo && (
              <div className="space-y-3">
                {/* Opción A: Solo el vídeo individual */}
                <button
                  type="button"
                  onClick={() => {
                    const sv = playlistPrompt.singleVideo!;
                    setPlaylistPrompt(null);
                    processSingleTrackDownload({
                      url: sv.resolvedUrl,
                      resolvedUrl: sv.resolvedUrl,
                      title: sv.title,
                      thumbnail: sv.thumbnail,
                      platform: sv.platform,
                      format: audioFormat,
                      quality: audioQuality,
                    });
                  }}
                  className="w-full text-left p-4 rounded-xl border-2 border-accent/40 bg-accent/5 hover:bg-accent/10 hover:border-accent transition-all flex items-center gap-4 group cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center shrink-0 text-accent group-hover:scale-105 transition-transform">
                    <Music className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-bold text-accent uppercase tracking-wider block">Opción Recomendada</span>
                    <h4 className="font-bold text-sm text-text-primary line-clamp-1">{playlistPrompt.singleVideo.title}</h4>
                    <p className="text-xs text-text-secondary">Descargar únicamente esta canción ({audioFormat.toUpperCase()})</p>
                  </div>
                  <Check className="w-5 h-5 text-accent shrink-0" />
                </button>

                {/* Opción B: Toda la lista de reproducción */}
                <button
                  type="button"
                  onClick={() => handleDownloadFullPlaylist(playlistPrompt.playlist.tracks, playlistPrompt.originalTaskId)}
                  className="w-full text-left p-4 rounded-xl border border-border/80 bg-surface-elevated/40 hover:bg-surface-elevated hover:border-border transition-all flex items-center gap-4 group cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-lg bg-surface-elevated flex items-center justify-center shrink-0 text-text-secondary group-hover:scale-105 transition-transform">
                    <ListMusic className="w-5 h-5 text-text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wider block">Lista Completa</span>
                    <h4 className="font-bold text-sm text-text-primary line-clamp-1">{playlistPrompt.playlist.title}</h4>
                    <p className="text-xs text-text-secondary">Descargar las {playlistPrompt.playlist.trackCount} canciones en {audioFormat.toUpperCase()}</p>
                  </div>
                  <Download className="w-5 h-5 text-text-secondary shrink-0" />
                </button>
              </div>
            )}

            {/* CASO: PURE PLAYLIST */}
            {playlistPrompt.type === 'pure_playlist' && (
              <div className="space-y-4">
                <div className="p-4 bg-surface-elevated rounded-xl border border-border flex items-center gap-3">
                  {playlistPrompt.playlist.thumbnail ? (
                    <img src={playlistPrompt.playlist.thumbnail} alt="" className="w-12 h-12 rounded-lg object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-surface flex items-center justify-center">
                      <ListMusic className="w-6 h-6 text-accent" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-sm sm:text-base text-text-primary line-clamp-1">{playlistPrompt.playlist.title}</h4>
                    <p className="text-xs text-text-secondary">{playlistPrompt.playlist.trackCount} canciones listas para descargar ({audioFormat.toUpperCase()})</p>
                  </div>
                </div>

                {playlistPrompt.playlist.isTruncated && (
                  <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-text-secondary space-y-2">
                    <p className="flex items-start gap-2">
                      <TriangleAlert className="w-4 h-4 text-amber-400 shrink-0 mt-px" />
                      <span>
                        <strong className="text-amber-400">Spotify solo deja leer las primeras 100 canciones de esta lista.</strong>{' '}
                        {playlistPrompt.playlist.limitReason === 'not_owner'
                          ? 'Es de otra persona, y Spotify solo da la lista completa de las playlists que son tuyas.'
                          : 'Si es tuya, conecta Spotify y se bajará entera.'}
                      </span>
                    </p>
                    <p className="pl-6">
                      <strong className="text-text-primary">Para bajarla entera:</strong> en Spotify abre la playlist → pulsa{' '}
                      <kbd className="px-1 rounded bg-surface border border-border">Ctrl</kbd>+<kbd className="px-1 rounded bg-surface border border-border">A</kbd>{' '}
                      → clic derecho → <em>Añadir a playlist → Nueva playlist</em>. Ya es tuya: elígela en <em>Mis playlists</em>.
                      O copia todas con <kbd className="px-1 rounded bg-surface border border-border">Ctrl</kbd>+<kbd className="px-1 rounded bg-surface border border-border">C</kbd>{' '}
                      y pégalas en el buscador.
                    </p>
                    {playlistPrompt.playlist.limitReason === 'connect' && spotify?.configured && !spotify.connected && (
                      <div className="pl-6">
                        <button
                          type="button"
                          onClick={connectSpotify}
                          className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black transition-colors cursor-pointer"
                        >
                          Conectar Spotify
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-3">
                  <Button
                    onClick={() => handleDownloadFullPlaylist(playlistPrompt.playlist.tracks, playlistPrompt.originalTaskId)}
                    className="flex-1 py-3 font-bold rounded-xl"
                  >
                    <Download className="w-4 h-4 mr-2" /> Descargar {playlistPrompt.playlist.trackCount} canciones
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setPlaylistPrompt(null)}
                    className="py-3 px-5 font-bold rounded-xl"
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
                  <span className="inline-flex items-center text-[10px] font-bold text-text-secondary bg-surface-elevated px-1.5 py-0.5 rounded uppercase">
                    {task.format || audioFormat}
                  </span>
                  <span className="text-text-secondary/50">•</span>
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
