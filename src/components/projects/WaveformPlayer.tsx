'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, ExternalLink, Edit3, FolderInput, Download, Trash2, Loader2 } from 'lucide-react';
import { useAudio } from '@/lib/contexts/AudioContext';
import { cn } from '@/lib/utils';

interface WaveformPlayerProps {
  fileId: string;
  fileName: string;
  artistName?: string;
  onContextMenu?: React.MouseEventHandler<HTMLDivElement>;
  folders?: { id: string; name: string }[];
  onRefresh?: () => void;
  currentFolderId?: string;
}

const BAR_COUNT = 45; // reduced bar count for compact canvas
const CANVAS_HEIGHT = 20; // reduced height

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

  useEffect(() => {
    setDisplayName(fileName.replace(/\.[^/.]+$/, ''));
  }, [fileName]);

  // Observe container width
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

  // Lazily fetch and decode audio for waveform
  useEffect(() => {
    if (waveformData) return;
    setIsLoadingWaveform(true);

    let cancelled = false;
    const generate = async () => {
      try {
        const cacheKey = `waveform_v2_compact_${fileId}`;
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
        const normalized = bars.map((v) => v / max);

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
            0.3 + 0.5 * Math.sin(i * 0.4) * Math.random()
          );
          setWaveformData(fallback);
          setIsLoadingWaveform(false);
        }
      }
    };

    generate();
    return () => { cancelled = true; };
  }, [fileId, waveformData]);

  // Draw waveform on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveformData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasWidth * dpr;
    canvas.height = CANVAS_HEIGHT * dpr;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${CANVAS_HEIGHT}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, canvasWidth, CANVAS_HEIGHT);

    const barWidth = (canvasWidth - BAR_COUNT * 1) / BAR_COUNT;
    const progress = isThisTrackActive && duration > 0 ? currentTime / duration : 0;
    const progressX = progress * canvasWidth;

    for (let i = 0; i < BAR_COUNT; i++) {
      const x = i * (barWidth + 1);
      const barH = Math.max(3, waveformData[i] * CANVAS_HEIGHT * 0.9);
      const y = (CANVAS_HEIGHT - barH) / 2;

      const barCenterX = x + barWidth / 2;
      const isPlayed = barCenterX <= progressX;

      if (isThisTrackActive && isPlayed) {
        ctx.fillStyle = '#6c5ce7';
      } else if (isThisTrackActive) {
        ctx.fillStyle = 'rgba(108, 92, 231, 0.25)';
      } else {
        ctx.fillStyle = '#2a2a3a';
      }

      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barH, 1.5);
      ctx.fill();
    }

    if (hoverX !== null) {
      ctx.fillStyle = 'rgba(240, 240, 245, 0.6)';
      ctx.fillRect(hoverX, 0, 1.5, CANVAS_HEIGHT);
    }
  }, [waveformData, canvasWidth, isThisTrackActive, currentTime, duration, hoverX]);

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isThisTrackActive) {
      togglePlay();
    } else {
      playTrack({
        id: fileId,
        name: displayName,
        url: `/api/audio/${fileId}`,
        artistName,
      });
    }
  };

  const getTimeAtX = useCallback(
    (x: number): string => {
      if (!duration || !canvasWidth) return '0:00';
      const t = (x / canvasWidth) * duration;
      const m = Math.floor(t / 60);
      const s = Math.floor(t % 60);
      return `${m}:${s.toString().padStart(2, '0')}`;
    },
    [duration, canvasWidth]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      setHoverX(e.clientX - rect.left);
    },
    []
  );

  const handleMouseLeave = useCallback(() => setHoverX(null), []);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.stopPropagation();
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;

      if (isThisTrackActive && duration > 0) {
        seek((x / canvasWidth) * duration);
      } else {
        playTrack({
          id: fileId,
          name: displayName,
          url: `/api/audio/${fileId}`,
          artistName,
        });
      }
    },
    [isThisTrackActive, duration, canvasWidth, seek, playTrack, fileId, displayName, artistName]
  );

  // Rename action
  const handleRename = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const currentExt = fileName.substring(fileName.lastIndexOf('.'));
    const newName = prompt('Introduce el nuevo nombre del archivo:', displayName);
    if (!newName || newName.trim() === '' || newName === displayName) return;

    setIsUpdating(true);
    try {
      const res = await fetch('/api/files', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId,
          name: newName.trim() + currentExt,
        }),
      });
      if (!res.ok) throw new Error('Error al renombrar archivo');
      setDisplayName(newName.trim());
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  // Move action
  const handleMove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!folders.length) return;

    // Create a simple prompt listing folders
    const options = folders.map((f, i) => `${i + 1}. ${f.name}`).join('\n');
    const choice = prompt(`Mover a:\n\n${options}\n\nIntroduce el número de la carpeta de destino:`);
    if (!choice) return;

    const idx = parseInt(choice, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= folders.length) {
      alert('Selección no válida.');
      return;
    }

    const targetFolder = folders[idx];
    if (targetFolder.id === currentFolderId) {
      alert('El archivo ya está en esa carpeta.');
      return;
    }

    setIsUpdating(true);
    try {
      const res = await fetch('/api/files', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId,
          newParentId: targetFolder.id,
          oldParentId: currentFolderId,
        }),
      });
      if (!res.ok) throw new Error('Error al mover el archivo');
      alert(`Archivo movido con éxito a ${targetFolder.name}`);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  // Delete action
  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`¿Estás seguro de que quieres eliminar el archivo "${fileName}" de forma permanente?`)) return;

    setIsUpdating(true);
    try {
      const res = await fetch(`/api/files?id=${fileId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al eliminar el archivo');
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div
      onContextMenu={onContextMenu}
      className={cn(
        'py-1.5 px-3 rounded-lg border bg-surface-elevated/50 flex items-center justify-between gap-4 transition-colors group/audio',
        isThisTrackActive
          ? 'border-accent shadow-[0_0_10px_rgba(108,92,231,0.1)] bg-accent/5'
          : 'border-border hover:border-accent/30'
      )}
    >
      {/* 1. Play Button & Title */}
      <div className="flex items-center gap-3 min-w-0 flex-1 sm:max-w-[40%]">
        <button
          className={cn(
            'w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all',
            isThisTrackActive
              ? 'bg-accent text-white'
              : 'bg-accent/10 text-accent hover:bg-accent hover:text-white'
          )}
          onClick={handlePlayClick}
          aria-label={isThisTrackPlaying ? 'Pausar' : 'Reproducir'}
        >
          {isThisTrackPlaying ? (
            <Pause className="w-3 h-3 fill-current" />
          ) : (
            <Play className="w-3 h-3 fill-current ml-0.5" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <span
            className={cn(
              'text-sm font-medium truncate block',
              isThisTrackActive ? 'text-accent' : 'text-text-primary'
            )}
            title={displayName}
          >
            {displayName}
          </span>
        </div>
      </div>

      {/* 2. Waveform canvas - Inline middle */}
      <div ref={containerRef} className="relative flex-1 hidden md:block max-w-[40%] h-5" style={{ height: CANVAS_HEIGHT }}>
        {isLoadingWaveform && (
          <div className="absolute inset-0 rounded animate-pulse bg-white/5" style={{ height: CANVAS_HEIGHT }} />
        )}
        <canvas
          ref={canvasRef}
          className="w-full cursor-pointer"
          style={{ height: CANVAS_HEIGHT, display: isLoadingWaveform ? 'none' : 'block' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleCanvasClick}
        />
        {hoverX !== null && !isLoadingWaveform && (
          <span
            className="absolute top-0 bg-surface-elevated text-text-primary text-[9px] font-mono px-1 py-0.5 rounded pointer-events-none z-10"
            style={{
              left: Math.min(hoverX + 4, canvasWidth - 36),
              transform: 'translateY(-100%)',
              top: 0,
            }}
          >
            {getTimeAtX(hoverX)}
          </span>
        )}
      </div>

      {/* 3. Action Buttons - Inline right */}
      <div className="flex items-center gap-1 shrink-0">
        {isUpdating ? (
          <Loader2 className="w-4 h-4 animate-spin text-accent" />
        ) : (
          <>
            <button
              onClick={handleRename}
              className="p-1 text-text-secondary hover:text-accent-light rounded hover:bg-surface/50 opacity-0 group-hover/audio:opacity-100 transition-opacity"
              title="Renombrar archivo"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleMove}
              className="p-1 text-text-secondary hover:text-accent-light rounded hover:bg-surface/50 opacity-0 group-hover/audio:opacity-100 transition-opacity"
              title="Mover de carpeta"
            >
              <FolderInput className="w-3.5 h-3.5" />
            </button>
            <a
              href={`/api/audio/${fileId}`}
              download={fileName}
              onClick={(e) => e.stopPropagation()}
              className="p-1 text-text-secondary hover:text-accent-light rounded hover:bg-surface/50 opacity-0 group-hover/audio:opacity-100 transition-opacity"
              title="Descargar"
            >
              <Download className="w-3.5 h-3.5" />
            </a>
            <button
              onClick={handleDelete}
              className="p-1 text-text-secondary hover:text-error rounded hover:bg-error/10 opacity-0 group-hover/audio:opacity-100 transition-opacity"
              title="Eliminar"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <a
              href={`/api/audio/${fileId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 text-text-secondary hover:text-accent rounded hover:bg-surface/50"
              onClick={(e) => e.stopPropagation()}
              title="Ver en Drive"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </>
        )}
      </div>
    </div>
  );
}
