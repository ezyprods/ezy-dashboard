'use client';

import React, { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAudio } from '@/lib/contexts/AudioContext';
import { formatMusicalKey } from '@/lib/utils/audio';
import { cn } from '@/lib/utils';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, X, Music, Loader2, Download, Share2, Scissors, User, ExternalLink, MoreVertical, ChevronDown, RotateCcw, RotateCw } from 'lucide-react';
import { ShareModal } from '@/components/artists/ShareModal';
import { MiniDAWModal } from '@/components/projects/MiniDAWModal';

const SKIP_SECONDS = 10;

// Routes rendered inside the dashboard layout, which has the mobile bottom tab bar
const DASHBOARD_PREFIXES = ['/dashboard', '/artists', '/personal-projects', '/matrices', '/calendar', '/payments', '/tools', '/communications', '/settings', '/projects'];

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Touch-friendly seek bar. iOS Safari only lets you drag a native <input type="range"> by its
 * thumb (tapping the track does nothing), which made the old 4px bar unusable on iPhone.
 * Here the whole (tall, invisible) hit area responds to tap and drag via pointer events.
 */
function Scrubber({ currentTime, duration, onSeek, className }: {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragTime, setDragTime] = useState<number | null>(null);

  const timeFromEvent = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || !duration) return 0;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * duration;
  };

  const shownTime = dragTime ?? currentTime;
  const pct = duration ? Math.min(100, Math.max(0, (shownTime / duration) * 100)) : 0;

  return (
    <div className={className}>
      <div
        ref={trackRef}
        role="slider"
        aria-label="Progreso del audio"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration || 0)}
        aria-valuenow={Math.round(shownTime)}
        aria-valuetext={`${formatTime(shownTime)} de ${formatTime(duration)}`}
        tabIndex={0}
        className="relative h-7 flex items-center cursor-pointer touch-none select-none"
        onPointerDown={(e) => {
          if (!duration) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragTime(timeFromEvent(e.clientX));
        }}
        onPointerMove={(e) => {
          if (dragTime === null) return;
          setDragTime(timeFromEvent(e.clientX));
        }}
        onPointerUp={(e) => {
          if (dragTime === null) return;
          onSeek(timeFromEvent(e.clientX));
          setDragTime(null);
        }}
        onPointerCancel={() => setDragTime(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') onSeek(Math.min(duration, currentTime + 5));
          if (e.key === 'ArrowLeft') onSeek(Math.max(0, currentTime - 5));
        }}
      >
        <div className={cn('w-full rounded-full bg-border/70 overflow-hidden transition-[height] duration-150', dragTime !== null ? 'h-2' : 'h-1.5')}>
          <div className="h-full bg-text-primary rounded-full" style={{ width: `${pct}%` }} />
        </div>
        <div
          className={cn(
            'absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full bg-text-primary shadow-md transition-[width,height] duration-150',
            dragTime !== null ? 'w-5 h-5' : 'w-3.5 h-3.5'
          )}
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[11px] font-mono text-text-secondary tabular-nums mt-0.5">
        <span>{formatTime(shownTime)}</span>
        <span>-{formatTime(Math.max(0, duration - shownTime))}</span>
      </div>
    </div>
  );
}

