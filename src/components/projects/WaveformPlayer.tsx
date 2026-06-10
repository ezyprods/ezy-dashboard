'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, ExternalLink } from 'lucide-react';
import { useAudio } from '@/lib/contexts/AudioContext';
import { cn } from '@/lib/utils';

interface WaveformPlayerProps {
  fileId: string;
  fileName: string;
  artistName?: string;
  onContextMenu?: React.MouseEventHandler<HTMLDivElement>;
}

const BAR_COUNT = 80;
const CANVAS_HEIGHT = 48;

export function WaveformPlayer({ fileId, fileName, artistName, onContextMenu }: WaveformPlayerProps) {
  const { currentTrack, isPlaying, duration, currentTime, playTrack, togglePlay, seek } = useAudio();

  const displayName = fileName.replace(/\.[^/.]+$/, '');
  const isThisTrackActive = currentTrack?.id === fileId;
  const isThisTrackPlaying = isThisTrackActive && isPlaying;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [waveformData, setWaveformData] = useState<number[] | null>(null);
  const [isLoadingWaveform, setIsLoadingWaveform] = useState(false);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(300);

  // Observe container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setCanvasWidth(Math.floor(w));
    });
    ro.observe(el);
    setCanvasWidth(el.clientWidth || 300);
    return () => ro.disconnect();
  }, []);

  // Lazily fetch and decode audio for waveform
  useEffect(() => {
    if (waveformData) return;
    setIsLoadingWaveform(true);

    let cancelled = false;
    const generate = async () => {
      try {
        // 1. Check local cache first
        const cacheKey = `waveform_v1_${fileId}`;
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
          } catch (e) { /* ignore parse error */ }
        }

        // 2. Not in cache, fetch and decode
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

        // Normalize
        const max = Math.max(...bars, 0.001);
        const normalized = bars.map((v) => v / max);

        if (!cancelled) {
          setWaveformData(normalized);
          setIsLoadingWaveform(false);
          try {
            localStorage.setItem(cacheKey, JSON.stringify(normalized));
          } catch (e) { /* ignore storage errors */ }
        }
      } catch (e) {
        if (!cancelled) {
          // Fallback: random-looking waveform so something renders
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

    // Accent color: #6c5ce7, inactive: #2a2a3a (border)
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
      ctx.roundRect(x, y, barWidth, barH, 2);
      ctx.fill();
    }

    // Hover cursor line
    if (hoverX !== null) {
      ctx.fillStyle = 'rgba(240, 240, 245, 0.6)';
      ctx.fillRect(hoverX, 0, 1.5, CANVAS_HEIGHT);
    }
  }, [waveformData, canvasWidth, isThisTrackActive, currentTime, duration, hoverX]);

  const handlePlayClick = () => {
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
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;

      if (isThisTrackActive && duration > 0) {
        seek((x / canvasWidth) * duration);
      } else {
        // Start playing from beginning first, then seek once metadata loads
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

  return (
    <div
      onContextMenu={onContextMenu}
      className={cn(
        'p-3 rounded-lg border bg-surface-elevated/50 flex flex-col gap-2 transition-colors',
        isThisTrackActive
          ? 'border-accent shadow-[0_0_15px_rgba(108,92,231,0.15)] bg-accent/5'
          : 'border-border hover:border-accent/30'
      )}
    >
      {/* Top row: play button + name */}
      <div className="flex items-center gap-3">
        <button
          className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all',
            isThisTrackActive
              ? 'bg-accent text-white'
              : 'bg-accent/10 text-accent hover:bg-accent hover:text-white'
          )}
          onClick={handlePlayClick}
          aria-label={isThisTrackPlaying ? 'Pausar' : 'Reproducir'}
        >
          {isThisTrackPlaying ? (
            <Pause className="w-4 h-4 fill-current" />
          ) : (
            <Play className="w-4 h-4 fill-current ml-0.5" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <span
            className={cn(
              'text-sm font-medium truncate block',
              isThisTrackActive ? 'text-accent' : 'text-text-primary'
            )}
          >
            {displayName}
          </span>
          {isThisTrackActive && (
            <div className="flex items-center gap-1 mt-0.5">
              <span className="w-1 h-1 bg-accent rounded-full animate-pulse" />
              <span className="text-[10px] text-accent uppercase tracking-wider font-bold">
                {isThisTrackPlaying ? 'Reproduciendo' : 'En pausa'}
              </span>
            </div>
          )}
        </div>

        <a
          href={`/api/audio/${fileId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-text-secondary hover:text-accent flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Waveform canvas row */}
      <div ref={containerRef} className="relative w-full group/waveform" style={{ height: CANVAS_HEIGHT }}>
        {isLoadingWaveform && (
          <div
            className="absolute inset-0 rounded animate-skeleton"
            style={{ height: CANVAS_HEIGHT }}
          />
        )}
        <canvas
          ref={canvasRef}
          className="w-full cursor-pointer"
          style={{ height: CANVAS_HEIGHT, display: isLoadingWaveform ? 'none' : 'block' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleCanvasClick}
        />
        {/* Hover time tooltip */}
        {hoverX !== null && !isLoadingWaveform && (
          <span
            className="absolute top-0 bg-surface-elevated text-text-primary text-[10px] font-mono px-1 py-0.5 rounded pointer-events-none"
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
    </div>
  );
}
