'use client';

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useLayoutEffect,
  useMemo,
} from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Play,
  Pause,
  Scissors,
  Volume2,
  Download,
  Loader2,
  CheckCircle,
  AlertTriangle,
  SkipBack,
  SkipForward,
  RefreshCw,
} from 'lucide-react';
import { useMiniDAW } from '@/hooks/useMiniDAW';
import { customConfirm } from '@/lib/dialog';
import { cn } from '@/lib/utils';

// ─── Constants ─────────────────────────────────────────────────────────────────
const WAVEFORM_HEIGHT = 120; // px
const RULER_HEIGHT = 20; // px
const HANDLE_WIDTH = 10; // px (hit target)

// ─── Props ─────────────────────────────────────────────────────────────────────
interface MiniDAWModalProps {
  fileId: string;
  fileName: string;
  onClose: () => void;
}

// ─── Format helpers ────────────────────────────────────────────────────────────
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${m}:${String(s).padStart(2, '0')}.${ms}`;
}

// ─── Main Component ────────────────────────────────────────────────────────────
export function MiniDAWModal({ fileId, fileName, onClose }: MiniDAWModalProps) {
  const daw = useMiniDAW();

  // Local AudioContext for preview playback (isolated from the global AudioProvider)
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0); // seconds from trimStart
  const playheadTimerRef = useRef<number | null>(null);
  const playStartAtRef = useRef(0); // AudioContext.currentTime when play started
  const playOffsetRef = useRef(0); // offset in decoded buffer

  // Canvas & Zoom
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(800);
  const [zoomLevel, setZoomLevel] = useState(1);
  const canvasWidth = Math.floor(viewportWidth * zoomLevel);

  // Drag state for trim handles
  const draggingRef = useRef<'start' | 'end' | 'playhead' | null>(null);

  // Export format
  const [exportFormat, setExportFormat] = useState<'wav' | 'mp3'>('wav');

  // ── Load audio when modal mounts ───────────────────────────────────────────
  useEffect(() => {
    daw.loadAudio(fileId, fileName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  // ── Canvas resize observer ─────────────────────────────────────────────────
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      if (w > 0) setViewportWidth(Math.floor(w));
    });
    ro.observe(el);
    setViewportWidth(el.clientWidth || 800);
    return () => ro.disconnect();
  }, []);

  // ── AudioContext bootstrap ─────────────────────────────────────────────────
  const getOrCreateAudioCtx = useCallback((): AudioContext => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  }, []);

  // ── Stop playback helper ───────────────────────────────────────────────────
  const stopPlayback = useCallback(() => {
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch (_) {}
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (playheadTimerRef.current) {
      cancelAnimationFrame(playheadTimerRef.current);
      playheadTimerRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  // ── Play preview ───────────────────────────────────────────────────────────
  const handlePlay = useCallback(() => {
    const buffer = daw.audioBuffer;
    if (!buffer || daw.status !== 'ready') return;

    if (isPlaying) {
      stopPlayback();
      return;
    }

    try {
      const ctx = getOrCreateAudioCtx();

      // Resume if suspended (browser autoplay policy)
      if (ctx.state === 'suspended') {
        ctx.resume().catch(console.error);
      }

      const source = ctx.createBufferSource();
      const gainNode = ctx.createGain();

      source.buffer = buffer;
      gainNode.gain.value = daw.gain;
      source.connect(gainNode).connect(ctx.destination);

      const startOffset = daw.trimStart + playhead;
      const endOffset = daw.trimEnd;
      const playDuration = endOffset - startOffset;

      if (playDuration <= 0) {
        setPlayhead(0);
        return;
      }

      sourceNodeRef.current = source;
      gainNodeRef.current = gainNode;

      playStartAtRef.current = ctx.currentTime;
      playOffsetRef.current = startOffset;

      source.start(0, startOffset, playDuration);
      source.onended = () => {
        setIsPlaying(false);
        setPlayhead(0);
        if (playheadTimerRef.current) cancelAnimationFrame(playheadTimerRef.current);
      };

      setIsPlaying(true);

      // Animate playhead
      const animate = () => {
        const ctx2 = audioCtxRef.current;
        if (!ctx2) return;
        const elapsed = ctx2.currentTime - playStartAtRef.current;
        const pos = playOffsetRef.current - daw.trimStart + elapsed;
        setPlayhead(Math.min(pos, playDuration));
        playheadTimerRef.current = requestAnimationFrame(animate);
      };
      playheadTimerRef.current = requestAnimationFrame(animate);
    } catch (err) {
      console.error('[MiniDAWModal] Play error:', err);
    }
  }, [isPlaying, daw, playhead, stopPlayback, getOrCreateAudioCtx]);

  // ── Skip to start/end of trim region ──────────────────────────────────────
  const skipToStart = useCallback(() => { stopPlayback(); setPlayhead(0); }, [stopPlayback]);
  const skipToEnd = useCallback(() => {
    stopPlayback();
    setPlayhead(daw.trimEnd - daw.trimStart);
  }, [stopPlayback, daw.trimEnd, daw.trimStart]);

  // ── Cleanup AudioContext on unmount ────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopPlayback();
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, [stopPlayback]);

  // ── Precompute waveform peaks ──────────────────────────────────────────────
  const peaks = useMemo(() => {
    const buffer = daw.audioBuffer;
    if (!buffer) return [];
    
    const channelData = buffer.getChannelData(0);
    const BAR_COUNT = Math.max(100, Math.floor(canvasWidth / 3));
    const blockSize = Math.floor(channelData.length / BAR_COUNT);
    const result = new Float32Array(BAR_COUNT);
    
    for (let i = 0; i < BAR_COUNT; i++) {
      let peak = 0;
      const base = i * blockSize;
      for (let j = 0; j < blockSize; j++) {
        const v = Math.abs(channelData[base + j]);
        if (v > peak) peak = v;
      }
      result[i] = Math.min(peak * 1.4, 1);
    }
    return result;
  }, [daw.audioBuffer, canvasWidth]);

  // ── Draw waveform on canvas ────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const buffer = daw.audioBuffer;
    if (!canvas || !buffer || daw.status !== 'ready') return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const totalH = WAVEFORM_HEIGHT + RULER_HEIGHT;

    canvas.width = canvasWidth * dpr;
    canvas.height = totalH * dpr;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${totalH}px`;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, canvasWidth, totalH);

    // ── Ruler ──────────────────────────────────────────────────────────────
    const style = getComputedStyle(document.documentElement);
    const rulerTextColor = style.getPropertyValue('--daw-ruler-text').trim() || '#8888a0';

    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(0, 0, canvasWidth, RULER_HEIGHT);

    ctx.fillStyle = rulerTextColor;
    ctx.font = `10px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';

    const tickCount = Math.min(Math.floor(canvasWidth / 60), 20);
    for (let i = 0; i <= tickCount; i++) {
      const x = (i / tickCount) * canvasWidth;
      const t = (i / tickCount) * buffer.duration;
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(x, RULER_HEIGHT - 6, 1, 6);
      ctx.fillStyle = rulerTextColor;
      ctx.fillText(formatTime(t), x, RULER_HEIGHT - 8);
    }

    // ── Waveform bars ──────────────────────────────────────────────────────
    const BAR_COUNT = peaks.length;
    const barW = canvasWidth / BAR_COUNT;
    const waveY = RULER_HEIGHT;

    for (let i = 0; i < BAR_COUNT; i++) {
      const amp = peaks[i];
      const barH = Math.max(2, amp * WAVEFORM_HEIGHT);
      const x = i * barW;
      const timeAtBar = (i / BAR_COUNT) * buffer.duration;

      const inRegion = timeAtBar >= daw.trimStart && timeAtBar <= daw.trimEnd;

      if (inRegion) {
        const g = ctx.createLinearGradient(x, waveY, x, waveY + WAVEFORM_HEIGHT);
        g.addColorStop(0, '#a29bfe');
        g.addColorStop(0.5, '#6c5ce7');
        g.addColorStop(1, '#a29bfe');
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
      }

      ctx.beginPath();
      ctx.roundRect(
        x + barW * 0.1,
        waveY + (WAVEFORM_HEIGHT - barH) / 2,
        barW * 0.8,
        barH,
        2
      );
      ctx.fill();
    }

    // ── Selected region overlay ────────────────────────────────────────────
    const startX = (daw.trimStart / buffer.duration) * canvasWidth;
    const endX = (daw.trimEnd / buffer.duration) * canvasWidth;

    ctx.fillStyle = 'rgba(108, 92, 231, 0.08)';
    ctx.fillRect(startX, RULER_HEIGHT, endX - startX, WAVEFORM_HEIGHT);

    // ── Trim handles ───────────────────────────────────────────────────────
    const drawHandle = (x: number, side: 'left' | 'right') => {
      // Stem line
      ctx.fillStyle = '#a29bfe';
      ctx.fillRect(x - 1, RULER_HEIGHT, 2, WAVEFORM_HEIGHT);

      // Handle cap
      const capW = 10;
      const capH = 22;
      const capX = side === 'left' ? x : x - capW;
      const capY = RULER_HEIGHT + WAVEFORM_HEIGHT / 2 - capH / 2;

      ctx.fillStyle = '#a29bfe';
      ctx.beginPath();
      ctx.roundRect(capX, capY, capW, capH, 4);
      ctx.fill();

      // Arrow indicator
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      if (side === 'left') {
        ctx.moveTo(capX + 3, capY + capH / 2);
        ctx.lineTo(capX + 7, capY + capH / 2 - 4);
        ctx.lineTo(capX + 7, capY + capH / 2 + 4);
      } else {
        ctx.moveTo(capX + capW - 3, capY + capH / 2);
        ctx.lineTo(capX + capW - 7, capY + capH / 2 - 4);
        ctx.lineTo(capX + capW - 7, capY + capH / 2 + 4);
      }
      ctx.fill();
    };

    drawHandle(startX, 'left');
    drawHandle(endX, 'right');

    // ── Playhead ──────────────────────────────────────────────────────────
    if (buffer.duration > 0) {
      const phTime = daw.trimStart + playhead;
      const phX = (phTime / buffer.duration) * canvasWidth;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(phX - 1, RULER_HEIGHT, 2, WAVEFORM_HEIGHT);

      // Playhead triangle
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(phX - 5, RULER_HEIGHT);
      ctx.lineTo(phX + 5, RULER_HEIGHT);
      ctx.lineTo(phX, RULER_HEIGHT + 10);
      ctx.fill();
    }
  }, [daw.audioBuffer, daw.status, daw.trimStart, daw.trimEnd, canvasWidth, playhead, peaks]);

  // ── Canvas pointer events (dragging handles) ──────────────────────────────
  const getTimeAtX = useCallback(
    (x: number): number => {
      const dur = daw.audioBuffer?.duration ?? 1;
      return Math.max(0, Math.min((x / canvasWidth) * dur, dur));
    },
    [canvasWidth, daw.audioBuffer]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (daw.status !== 'ready' || !daw.audioBuffer) return;
      const rect = canvasRef.current!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const dur = daw.audioBuffer.duration;

      const startX = (daw.trimStart / dur) * canvasWidth;
      const endX = (daw.trimEnd / dur) * canvasWidth;

      const hitStart = Math.abs(x - startX) <= HANDLE_WIDTH + 2;
      const hitEnd = Math.abs(x - endX) <= HANDLE_WIDTH + 2;

      if (hitStart) {
        draggingRef.current = 'start';
      } else if (hitEnd) {
        draggingRef.current = 'end';
      } else {
        // Click to set playhead (auto-play scrub if playing)
        const t = getTimeAtX(x) - daw.trimStart;
        setPlayhead(Math.max(0, t));
        if (isPlaying) {
          stopPlayback();
          // Small timeout to allow state to settle before restarting
          setTimeout(() => handlePlay(), 10);
        }
        return;
      }

      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [daw, canvasWidth, getTimeAtX]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!draggingRef.current || !daw.audioBuffer) return;
      const rect = canvasRef.current!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const t = getTimeAtX(x);

      if (draggingRef.current === 'start') {
        daw.setTrimStart(Math.min(t, daw.trimEnd - 0.1));
      } else if (draggingRef.current === 'end') {
        daw.setTrimEnd(Math.max(t, daw.trimStart + 0.1));
      }
    },
    [daw, getTimeAtX]
  );

  const handlePointerUp = useCallback(() => {
    draggingRef.current = null;
    stopPlayback();
    setPlayhead(0);
  }, [stopPlayback]);

  // ── Close with guard ───────────────────────────────────────────────────────
  const handleClose = useCallback(async () => {
    if (daw.status === 'processing') {
      const confirmed = await customConfirm(
        'El procesamiento de audio está en curso. ¿Seguro que quieres cerrar? Se perderá el progreso.',
        '¿Cerrar editor?'
      );
      if (!confirmed) return;
    }
    stopPlayback();
    daw.cleanup();
    onClose();
  }, [daw, stopPlayback, onClose]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { handleClose(); return; }
      if (e.key === ' ' && e.target === document.body) {
        e.preventDefault();
        handlePlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleClose, handlePlay]);

  // ── Trigger download ───────────────────────────────────────────────────────
  const triggerDownload = useCallback(() => {
    if (!daw.downloadUrl) return;
    const a = document.createElement('a');
    a.href = daw.downloadUrl;
    a.download = `${daw.outputFileName}.${exportFormat}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Release memory after download triggered (with small delay for browser to initiate)
    setTimeout(() => {
      daw.resetExport();
    }, 1000);
  }, [daw, exportFormat]);

  // ─── Derived values ────────────────────────────────────────────────────────
  const trimDuration = daw.trimEnd - daw.trimStart;
  const isLoading = daw.status === 'loading' || daw.status === 'decoding';
  const isReady = daw.status === 'ready';
  const isProcessing = daw.status === 'processing';
  const isDone = daw.status === 'done';
  const isError = daw.status === 'error';

  // ─── Render ────────────────────────────────────────────────────────────────
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div
        className="relative w-full bg-surface-elevated border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{
          maxWidth: '900px',
          maxHeight: '90vh',
          animation: 'daw-slide-up 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
              <Scissors className="w-4 h-4 text-accent" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-text-primary leading-tight">
                Mini-DAW
              </h2>
              <p className="text-xs text-text-secondary font-mono truncate max-w-[320px]">
                {fileName}
              </p>
            </div>
          </div>

          {/* Duration info */}
          {isReady && (
            <div className="hidden sm:flex items-center gap-4 text-xs font-mono text-text-secondary">
              <span>
                Total: <span className="text-text-primary">{formatTime(daw.duration)}</span>
              </span>
              <span>
                Región: <span className="text-accent font-bold">{formatTime(trimDuration)}</span>
              </span>
              <span>
                Ganancia: <span className="text-text-primary">{daw.gain.toFixed(2)}x</span>
              </span>
            </div>
          )}

          <button
            onClick={handleClose}
            className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface transition-colors"
            aria-label="Cerrar Mini-DAW"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

          {/* Loading state */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-2 border-accent/20" />
                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-accent animate-spin" />
                <div className="absolute inset-2 rounded-full bg-accent/5 flex items-center justify-center">
                  {daw.status === 'loading' && daw.loadProgress > 0 ? (
                    <span className="text-[10px] font-mono font-bold text-accent">
                      {Math.round(daw.loadProgress * 100)}%
                    </span>
                  ) : (
                    <Loader2 className="w-6 h-6 text-accent animate-spin" />
                  )}
                </div>
              </div>
              <p className="text-sm text-text-secondary">
                {daw.status === 'loading' ? 'Descargando audio en memoria…' : 'Decodificando forma de onda…'}
              </p>
              <button
                onClick={daw.cancelLoad}
                className="text-xs text-text-secondary hover:text-error transition-colors"
              >
                Cancelar
              </button>
            </div>
          )}

          {/* Error state */}
          {isError && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <div className="w-14 h-14 rounded-full bg-error/10 flex items-center justify-center">
                <AlertTriangle className="w-7 h-7 text-error" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-text-primary mb-1">Error al procesar el audio</p>
                <p className="text-xs text-error/80 font-mono max-w-sm break-all px-4">
                  {daw.errorMessage}
                </p>
              </div>
              <button
                onClick={() => daw.loadAudio(fileId, fileName)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-surface border border-border text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors text-sm"
              >
                <RefreshCw className="w-4 h-4" />
                Reintentar
              </button>
            </div>
          )}

          {/* Ready / Processing / Done states */}
          {(isReady || isProcessing || isDone) && (
            <>
              {/* ── Waveform Canvas ───────────────────────────────────────── */}
              <div
                ref={containerRef}
                className="w-full rounded-xl overflow-x-auto overflow-y-hidden border border-border/60 bg-[#0d0d14] relative scroll-smooth custom-scrollbar"
                style={{ height: `${WAVEFORM_HEIGHT + RULER_HEIGHT}px` }}
              >
                <div 
                  className="relative cursor-crosshair select-none"
                  style={{ width: `${canvasWidth}px`, height: '100%' }}
                >
                  <canvas
                    ref={canvasRef}
                    className="absolute top-0 left-0"
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                  />

                {/* Trim time tooltips (always visible) */}
                {isReady && daw.audioBuffer && (
                  <>
                    <div
                      className="absolute bottom-2 pointer-events-none text-[10px] font-mono bg-accent text-white px-1.5 py-0.5 rounded"
                      style={{
                        left: `${(daw.trimStart / daw.audioBuffer.duration) * 100}%`,
                        transform: 'translateX(-50%)',
                      }}
                    >
                      {formatTime(daw.trimStart)}
                    </div>
                    <div
                      className="absolute bottom-2 pointer-events-none text-[10px] font-mono bg-accent text-white px-1.5 py-0.5 rounded"
                      style={{
                        left: `${(daw.trimEnd / daw.audioBuffer.duration) * 100}%`,
                        transform: 'translateX(-50%)',
                      }}
                    >
                      {formatTime(daw.trimEnd)}
                    </div>
                  </>
                  )}
                </div>
              </div>

              {/* ── Transport & Zoom ─────────────────────────────────────────────── */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                {/* Zoom Control */}
                <div className="flex items-center gap-3 bg-surface rounded-xl px-4 py-2 border border-border/60 shadow-sm">
                  <span className="text-[10px] text-text-secondary font-bold uppercase tracking-widest">Zoom</span>
                  <input
                    type="range"
                    min={1}
                    max={20}
                    step={1}
                    value={zoomLevel}
                    onChange={(e) => setZoomLevel(parseInt(e.target.value))}
                    className="w-20 accent-accent h-1.5 rounded-full"
                  />
                  <span className="text-[10px] font-mono text-text-primary w-5 text-right">{zoomLevel}x</span>
                </div>

                {/* Transport */}
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={skipToStart}
                    disabled={!isReady}
                    className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface transition-colors disabled:opacity-30"
                    title="Ir al inicio"
                  >
                    <SkipBack className="w-4 h-4" />
                  </button>

                  <button
                    onClick={handlePlay}
                    disabled={!isReady}
                    className={cn(
                      'w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 hover:scale-105',
                      isPlaying
                        ? 'bg-accent/80 text-white shadow-accent/30'
                        : 'bg-accent text-white shadow-accent/40'
                    )}
                    title={isPlaying ? 'Pausar (Space)' : 'Reproducir (Space)'}
                  >
                    {isPlaying
                      ? <Pause className="w-5 h-5 fill-current" />
                      : <Play className="w-5 h-5 fill-current ml-0.5" />}
                  </button>

                  <button
                    onClick={skipToEnd}
                    disabled={!isReady}
                    className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface transition-colors disabled:opacity-30"
                    title="Ir al final"
                  >
                    <SkipForward className="w-4 h-4" />
                  </button>
                </div>

                {/* Playhead position */}
                <div className="bg-surface rounded-xl px-4 py-2 border border-border/60 shadow-sm min-w-[130px] text-center hidden sm:block">
                  <span className="text-xs font-mono text-text-secondary">
                    <span className="text-text-primary font-bold">{formatTime(daw.trimStart + playhead)}</span> / {formatTime(daw.trimEnd)}
                  </span>
                </div>
              </div>

              {/* ── Trim & Gain Controls ──────────────────────────────────── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Trim section */}
                <div className="bg-surface rounded-xl p-4 border border-border/60">
                  <h3 className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Scissors className="w-3 h-3" />
                    Recorte (Trim)
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-xs text-text-secondary mb-1">
                        <label>Inicio</label>
                        <span className="font-mono text-text-primary">{formatTime(daw.trimStart)}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={daw.duration}
                        step={0.01}
                        value={daw.trimStart}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          daw.setTrimStart(Math.min(v, daw.trimEnd - 0.1));
                          stopPlayback();
                          setPlayhead(0);
                        }}
                        className="w-full accent-accent h-1.5 rounded-full"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-text-secondary mb-1">
                        <label>Fin</label>
                        <span className="font-mono text-text-primary">{formatTime(daw.trimEnd)}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={daw.duration}
                        step={0.01}
                        value={daw.trimEnd}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          daw.setTrimEnd(Math.max(v, daw.trimStart + 0.1));
                          stopPlayback();
                          setPlayhead(0);
                        }}
                        className="w-full accent-accent h-1.5 rounded-full"
                      />
                    </div>
                    <p className="text-[10px] text-text-secondary/60 italic">
                      💡 Arrastra los marcadores en la forma de onda o usa los sliders
                    </p>
                  </div>
                </div>

                {/* Gain section */}
                <div className="bg-surface rounded-xl p-4 border border-border/60">
                  <h3 className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Volume2 className="w-3 h-3" />
                    Ganancia (Volumen)
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-xs text-text-secondary mb-1">
                        <label>Nivel</label>
                        <span className={cn(
                          'font-mono font-bold',
                          daw.gain > 2 ? 'text-warning' : 'text-text-primary'
                        )}>
                          {daw.gain.toFixed(2)}x
                          {daw.gain > 1 && ` (+${(20 * Math.log10(daw.gain)).toFixed(1)} dB)`}
                          {daw.gain < 1 && daw.gain > 0 && ` (${(20 * Math.log10(daw.gain)).toFixed(1)} dB)`}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.05}
                        max={4}
                        step={0.01}
                        value={daw.gain}
                        onChange={(e) => daw.setGain(parseFloat(e.target.value))}
                        className="w-full accent-accent h-1.5 rounded-full"
                      />
                      <div className="flex justify-between text-[10px] text-text-secondary/50 mt-1">
                        <span>0.05x</span>
                        <span className="text-success">1.0x (original)</span>
                        <span className="text-warning">4.0x</span>
                      </div>
                    </div>

                    {daw.gain > 2 && (
                      <div className="flex items-start gap-2 p-2 rounded-lg bg-warning/10 border border-warning/20">
                        <AlertTriangle className="w-3 h-3 text-warning mt-0.5 shrink-0" />
                        <p className="text-[10px] text-warning/90">
                          Ganancia alta puede causar clipping (distorsión) en el audio exportado.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Export Section ────────────────────────────────────────── */}
              <div className="bg-surface rounded-xl p-4 border border-border/60">
                <h3 className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Download className="w-3 h-3" />
                  Exportar
                </h3>

                <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
                  {/* Output file name */}
                  <div className="flex-1">
                    <label className="text-xs text-text-secondary mb-1 block">Nombre del archivo</label>
                    <input
                      type="text"
                      value={daw.outputFileName}
                      onChange={(e) => daw.setOutputFileName(e.target.value)}
                      className="w-full bg-surface-elevated border border-border/60 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent transition-colors font-mono"
                      placeholder="nombre_del_archivo"
                    />
                  </div>

                  {/* Format selector */}
                  <div>
                    <label className="text-xs text-text-secondary mb-1 block">Formato</label>
                    <div className="flex rounded-lg overflow-hidden border border-border/60">
                      <button
                        onClick={() => setExportFormat('wav')}
                        className={cn(
                          'px-4 py-2 text-sm font-mono font-bold transition-colors',
                          exportFormat === 'wav'
                            ? 'bg-accent text-white'
                            : 'bg-surface-elevated text-text-secondary hover:text-text-primary'
                        )}
                      >
                        WAV
                      </button>
                      <button
                        onClick={() => setExportFormat('mp3')}
                        className={cn(
                          'px-4 py-2 text-sm font-mono font-bold transition-colors border-l border-border/60',
                          exportFormat === 'mp3'
                            ? 'bg-accent text-white'
                            : 'bg-surface-elevated text-text-secondary hover:text-text-primary'
                        )}
                      >
                        MP3
                      </button>
                    </div>
                  </div>

                  {/* Export / Download button */}
                  <div>
                    {isDone ? (
                      <button
                        onClick={triggerDownload}
                        className="flex items-center gap-2 px-5 py-2 rounded-lg bg-success text-white font-semibold text-sm hover:bg-success/90 transition-colors shadow-lg"
                      >
                        <Download className="w-4 h-4" />
                        Descargar .{exportFormat}
                      </button>
                    ) : (
                      <button
                        onClick={() => daw.exportAudio(exportFormat)}
                        disabled={!isReady || isProcessing}
                        className={cn(
                          'flex items-center gap-2 px-5 py-2 rounded-lg font-semibold text-sm transition-all shadow-lg',
                          isReady && !isProcessing
                            ? 'bg-accent text-white hover:bg-accent/90 hover:scale-[1.02]'
                            : 'bg-surface-elevated text-text-secondary cursor-not-allowed opacity-60'
                        )}
                      >
                        {isProcessing
                          ? <><Loader2 className="w-4 h-4 animate-spin" /> Procesando…</>
                          : <><Scissors className="w-4 h-4" /> Renderizar y exportar</>
                        }
                      </button>
                    )}
                  </div>
                </div>

                {/* Export progress bar */}
                {isProcessing && (
                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-text-secondary mb-1.5">
                      <span>FFmpeg procesando en el cliente…</span>
                      <span className="font-mono font-bold text-accent">
                        {Math.round(daw.exportProgress * 100)}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-surface-elevated rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-accent to-accent-light rounded-full transition-all duration-300"
                        style={{
                          width: `${daw.exportProgress * 100}%`,
                          animation: daw.exportProgress < 0.98 ? 'daw-progress-pulse 1.5s infinite' : 'none',
                        }}
                      />
                    </div>
                    <p className="text-[10px] text-text-secondary/60 mt-1.5 italic">
                      El procesamiento ocurre 100% en tu navegador. El archivo original en Drive no se toca.
                    </p>
                  </div>
                )}

                {/* Export done */}
                {isDone && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-success">
                    <CheckCircle className="w-4 h-4" />
                    <span>¡Exportación completada! Haz clic en "Descargar" para guardar el archivo.</span>
                  </div>
                )}

                {/* SharedArrayBuffer warning */}
                {typeof window !== 'undefined' && !window.crossOriginIsolated && (
                  <div className="mt-3 flex items-start gap-2 p-2 rounded-lg bg-warning/10 border border-warning/20">
                    <AlertTriangle className="w-3.5 h-3.5 text-warning mt-0.5 shrink-0" />
                    <p className="text-[10px] text-warning/90">
                      <strong>Cross-Origin Isolation no activo</strong>: FFmpeg.wasm puede no funcionar. Contacta al administrador para habilitar los headers COOP/COEP.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="px-6 py-3 border-t border-border/60 shrink-0 flex items-center justify-between">
          <p className="text-[10px] text-text-secondary/50 italic">
            🔒 El archivo original en Google Drive nunca se modifica. Todo el procesamiento es local.
          </p>
          <button
            onClick={handleClose}
            className="text-xs text-text-secondary hover:text-error transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
