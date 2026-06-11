'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Pause, Play, Download, Trash2, Edit3, FolderInput, ExternalLink, MessageSquare, X } from 'lucide-react';
import { useAudio } from '@/lib/contexts/AudioContext';
import { cn } from '@/lib/utils';
import { customAlert, customConfirm, customPrompt } from '@/lib/dialog';


interface WaveformPlayerProps {
  fileId: string;
  fileName: string;
  artistName?: string;
  onContextMenu?: React.MouseEventHandler<HTMLDivElement>;
  folders?: { id: string; name: string }[];
  onRefresh?: () => void;
  currentFolderId?: string;
}

const BAR_COUNT = 70; // Fewer, thicker bars for minimalist look
const CANVAS_HEIGHT = 24; // Slimmer height

export function WaveformPlayer({ 
  fileId, 
  fileName, 
  artistName, 
  onContextMenu,
  folders = [],
  onRefresh,
  currentFolderId
}: WaveformPlayerProps) {
  const { currentTrack, isPlaying, duration, currentTime, playTrack, togglePlay, seek } = useAudio();

  const [displayName, setDisplayName] = useState(fileName.replace(/\.[^/.]+$/, ''));
  const isThisTrackActive = currentTrack?.id === fileId;
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

  // Comments
  const [commentTime, setCommentTime] = useState<number | null>(null);
  const [commentText, setCommentText] = useState('');
  const [comments, setComments] = useState<{id: string, time: number, text: string}[]>([]);

  useEffect(() => {
    setDisplayName(fileName.replace(/\.[^/.]+$/, ''));
  }, [fileName]);

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
        const cacheKey = `waveform_v3_hq_${fileId}`;
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

        const response = await fetch(`/api/audio/${fileId}`);
        const arrayBuffer = await response.arrayBuffer();
        if (cancelled) return;

        const offlineCtx = new OfflineAudioContext(1, 1, 44100);
        const decoded = await offlineCtx.decodeAudioData(arrayBuffer);
        if (cancelled) return;

        const channelData = decoded.getChannelData(0);
        const blockSize = Math.floor(channelData.length / BAR_COUNT);
        const bars: number[] = [];

        for (let i = 0; i < BAR_COUNT; i++) {
          let sum = 0;
          const start = i * blockSize;
          for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(channelData[start + j]);
          }
          bars.push(sum / blockSize);
        }

        const max = Math.max(...bars, 0.001);
        // Exagerate waveform slightly to make it pop
        const normalized = bars.map((v) => Math.pow(v / max, 0.8));

        if (!cancelled) {
          setWaveformData(normalized);
          setIsLoadingWaveform(false);
          try {
            localStorage.setItem(cacheKey, JSON.stringify(normalized));
          } catch (e) { }
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
      playTrack({ id: fileId, name: displayName, url: `/api/audio/${fileId}`, artistName });
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
      playTrack({ id: fileId, name: displayName, url: `/api/audio/${fileId}`, artistName });
    }
  }, [isThisTrackActive, duration, canvasWidth, seek, playTrack, fileId, displayName, artistName]);

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

    const currentExt = fileName.substring(fileName.lastIndexOf('.'));
    const newName = editNameValue.trim();

    setIsUpdating(true);
    try {
      const res = await fetch('/api/files', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, name: newName + currentExt }),
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
        body: JSON.stringify({ fileId, newParentId: targetFolder.id, oldParentId: currentFolderId }),
      });
      if (!res.ok) throw new Error('Error al mover el archivo');
      customAlert(`Archivo movido con éxito a ${targetFolder.name}`);
      if (onRefresh) onRefresh();
    } catch (err: any) { customAlert(err.message); } finally { setIsUpdating(false); }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!await customConfirm(`¿Estás seguro de que quieres eliminar el archivo "${fileName}" de forma permanente?`)) return;
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/files?id=${fileId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al eliminar el archivo');
      if (onRefresh) onRefresh();
    } catch (err: any) { customAlert(err.message); } finally { setIsUpdating(false); }
  };

  const startCommenting = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isThisTrackActive) {
      playTrack({ id: fileId, name: displayName, url: `/api/audio/${fileId}`, artistName });
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

  return (
    <div className="flex flex-col gap-2">
      <div
        onContextMenu={onContextMenu}
        className={cn(
          'py-2 px-3 rounded-xl border bg-surface-elevated/40 flex items-center justify-between gap-4 transition-all group/audio shadow-sm hover:shadow-md hover:bg-surface-elevated/70',
          isThisTrackActive ? 'border-accent shadow-[0_0_15px_rgba(108,92,231,0.15)] bg-accent/5' : 'border-border/60 hover:border-accent/40'
        )}
      )}
    >
      {/* 1. Play Button & Title */}
      <div className="flex items-center gap-3 min-w-0 flex-1 sm:max-w-[35%]">
        <button
          className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 shadow-sm hover:scale-105',
            isThisTrackActive ? 'bg-accent text-white shadow-accent/40' : 'bg-surface border border-border text-text-primary hover:border-accent hover:text-accent'
          )}
          onClick={handlePlayClick}
        >
          {isThisTrackPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
        </button>

        <div className="flex-1 min-w-0">
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
            <span 
              className={cn('text-[13px] font-semibold truncate block transition-colors cursor-text', isThisTrackActive ? 'text-accent' : 'text-text-primary hover:text-accent')} 
              title={displayName}
              onDoubleClick={startRename}
            >
              {displayName}
            </span>
          )}
        </div>
      </div>

      {/* 2. Waveform canvas */}
      <div ref={containerRef} className="relative flex-1 hidden md:flex items-end max-w-[45%]" style={{ height: CANVAS_HEIGHT * 1.3 }}>
        {isLoadingWaveform && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-full h-1/2 bg-surface rounded-full animate-pulse opacity-50" />
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="w-full cursor-pointer"
          style={{ display: isLoadingWaveform ? 'none' : 'block' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleCanvasClick}
        />
        {hoverX !== null && !isLoadingWaveform && (
          <span
            className="absolute top-0 bg-surface-elevated border border-border text-text-primary text-[10px] font-mono px-1.5 py-0.5 rounded pointer-events-none z-10 shadow-lg"
            style={{ left: Math.min(hoverX + 4, canvasWidth - 40), transform: 'translateY(-50%)' }}
          >
            {getTimeAtX(hoverX)}
          </span>
        )}
        {/* Comment Markers */}
        {duration > 0 && comments.map(c => (
          <div 
            key={c.id} 
            className="absolute w-2.5 h-2.5 rounded-full bg-accent cursor-pointer group/comment hover:scale-125 transition-transform shadow-[0_0_8px_rgba(108,92,231,0.6)]"
            style={{ left: `${(c.time / duration) * 100}%`, bottom: '-4px', transform: 'translateX(-50%)' }}
            onClick={(e) => { e.stopPropagation(); seek(c.time); }}
          >
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover/comment:block bg-surface border border-border text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap z-20 text-text-primary">
              {c.text}
            </div>
          </div>
        ))}
      </div>

      {/* 3. Action Buttons */}
      <div className="flex items-center gap-1.5 shrink-0">
        {isUpdating ? (
          <Loader2 className="w-4 h-4 animate-spin text-accent mr-2" />
        ) : (
          <>
            <button onClick={startCommenting} className="p-1.5 text-text-secondary hover:text-accent rounded-md hover:bg-surface opacity-0 group-hover/audio:opacity-100 transition-all"><MessageSquare className="w-3.5 h-3.5" /></button>
            <button onClick={startRename} className="p-1.5 text-text-secondary hover:text-accent-light rounded-md hover:bg-surface opacity-0 group-hover/audio:opacity-100 transition-all"><Edit3 className="w-3.5 h-3.5" /></button>
            <button onClick={handleMove} className="p-1.5 text-text-secondary hover:text-accent-light rounded-md hover:bg-surface opacity-0 group-hover/audio:opacity-100 transition-all"><FolderInput className="w-3.5 h-3.5" /></button>
            <a href={`/api/audio/${fileId}`} download={fileName} onClick={(e) => e.stopPropagation()} className="p-1.5 text-text-secondary hover:text-accent-light rounded-md hover:bg-surface opacity-0 group-hover/audio:opacity-100 transition-all"><Download className="w-3.5 h-3.5" /></a>
            <button onClick={handleDelete} className="p-1.5 text-text-secondary hover:text-error rounded-md hover:bg-error/10 opacity-0 group-hover/audio:opacity-100 transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
            <a href={`/api/audio/${fileId}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="p-1.5 text-text-secondary hover:text-accent rounded-md hover:bg-surface"><ExternalLink className="w-3.5 h-3.5" /></a>
          </>
        )}
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
  );
}
