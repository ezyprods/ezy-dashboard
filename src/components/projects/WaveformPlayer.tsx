'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Pause, Play, Download, Trash2, Edit3, FolderInput, ExternalLink, MessageSquare, X, Loader2, Lock, Scissors } from 'lucide-react';
import { useAudio } from '@/lib/contexts/AudioContext';
import { cn } from '@/lib/utils';
import { customAlert, customConfirm, customPrompt } from '@/lib/dialog';
import { MiniDAWModal } from './MiniDAWModal';
import { DAWErrorBoundary } from './DAWErrorBoundary';


interface WaveformPlayerProps {
  fileId: string;
  fileName: string;
  artistName?: string;
  onContextMenu?: React.MouseEventHandler<HTMLDivElement>;
  folders?: { id: string; name: string }[];
  onRefresh?: () => void;
  currentFolderId?: string;
  versions?: { id: string; name: string }[];
  isPortal?: boolean;
  paywallLocked?: boolean;
  modifiedTime?: string;
  bpm?: number | string | null;
  trackKey?: string | null;
}

const BAR_COUNT = 70; // Fewer, thicker bars for minimalist look
const CANVAS_HEIGHT = 24; // Slimmer height

const formatModificationTime = (timeStr?: string) => {
  if (!timeStr) return '';
  const date = new Date(timeStr);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const d = pad(date.getDate());
  const m = pad(date.getMonth() + 1);
  const y = date.getFullYear();
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${d}/${m}/${y} ${h}:${min}`;
};

export function WaveformPlayer({ 
  fileId, 
  fileName, 
  artistName, 
  onContextMenu,
  folders = [],
  onRefresh,
  currentFolderId,
  versions,
  isPortal = false,
  paywallLocked = false,
  modifiedTime,
  bpm,
  trackKey
}: WaveformPlayerProps) {
  const { currentTrack, isPlaying, duration, currentTime, playTrack, togglePlay, seek } = useAudio();

  const [activeVersionId, setActiveVersionId] = useState(fileId);
  const activeId = versions && versions.length > 0 ? activeVersionId : fileId;
  const activeName = versions?.find(v => v.id === activeId)?.name || fileName;

  const [displayName, setDisplayName] = useState(activeName.replace(/\.[^/.]+$/, ''));
  const isThisTrackActive = currentTrack?.id === activeId;
  const isThisTrackPlaying = isThisTrackActive && isPlaying;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [waveformData, setWaveformData] = useState<number[] | null>(null);
  const [isLoadingWaveform, setIsLoadingWaveform] = useState(false);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(120);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const [isMiniDAWOpen, setIsMiniDAWOpen] = useState(false);

  // Comments
  const [commentTime, setCommentTime] = useState<number | null>(null);
  const [commentText, setCommentText] = useState('');
  const [comments, setComments] = useState<{id: string, time: number, text: string}[]>([]);

  useEffect(() => {
    setDisplayName(activeName.replace(/\.[^/.]+$/, ''));
    setWaveformData(null); // Reset waveform when changing version
  }, [activeName, activeId]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setCanvasWidth(Math.floor(w));
    });
    ro.observe(el);
    setCanvasWidth(el.clientWidth || 120);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (waveformData) return;
    setIsLoadingWaveform(true);

    let cancelled = false;
    const generate = async () => {
      try {
        const cacheKey = `waveform_v3_hq_${activeId}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length === BAR_COUNT) {
              if (!cancelled) {
                setWaveformData(parsed);
                setIsLoadingWaveform(false);
              }
              return;
            }
          } catch (e) { }
        }

        const response = await fetch(`https://drive.google.com/uc?export=download&id=${activeId}`);
        const arrayBuffer = await response.arrayBuffer();
        if (cancelled) return;

        const offlineCtx = new OfflineAudioContext(1, 1, 44100);
        const decoded = await offlineCtx.decodeAudioData(arrayBuffer);
        if (cancelled) return;

        const channelData = decoded.getChannelData(0);
        const blockSize = Math.floor(channelData.length / BAR_COUNT);
        const points = [];
        for (let i = 0; i < BAR_COUNT; i++) {
          let max = 0;
          for (let j = 0; j < blockSize; j++) {
            const val = Math.abs(channelData[i * blockSize + j]);
            if (val > max) max = val;
          }
          points.push(Math.min(max * 1.5, 1));
        }
        if (!cancelled) {
          setWaveformData(points);
          try {
            localStorage.setItem(cacheKey, JSON.stringify(points));
          } catch (e) { }
          setIsLoadingWaveform(false);
        }
      } catch (e) {
        if (!cancelled) {
          const fallback = Array.from({ length: BAR_COUNT }, (_, i) =>
            0.2 + 0.6 * Math.abs(Math.sin(i * 0.3)) * Math.random()
          );
          setWaveformData(fallback);
          setIsLoadingWaveform(false);
        }
      }
    };

    generate();
    return () => { cancelled = true; };
  }, [fileId, waveformData]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveformData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const totalHeight = CANVAS_HEIGHT;
    
    canvas.width = canvasWidth * dpr;
    canvas.height = totalHeight * dpr;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${totalHeight}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, canvasWidth, totalHeight);

    const barWidth = (canvasWidth - BAR_COUNT * 1) / BAR_COUNT;
    const progress = isThisTrackActive && duration > 0 ? currentTime / duration : 0;
    const progressX = progress * canvasWidth;

    const activeGradient = ctx.createLinearGradient(0, 0, canvasWidth, 0);
    activeGradient.addColorStop(0, '#6c5ce7');
    activeGradient.addColorStop(1, '#a29bfe');

    for (let i = 0; i < BAR_COUNT; i++) {
      const x = i * (barWidth + 1);
      const val = waveformData[i];
      const barH = Math.max(2, val * CANVAS_HEIGHT);
      const y = CANVAS_HEIGHT - barH;

      const barCenterX = x + barWidth / 2;
      const isPlayed = barCenterX <= progressX;

      // Draw Main Bar - Minimalist rounded
      ctx.fillStyle = isThisTrackActive 
        ? (isPlayed ? activeGradient : 'rgba(108, 92, 231, 0.15)') 
        : (isPlayed ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.05)');
      
      ctx.beginPath();
      ctx.roundRect(x, y + (CANVAS_HEIGHT - barH) / 2, barWidth, barH, barWidth / 2);
      ctx.fill();
    }

    // Hover Indicator
    if (hoverX !== null) {
      ctx.fillStyle = 'rgba(240, 240, 245, 0.6)';
      ctx.fillRect(hoverX, 0, 1.5, totalHeight);
    }
  }, [waveformData, canvasWidth, isThisTrackActive, currentTime, duration, hoverX]);

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isThisTrackActive) {
      togglePlay();
    } else {
      playTrack({ id: activeId, name: displayName, url: `/api/audio/${activeId}`, artistName });
    }
  };

  const getTimeAtX = useCallback((x: number): string => {
    if (!duration || !canvasWidth) return '0:00';
    const t = (x / canvasWidth) * duration;
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, [duration, canvasWidth]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHoverX(e.clientX - rect.left);
  }, []);

  const handleMouseLeave = useCallback(() => setHoverX(null), []);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;

    if (isThisTrackActive && duration > 0) {
      seek((x / canvasWidth) * duration);
    } else {
      playTrack({ id: activeId, name: displayName, url: `/api/audio/${activeId}`, artistName });
    }
  }, [isThisTrackActive, duration, canvasWidth, seek, playTrack, activeId, displayName, artistName]);

  const startRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditNameValue(displayName);
    setIsEditingName(true);
  };

  const handleRenameSubmit = async () => {
    if (!editNameValue || editNameValue.trim() === '' || editNameValue === displayName) {
      setIsEditingName(false);
      return;
    }

    const currentExt = activeName.substring(activeName.lastIndexOf('.'));
    const newName = editNameValue.trim();

    setIsUpdating(true);
    try {
      const res = await fetch('/api/files', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: activeId, name: newName + currentExt }),
      });
      if (!res.ok) throw new Error('Error al renombrar archivo');
      setDisplayName(newName);
      if (onRefresh) onRefresh();
    } catch (err: any) { customAlert(err.message); } finally { 
      setIsUpdating(false);
      setIsEditingName(false);
    }
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') handleRenameSubmit();
    if (e.key === 'Escape') setIsEditingName(false);
  };

  const handleMove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!folders.length) return;
    const options = folders.map((f, i) => `${i + 1}. ${f.name}`).join('\n');
    const choice = await customPrompt(`Mover a:\n\n${options}\n\nIntroduce el número de la carpeta de destino:`);
    if (!choice) return;
    const idx = parseInt(choice, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= folders.length) { customAlert('Selección no válida.'); return; }
    const targetFolder = folders[idx];
    if (targetFolder.id === currentFolderId) { customAlert('El archivo ya está en esa carpeta.'); return; }

    setIsUpdating(true);
    try {
      const res = await fetch('/api/files', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: activeId, newParentId: targetFolder.id, oldParentId: currentFolderId }),
      });
      if (!res.ok) throw new Error('Error al mover el archivo');
      customAlert(`Archivo movido con éxito a ${targetFolder.name}`);
      if (onRefresh) onRefresh();
    } catch (err: any) { customAlert(err.message); } finally { setIsUpdating(false); }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!await customConfirm(`¿Estás seguro de que quieres eliminar el archivo "${activeName}" de forma permanente?`)) return;
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/files?id=${activeId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al eliminar el archivo');
      if (onRefresh) onRefresh();
    } catch (err: any) { customAlert(err.message); } finally { setIsUpdating(false); }
  };

  const startCommenting = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isThisTrackActive) {
      playTrack({ id: activeId, name: displayName, url: `/api/audio/${activeId}`, artistName });
    } else if (isPlaying) {
      togglePlay();
    }
    setCommentTime(currentTime);
    setCommentText('');
  };

  const handleCommentSubmit = () => {
    if (!commentText.trim() || commentTime === null) return;
    setComments([...comments, { id: Date.now().toString(), time: commentTime, text: commentText.trim() }]);
    setCommentTime(null);
    setCommentText('');
    customAlert('Comentario añadido');
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    const fileUrl = `${window.location.origin}/api/audio/${activeId}`;
    const safeName = activeName.replace(/[^a-z0-9_.\-\[\] ]/gi, '_');
    
    // Standard format for dragging out of the browser to OS/WhatsApp
    e.dataTransfer.setData('DownloadURL', `audio/mpeg:${safeName}:${fileUrl}`);
    e.dataTransfer.setData('text/plain', fileUrl);
    e.dataTransfer.setData('text/uri-list', fileUrl);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <>
    <div className="flex flex-col gap-2 w-full min-w-0">
      <div
        draggable
        onDragStart={handleDragStart}
        onContextMenu={onContextMenu}
        className={cn(
          'py-2 px-3 rounded-xl border bg-surface-elevated/40 flex items-center justify-between gap-4 transition-all group/audio shadow-sm hover:shadow-md hover:bg-surface-elevated/70',
          isThisTrackActive ? 'border-accent shadow-[0_0_15px_rgba(108,92,231,0.15)] bg-accent/5' : 'border-border/60 hover:border-accent/40'
        )}
      >
      {/* Main Content Area */}
      <div className="flex flex-col w-full gap-2">
        <div className="flex items-center gap-3 w-full">
          <button
            className={cn(
              'w-10 h-10 md:w-8 md:h-8 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 shadow-sm hover:scale-105',
              isThisTrackActive ? 'bg-accent text-white shadow-accent/40' : 'bg-surface border border-border text-text-primary hover:border-accent hover:text-accent'
            )}
            onClick={handlePlayClick}
          >
            {isThisTrackPlaying ? <Pause className="w-4 h-4 md:w-3.5 md:h-3.5 fill-current" /> : <Play className="w-4 h-4 md:w-3.5 md:h-3.5 fill-current ml-0.5" />}
          </button>

          <div className="flex-1 min-w-0 flex flex-col justify-center">
            {isEditingName ? (
              <input
                autoFocus
                type="text"
                value={editNameValue}
                onChange={(e) => setEditNameValue(e.target.value)}
                onKeyDown={handleRenameKeyDown}
                onBlur={handleRenameSubmit}
                onClick={(e) => e.stopPropagation()}
                className="w-full bg-surface-elevated/50 border border-accent/50 rounded px-2 py-0.5 text-[13px] font-semibold text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
              />
            ) : (
              <div className="flex items-center gap-2">
                <span 
                  className={cn('text-[13px] font-semibold truncate transition-colors cursor-text', isThisTrackActive ? 'text-accent' : 'text-text-primary hover:text-accent')} 
                  title={displayName}
                  onDoubleClick={startRename}
                >
                  {displayName}
                </span>
                {modifiedTime && (
                  <span className="hidden sm:inline-block text-[10px] text-text-secondary font-mono bg-surface/50 px-1.5 py-0.5 rounded border border-border/20 shrink-0" title="Fecha de modificación">
                    {formatModificationTime(modifiedTime)}
                  </span>
                )}
                {bpm && (() => {
                  const bpmNum = parseInt(String(bpm));
                  const bpmColor = bpmNum < 80 ? 'text-blue-400 bg-blue-500/10 border-blue-500/20' :
                                   bpmNum < 110 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
                                   bpmNum < 140 ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
                                   'text-red-400 bg-red-500/10 border-red-500/20';
                  return (
                    <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded border shrink-0 ${bpmColor} ${isThisTrackPlaying ? 'animate-pulse' : ''}`} title="Tempo (BPM)">
                      {bpmNum} BPM
                    </span>
                  );
                })()}
                {trackKey && (
                  <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded border text-violet-400 bg-violet-500/10 border-violet-500/20 shrink-0" title="Tonalidad musical">
                    {trackKey}
                  </span>
                )}
                {versions && versions.length > 1 && (
                  <select 
                    className="bg-surface-elevated border border-border/50 rounded text-[10px] font-bold px-1 py-0.5 text-text-secondary outline-none hover:text-text-primary hover:border-accent/50 cursor-pointer transition-colors"
                    value={activeId}
                    onChange={e => {
                      e.stopPropagation();
                      setActiveVersionId(e.target.value);
                    }}
                    onClick={e => e.stopPropagation()}
                  >
                    {versions.map((v, i) => (
                      <option key={v.id} value={v.id}>V{i + 1}</option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>
        
          {/* Action Buttons — always visible on mobile, hover-reveal on desktop */}
          <div className="flex items-center gap-0.5 md:gap-1.5 shrink-0">
            {isUpdating ? (
              <Loader2 className="w-4 h-4 animate-spin text-accent mr-2" />
            ) : (
              <>
                {!isPortal && (
                  <button
                    onClick={startCommenting}
                    className="p-2 md:p-1.5 text-text-secondary hover:text-accent rounded-md hover:bg-surface transition-all lg:opacity-0 lg:group-hover/audio:opacity-100"
                    title="Comentar"
                  >
                    <MessageSquare className="w-4 h-4 md:w-3.5 md:h-3.5" />
                  </button>
                )}
                {!isPortal && !paywallLocked && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsMiniDAWOpen(true); }}
                    className="p-2 md:p-1.5 text-text-secondary hover:text-accent-light rounded-md hover:bg-surface transition-all lg:opacity-0 lg:group-hover/audio:opacity-100"
                    title="Abrir en Mini-DAW (editor de audio)"
                  >
                    <Scissors className="w-4 h-4 md:w-3.5 md:h-3.5" />
                  </button>
                )}
                {!isPortal && (
                  <button
                    onClick={startRename}
                    className="p-2 md:p-1.5 text-text-secondary hover:text-accent-light rounded-md hover:bg-surface transition-all hidden sm:flex lg:opacity-0 lg:group-hover/audio:opacity-100"
                    title="Renombrar"
                  >
                    <Edit3 className="w-4 h-4 md:w-3.5 md:h-3.5" />
                  </button>
                )}
                {!isPortal && folders.length > 0 && (
                  <button
                    onClick={handleMove}
                    className="p-2 md:p-1.5 text-text-secondary hover:text-accent-light rounded-md hover:bg-surface transition-all hidden sm:flex lg:opacity-0 lg:group-hover/audio:opacity-100"
                    title="Mover"
                  >
                    <FolderInput className="w-4 h-4 md:w-3.5 md:h-3.5" />
                  </button>
                )}
                
                {paywallLocked ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); customAlert('Descarga bloqueada. Tienes pagos pendientes.'); }}
                    className="p-2 md:p-1.5 text-warning hover:text-warning/80 rounded-md hover:bg-warning/10 transition-all"
                    title="Pago pendiente"
                  >
                    <Lock className="w-4 h-4 md:w-3.5 md:h-3.5" />
                  </button>
                ) : (
                  <a
                    href={`/api/audio/${activeId}`}
                    download={activeName}
                    onClick={(e) => e.stopPropagation()}
                    className="p-2 md:p-1.5 text-text-secondary hover:text-accent-light rounded-md hover:bg-surface transition-all lg:opacity-0 lg:group-hover/audio:opacity-100"
                    title="Descargar"
                  >
                    <Download className="w-4 h-4 md:w-3.5 md:h-3.5" />
                  </a>
                )}
                
                {!isPortal && (
                  <button
                    onClick={handleDelete}
                    className="p-2 md:p-1.5 text-text-secondary hover:text-error rounded-md hover:bg-error/10 transition-all hidden sm:flex lg:opacity-0 lg:group-hover/audio:opacity-100"
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4 md:w-3.5 md:h-3.5" />
                  </button>
                )}
                <a
                  href={`/api/audio/${activeId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="p-2 md:p-1.5 text-text-secondary hover:text-accent rounded-md hover:bg-surface transition-all"
                  title="Abrir en nueva pestaña"
                >
                  <ExternalLink className="w-4 h-4 md:w-3.5 md:h-3.5" />
                </a>
              </>
            )}
          </div>
        </div>

        {/* Progress Bar — taller on mobile for touch */}
        <div 
          className="w-full h-3 md:h-1 bg-border/40 rounded-full cursor-pointer relative overflow-hidden group/progress"
          onClick={(e) => {
            e.stopPropagation();
            if (!isThisTrackActive || duration === 0) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            seek((x / rect.width) * duration);
          }}
        >
          <div 
            className={cn("h-full transition-all duration-100 rounded-full", isThisTrackActive ? "bg-accent" : "bg-text-secondary/30")}
            style={{ width: isThisTrackActive && duration > 0 ? `${(currentTime / duration) * 100}%` : '0%' }}
          />
          {/* Comment Markers */}
          {duration > 0 && comments.map(c => (
            <div 
              key={c.id} 
              className="absolute w-2 h-2 rounded-full bg-accent cursor-pointer group/comment hover:scale-125 transition-transform shadow-[0_0_8px_rgba(108,92,231,0.6)]"
              style={{ left: `${(c.time / duration) * 100}%`, top: '50%', transform: 'translate(-50%, -50%)' }}
              onClick={(e) => { e.stopPropagation(); seek(c.time); }}
            >
              <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 hidden group-hover/comment:block bg-surface border border-border text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap z-20 text-text-primary pointer-events-none">
                {c.text}
              </div>
            </div>
          ))}
        </div>
      </div>
      </div>
      {/* Inline Comment Box */}
      {commentTime !== null && (
        <div className="flex items-center gap-3 bg-surface-elevated border border-border p-3 rounded-lg animate-fade-in shadow-sm ml-12">
          <span className="text-xs font-mono font-bold bg-accent/10 text-accent px-2 py-1 rounded">
            {Math.floor(commentTime / 60)}:{Math.floor(commentTime % 60).toString().padStart(2, '0')}
          </span>
          <input 
            type="text" 
            autoFocus 
            className="flex-1 bg-transparent text-sm border-none focus:ring-0 p-0 text-text-primary placeholder:text-text-secondary/50" 
            placeholder="Añade un comentario en este instante..." 
            value={commentText} 
            onChange={e => setCommentText(e.target.value)} 
            onKeyDown={e => e.key === 'Enter' && handleCommentSubmit()}
          />
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={handleCommentSubmit} className="text-xs font-semibold bg-accent text-white px-3 py-1.5 rounded-md hover:bg-accent-hover transition-colors">Guardar</button>
            <button onClick={() => setCommentTime(null)} className="p-1.5 text-text-secondary hover:text-text-primary rounded-md hover:bg-surface transition-colors"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}
    </div>

    {/* Mini-DAW Modal — rendered via portal to document.body, isolated from stacking context */}
    {isMiniDAWOpen && (
      <DAWErrorBoundary onClose={() => setIsMiniDAWOpen(false)}>
        <MiniDAWModal
          fileId={activeId}
          fileName={activeName}
          onClose={() => setIsMiniDAWOpen(false)}
        />
      </DAWErrorBoundary>
    )}
    </>
  );
}