export function GlobalAudioPlayer() {
  const { currentTrack, isPlaying, duration, currentTime, togglePlay, seek, volume, setVolume, closePlayer, isLoading } = useAudio();
  const pathname = usePathname() || '';
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isMiniDAWOpen, setIsMiniDAWOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isTabletMenuOpen, setIsTabletMenuOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startT: number; dy: number } | null>(null);

  // Public pages (artist portal, release previews) have no bottom tab bar, and must not expose
  // producer-only actions: sharing could change Drive permissions and bypass the portal paywall.
  const isPublicRoute = pathname.startsWith('/portal') || pathname.startsWith('/previews');
  // Public pages can opt into a bottom tab bar by setting <html data-bottom-nav> (the artist portal does)
  const [hasPageNav, setHasPageNav] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setHasPageNav(root.hasAttribute('data-bottom-nav'));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['data-bottom-nav'] });
    return () => observer.disconnect();
  }, []);
  const hasMobileNav = hasPageNav || DASHBOARD_PREFIXES.some((p) => pathname.startsWith(p));

  // Latest values for the Media Session handlers (registered once per track)
  const stateRef = useRef({ isPlaying, currentTime, duration, togglePlay, seek, closePlayer });
  stateRef.current = { isPlaying, currentTime, duration, togglePlay, seek, closePlayer };

  const skipBy = (delta: number) => {
    const target = Math.min(duration || 0, Math.max(0, currentTime + delta));
    seek(target);
  };

  // Lock screen / Control Center / AirPods controls (iOS 15+, Android, desktop media keys)
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    if (!currentTrack) {
      ms.metadata = null;
      ms.playbackState = 'none';
      return;
    }
    try {
      const origin = window.location.origin;
      ms.metadata = new MediaMetadata({
        title: currentTrack.name.replace(/\.[^/.]+$/, ''),
        artist: currentTrack.artistName || 'Ezy',
        album: 'Ezy',
        artwork: currentTrack.coverArt
          ? [{ src: currentTrack.coverArt, sizes: '512x512' }]
          : [{ src: `${origin}/pwa-512.png`, sizes: '512x512', type: 'image/png' }],
      });
    } catch { /* MediaMetadata unsupported */ }

    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => { if (!stateRef.current.isPlaying) stateRef.current.togglePlay(); }],
      ['pause', () => { if (stateRef.current.isPlaying) stateRef.current.togglePlay(); }],
      ['seekbackward', (d) => {
        const s = stateRef.current;
        s.seek(Math.max(0, s.currentTime - (d.seekOffset || SKIP_SECONDS)));
      }],
      ['seekforward', (d) => {
        const s = stateRef.current;
        s.seek(Math.min(s.duration || 0, s.currentTime + (d.seekOffset || SKIP_SECONDS)));
      }],
      ['seekto', (d) => { if (typeof d.seekTime === 'number') stateRef.current.seek(d.seekTime); }],
      ['stop', () => stateRef.current.closePlayer()],
    ];
    for (const [action, handler] of handlers) {
      try { ms.setActionHandler(action, handler); } catch { /* action unsupported */ }
    }
    return () => {
      for (const [action] of handlers) {
        try { ms.setActionHandler(action, null); } catch { /* ignore */ }
      }
    };
  }, [currentTrack]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !currentTrack) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying, currentTrack]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !currentTrack) return;
    if (!duration || !isFinite(duration)) return;
    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: 1,
        position: Math.min(duration, Math.max(0, currentTime)),
      });
    } catch { /* ignore */ }
    // Lock screen interpolates on its own: refresh on seek/track/play-state, not every tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, isPlaying, currentTrack, Math.floor(currentTime / 5)]);

  // Collapse the sheet when the track is closed, or when navigating (e.g. "Perfil de Artista")
  useEffect(() => {
    if (!currentTrack) setIsExpanded(false);
  }, [currentTrack]);
  useEffect(() => {
    setIsExpanded(false);
  }, [pathname]);

  if (!currentTrack) return null;

  const artistUrl = currentTrack.pathSegments?.find(seg => seg.url?.startsWith('/artists/'))?.url;
  const subtitle = currentTrack.artistName || (currentTrack.pathSegments && currentTrack.pathSegments.length > 0 ? currentTrack.pathSegments[currentTrack.pathSegments.length - 1]?.name : '');
  const progressPct = duration ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    seek(Number(e.target.value));
  };

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(Number(e.target.value));
  };

  const toggleMute = () => {
    setVolume(volume === 0 ? 1 : 0);
  };

  // Swipe the expanded sheet down to collapse it
  const onSheetTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    dragRef.current = { startY: e.touches[0].clientY, startT: Date.now(), dy: 0 };
  };
  const onSheetTouchMove = (e: React.TouchEvent) => {
    const drag = dragRef.current;
    if (!drag || !sheetRef.current) return;
    drag.dy = Math.max(0, e.touches[0].clientY - drag.startY);
    sheetRef.current.style.transition = 'none';
    sheetRef.current.style.transform = `translateY(${drag.dy}px)`;
  };
  const onSheetTouchEnd = () => {
    const drag = dragRef.current;
    const sheet = sheetRef.current;
    dragRef.current = null;
    if (!drag || !sheet) return;
    const velocity = drag.dy / Math.max(1, Date.now() - drag.startT);
    sheet.style.transition = 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)';
    if (drag.dy > 120 || (drag.dy > 40 && velocity > 0.6)) {
      sheet.style.transform = 'translateY(100%)';
      setTimeout(() => {
        setIsExpanded(false);
        sheet.style.transform = '';
      }, 220);
    } else {
      sheet.style.transform = '';
    }
  };

  const playButtonIcon = (size: string) =>
    isLoading ? <Loader2 className={cn(size, 'animate-spin')} />
      : isPlaying ? <Pause className={cn(size, 'fill-current')} />
      : <Play className={cn(size, 'fill-current translate-x-[1px]')} />;

  const actionClass = "flex flex-col items-center justify-center gap-1.5 min-h-[64px] rounded-2xl bg-surface/70 border border-border/60 text-[11px] font-medium text-text-secondary active:bg-surface active:scale-[0.97] transition-transform";

  return (
    <>
      <div
        className={cn(
          "fixed left-0 right-0 bg-surface-elevated/95 backdrop-blur-xl border-t border-border md:z-50 animate-slide-in shadow-2xl md:bottom-0",
          hasMobileNav
            ? "bottom-[calc(env(safe-area-inset-bottom,0px)+64px)] z-35"
            : "bottom-0 pb-[env(safe-area-inset-bottom)] md:pb-0 z-50"
        )}
      >

        {/* ── Mobile mini player (tap to expand) ── */}
        <div className="md:hidden flex flex-col w-full px-safe">
          {/* Progress (display only — seeking lives in the expanded player) */}
          <div className="relative w-full h-[3px] bg-border/40" aria-hidden="true">
            <div className="h-full bg-accent" style={{ width: `${progressPct}%` }} />
          </div>

          <div className="flex items-center justify-between pl-3 pr-1.5 h-[58px] gap-1">
            <button
              type="button"
              onClick={() => setIsExpanded(true)}
              className="flex items-center gap-2.5 min-w-0 flex-1 h-full text-left"
              aria-label="Abrir reproductor"
            >
              <div className="w-10 h-10 bg-surface rounded-lg flex items-center justify-center overflow-hidden shrink-0 border border-border">
                {currentTrack.coverArt ? (
                  <img src={currentTrack.coverArt} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Music className="w-5 h-5 text-text-secondary" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-[13px] font-bold text-text-primary truncate">
                    {currentTrack.name}
                  </p>
                  {(currentTrack.bpm || currentTrack.musicalKey) && (
                    <span className="text-[9px] font-mono px-1 py-0.5 rounded border text-emerald-400 bg-emerald-500/10 border-emerald-500/20 whitespace-nowrap shrink-0">
                      {currentTrack.bpm ? `${currentTrack.bpm} BPM` : formatMusicalKey(currentTrack.musicalKey!)}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-text-secondary truncate">
                  {subtitle || formatTime(currentTime)}
                </p>
              </div>
            </button>

            <div className="flex items-center shrink-0">
              <button
                onClick={togglePlay}
                disabled={isLoading}
                aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
                className="w-11 h-11 rounded-full flex items-center justify-center text-text-primary disabled:opacity-70 active:scale-90 transition-transform"
              >
                <span className="w-9 h-9 rounded-full bg-text-primary text-surface-elevated flex items-center justify-center shadow-md">
                  {playButtonIcon('w-4 h-4')}
                </span>
              </button>
              <button
                onClick={closePlayer}
                aria-label="Cerrar reproductor"
                className="w-11 h-11 rounded-full flex items-center justify-center text-text-secondary active:text-error active:bg-surface transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Desktop & Tablet Player (h-20 md:h-22 lg:h-24) ── */}
        <div className="hidden md:flex items-center justify-between px-4 lg:px-6 h-20 lg:h-24 w-full">
          {/* Left Column: Track Info */}
          <div className="flex items-center gap-2.5 lg:gap-3 w-auto max-w-[160px] lg:max-w-[240px] xl:w-1/4 shrink-0 overflow-hidden">
            <div className="w-11 h-11 lg:w-14 lg:h-14 bg-surface rounded-md flex items-center justify-center overflow-hidden shrink-0 border border-border">
              {currentTrack.coverArt ? (
                <img src={currentTrack.coverArt} alt={currentTrack.name} className="w-full h-full object-cover" />
              ) : (
                <Music className="w-5 h-5 text-text-secondary" />
              )}
            </div>
            <div className="overflow-hidden min-w-0">
              <div className="flex items-center gap-1.5 lg:gap-2">
                <p className="text-xs lg:text-sm font-bold text-text-primary truncate" title={currentTrack.name}>{currentTrack.name}</p>
                {(currentTrack.bpm || currentTrack.musicalKey) && (
                  <div className="hidden lg:flex items-center gap-1 shrink-0">
                    {currentTrack.bpm && (
                      <span className="text-[9px] font-mono px-1 py-0.5 rounded border text-emerald-400 bg-emerald-500/10 border-emerald-500/20 whitespace-nowrap">
                        {currentTrack.bpm} BPM
                      </span>
                    )}
                    {currentTrack.musicalKey && (
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border text-violet-400 bg-violet-500/10 border-violet-500/20 whitespace-nowrap tracking-wide">
                        {formatMusicalKey(currentTrack.musicalKey)}
                      </span>
                    )}
                  </div>
                )}
              </div>
              {currentTrack.pathSegments && currentTrack.pathSegments.length > 0 ? (
                <p className="text-[11px] lg:text-xs text-text-secondary truncate flex items-center gap-1">
                  {currentTrack.pathSegments.map((seg, i) => (
                    <React.Fragment key={i}>
                      {seg.onClick ? (
                        <button onClick={seg.onClick} className="hover:text-text-primary hover:underline transition-colors text-left truncate">{seg.name}</button>
                      ) : seg.url && !isPublicRoute ? (
                        <a
                          href={seg.url}
                          className="hover:text-text-primary hover:underline transition-colors"
                          target={seg.url.includes('drive.google.com') ? '_blank' : undefined}
                          rel={seg.url.includes('drive.google.com') ? 'noopener noreferrer' : undefined}
                        >
                          {seg.name}
                        </a>
                      ) : (
                        <span>{seg.name}</span>
                      )}
                      {i < currentTrack.pathSegments!.length - 1 && <span>/</span>}
                    </React.Fragment>
                  ))}
                </p>
              ) : currentTrack.artistName ? (
                <p className="text-[11px] lg:text-xs text-text-secondary truncate">{currentTrack.artistName}</p>
              ) : null}
            </div>
          </div>

          {/* Center Column: Controls & Scrubber */}
          <div className="flex-1 min-w-0 flex flex-col items-center justify-center max-w-2xl px-2 sm:px-4">
            <div className="flex items-center gap-4 lg:gap-6 mb-1.5 lg:mb-2">
              <button
                onClick={() => skipBy(-SKIP_SECONDS)}
                className="text-text-secondary hover:text-text-primary transition-colors"
                title={`Retroceder ${SKIP_SECONDS}s`}
                aria-label={`Retroceder ${SKIP_SECONDS} segundos`}
              >
                <SkipBack className="w-4 h-4 lg:w-5 lg:h-5" />
              </button>

              <button
                onClick={togglePlay}
                disabled={isLoading}
                aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
                className="w-9 h-9 lg:w-10 lg:h-10 rounded-full bg-text-primary text-surface-elevated flex items-center justify-center hover:scale-105 transition-transform disabled:opacity-70 disabled:hover:scale-100"
              >
                {isLoading ? <Loader2 className="w-4 h-4 lg:w-5 lg:h-5 animate-spin text-surface-elevated" /> : isPlaying ? <Pause className="w-4 h-4 lg:w-5 lg:h-5 fill-current" /> : <Play className="w-4 h-4 lg:w-5 lg:h-5 fill-current ml-0.5 lg:ml-1" />}
              </button>

              <button
                onClick={() => skipBy(SKIP_SECONDS)}
                className="text-text-secondary hover:text-text-primary transition-colors"
                title={`Avanzar ${SKIP_SECONDS}s`}
                aria-label={`Avanzar ${SKIP_SECONDS} segundos`}
              >
                <SkipForward className="w-4 h-4 lg:w-5 lg:h-5" />
              </button>
            </div>

            <div className="flex items-center gap-2 w-full min-w-0">
              <span className="text-[9px] font-medium text-text-secondary w-7 lg:w-8 text-right font-mono shrink-0">
                {formatTime(currentTime)}
              </span>

              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                aria-label="Progreso del audio"
                className="flex-1 min-w-[50px] h-1 bg-surface rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:bg-text-primary [&::-webkit-slider-thumb]:rounded-full cursor-pointer accent-accent"
              />

              <span className="text-[9px] font-medium text-text-secondary w-7 lg:w-8 font-mono shrink-0">
                {formatTime(duration)}
              </span>
            </div>
          </div>

          {/* Right Column: Actions, Volume & Close */}
          <div className="w-auto shrink-0 flex items-center justify-end gap-2 lg:gap-4">
            {!isPublicRoute && (
              <>
                {/* Inline Action Icons on Large Screens (xl:flex) */}
                <div className="hidden xl:flex items-center gap-3 border-r border-border/50 pr-4">
                  {artistUrl && (
                    <a href={artistUrl} className="text-text-secondary hover:text-accent-light transition-colors" title="Abrir Perfil de Artista">
                      <User className="w-4 h-4" />
                    </a>
                  )}
                  <a href={`https://drive.google.com/file/d/${currentTrack.id}/view`} target="_blank" rel="noopener noreferrer" className="text-text-secondary hover:text-accent-light transition-colors" title="Abrir en Drive">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button onClick={() => setIsMiniDAWOpen(true)} className="text-text-secondary hover:text-accent-light transition-colors" title="Abrir en Mini-DAW">
                    <Scissors className="w-4 h-4" />
                  </button>
                  <button onClick={() => setIsShareModalOpen(true)} className="text-text-secondary hover:text-accent transition-colors" title="Compartir">
                    <Share2 className="w-4 h-4" />
                  </button>
                  <a href={`/api/files/${currentTrack.id}?download=true`} download={currentTrack.name} className="text-text-secondary hover:text-text-primary transition-colors" title="Descargar">
                    <Download className="w-4 h-4" />
                  </a>
                </div>

                {/* Tablet Menu Dropdown Button (hidden on mobile and xl) */}
                <div className="relative hidden md:block xl:hidden">
                  <button
                    onClick={() => setIsTabletMenuOpen(!isTabletMenuOpen)}
                    aria-label="Más opciones del audio"
                    title="Más opciones"
                    className="w-10 h-10 rounded-full flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface transition-colors"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {isTabletMenuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs"
                        onClick={() => setIsTabletMenuOpen(false)}
                      />
                      <div className="absolute bottom-full right-0 mb-2 w-56 bg-surface-elevated border border-border rounded-2xl p-1.5 shadow-2xl z-50 animate-menu-in flex flex-col gap-0.5">
                        {artistUrl && (
                          <a
                            href={artistUrl}
                            onClick={() => setIsTabletMenuOpen(false)}
                            className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface rounded-xl transition-colors"
                          >
                            <User className="w-4 h-4 text-accent" />
                            <span>Perfil de Artista</span>
                          </a>
                        )}
                        <a
                          href={`https://drive.google.com/file/d/${currentTrack.id}/view`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setIsTabletMenuOpen(false)}
                          className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface rounded-xl transition-colors"
                        >
                          <ExternalLink className="w-4 h-4 text-text-secondary" />
                          <span>Abrir en Drive</span>
                        </a>
                        <button
                          onClick={() => {
                            setIsMiniDAWOpen(true);
                            setIsTabletMenuOpen(false);
                          }}
                          className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface rounded-xl transition-colors text-left"
                        >
                          <Scissors className="w-4 h-4 text-accent-light" />
                          <span>Mini-DAW</span>
                        </button>
                        <button
                          onClick={() => {
                            setIsShareModalOpen(true);
                            setIsTabletMenuOpen(false);
                          }}
                          className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface rounded-xl transition-colors text-left"
                        >
                          <Share2 className="w-4 h-4 text-accent" />
                          <span>Compartir</span>
                        </button>
                        <a
                          href={`/api/files/${currentTrack.id}?download=true`}
                          download={currentTrack.name}
                          onClick={() => setIsTabletMenuOpen(false)}
                          className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface rounded-xl transition-colors"
                        >
                          <Download className="w-4 h-4 text-text-secondary" />
                          <span>Descargar</span>
                        </a>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}

            {/* Volume Control */}
            <div className="flex items-center gap-1.5 lg:gap-2 w-16 sm:w-20 lg:w-28 group shrink-0">
              <button onClick={toggleMute} className="text-text-secondary hover:text-text-primary shrink-0" title={volume === 0 ? "Reactivar sonido" : "Silenciar"}>
                {volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={handleVolume}
                aria-label="Control de volumen"
                className="w-full min-w-[36px] h-1 bg-surface rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-0 group-hover:[&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:bg-text-primary [&::-webkit-slider-thumb]:rounded-full cursor-pointer transition-all accent-text-secondary"
              />
            </div>

            <button onClick={closePlayer} className="text-text-secondary hover:text-error transition-colors p-1.5 lg:p-2 shrink-0" title="Cerrar reproductor" aria-label="Cerrar reproductor">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Mobile expanded "now playing" sheet ── */}
      {isExpanded && (
        <div className="md:hidden fixed inset-0 z-[90] flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="Reproductor">
          <div className="absolute inset-0 bg-black/50 animate-fade-in touch-none" onClick={() => setIsExpanded(false)} />
          <div
            ref={sheetRef}
            className="relative bg-surface-elevated border-t border-border rounded-t-[28px] shadow-2xl animate-slide-up flex flex-col max-h-[calc(100dvh-env(safe-area-inset-top,0px)-0.5rem)] pb-[calc(1rem+env(safe-area-inset-bottom,0px))] px-safe"
          >
            {/* Drag handle + collapse */}
            <div
              className="shrink-0 pt-2.5 pb-1 px-3 flex items-center justify-between touch-none"
              onTouchStart={onSheetTouchStart}
              onTouchMove={onSheetTouchMove}
              onTouchEnd={onSheetTouchEnd}
              onTouchCancel={onSheetTouchEnd}
            >
              <button
                onClick={() => setIsExpanded(false)}
                aria-label="Minimizar reproductor"
                className="w-11 h-11 rounded-full flex items-center justify-center text-text-secondary active:bg-surface"
              >
                <ChevronDown className="w-6 h-6" />
              </button>
              <div className="w-10 h-1.5 bg-border rounded-full" />
              <button
                onClick={closePlayer}
                aria-label="Cerrar reproductor"
                className="w-11 h-11 rounded-full flex items-center justify-center text-text-secondary active:text-error active:bg-surface"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto overscroll-contain min-h-0 px-6">
              {/* Artwork */}
              <div className="mx-auto mt-2 mb-6 w-full max-w-[min(18rem,40dvh)] aspect-square rounded-3xl bg-surface border border-border shadow-2xl overflow-hidden flex items-center justify-center">
                {currentTrack.coverArt ? (
                  <img src={currentTrack.coverArt} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-accent/25 via-surface to-accent-secondary/10">
                    <Music className="w-20 h-20 text-accent-light/70" />
                  </div>
                )}
              </div>

              {/* Title */}
              <div className="mb-5">
                <h2 className="text-xl font-bold text-text-primary leading-tight break-words">{currentTrack.name}</h2>
                {subtitle && <p className="text-sm text-text-secondary mt-1 truncate">{subtitle}</p>}
                {(currentTrack.bpm || currentTrack.musicalKey) && (
                  <div className="flex items-center gap-1.5 mt-2.5">
                    {currentTrack.bpm && (
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded-md border text-emerald-400 bg-emerald-500/10 border-emerald-500/20">
                        {currentTrack.bpm} BPM
                      </span>
                    )}
                    {currentTrack.musicalKey && (
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded-md border text-violet-400 bg-violet-500/10 border-violet-500/20">
                        {formatMusicalKey(currentTrack.musicalKey)}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <Scrubber currentTime={currentTime} duration={duration} onSeek={seek} />

              {/* Transport */}
              <div className="flex items-center justify-center gap-8 my-5">
                <button
                  onClick={() => skipBy(-SKIP_SECONDS)}
                  aria-label={`Retroceder ${SKIP_SECONDS} segundos`}
                  className="relative w-14 h-14 rounded-full flex items-center justify-center text-text-primary active:bg-surface active:scale-90 transition-transform"
                >
                  <RotateCcw className="w-7 h-7" />
                  <span className="absolute text-[9px] font-bold mt-0.5">{SKIP_SECONDS}</span>
                </button>
                <button
                  onClick={togglePlay}
                  disabled={isLoading}
                  aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
                  className="w-[72px] h-[72px] rounded-full bg-text-primary text-surface-elevated flex items-center justify-center shadow-xl active:scale-95 transition-transform disabled:opacity-70"
                >
                  {playButtonIcon('w-8 h-8')}
                </button>
                <button
                  onClick={() => skipBy(SKIP_SECONDS)}
                  aria-label={`Avanzar ${SKIP_SECONDS} segundos`}
                  className="relative w-14 h-14 rounded-full flex items-center justify-center text-text-primary active:bg-surface active:scale-90 transition-transform"
                >
                  <RotateCw className="w-7 h-7" />
                  <span className="absolute text-[9px] font-bold mt-0.5">{SKIP_SECONDS}</span>
                </button>
              </div>

              {/* Producer actions */}
              {!isPublicRoute && (
                <div className="grid grid-cols-4 gap-2 pb-1">
                  {artistUrl ? (
                    <a href={artistUrl} className={actionClass}>
                      <User className="w-5 h-5 text-accent" />
                      Artista
                    </a>
                  ) : (
                    <a href={`https://drive.google.com/file/d/${currentTrack.id}/view`} target="_blank" rel="noopener noreferrer" className={actionClass}>
                      <ExternalLink className="w-5 h-5" />
                      Drive
                    </a>
                  )}
                  <button onClick={() => setIsMiniDAWOpen(true)} className={actionClass}>
                    <Scissors className="w-5 h-5 text-accent-light" />
                    Mini-DAW
                  </button>
                  <button onClick={() => setIsShareModalOpen(true)} className={actionClass}>
                    <Share2 className="w-5 h-5 text-accent" />
                    Compartir
                  </button>
                  <a href={`/api/files/${currentTrack.id}?download=true`} download={currentTrack.name} className={actionClass}>
                    <Download className="w-5 h-5" />
                    Descargar
                  </a>
                  {artistUrl && (
                    <a
                      href={`https://drive.google.com/file/d/${currentTrack.id}/view`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="col-span-4 flex items-center justify-center gap-2 min-h-[44px] rounded-2xl text-xs font-medium text-text-secondary active:bg-surface"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Abrir en Google Drive
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {isShareModalOpen && !isPublicRoute && (
        <ShareModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          fileId={currentTrack.id}
          fileName={currentTrack.name}
        />
      )}

      {isMiniDAWOpen && !isPublicRoute && (
        <MiniDAWModal
          fileId={currentTrack.id}
          fileName={currentTrack.name}
          onClose={() => setIsMiniDAWOpen(false)}
        />
      )}
    </>
  );
}
