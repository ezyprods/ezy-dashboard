'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, ChevronLeft, ChevronRight, Download, HardDrive, Share2, Info, Play, Pause, Scissors, Star, Loader2,
  ExternalLink, MoreHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useExplorer } from './useExplorerController';
import { bpmTone, driveUrl, formatBytes, KIND_LABEL, KindIcon, sizedThumbnail } from './fileKinds';
import type { DriveItem } from './types';

function ImagePreview({ item }: { item: DriveItem }) {
  const sources = useMemo(() => [
    sizedThumbnail(item.thumbnailLink, 2000),
    `https://drive.google.com/thumbnail?id=${item.id}&sz=w2000`,
    `/api/files/${item.id}?inline=true`,
  ].filter(Boolean) as string[], [item]);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setAttempt(0); setLoaded(false); }, [item.id]);

  if (attempt >= sources.length) return <Fallback item={item} />;
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {!loaded && <Loader2 className="absolute w-8 h-8 animate-spin text-white/60" />}
      <img
        key={sources[attempt]}
        src={sources[attempt]}
        alt={item.name}
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        onError={() => setAttempt(a => a + 1)}
        className={cn('max-w-full max-h-full object-contain select-none transition-opacity', loaded ? 'opacity-100' : 'opacity-0')}
        draggable={false}
      />
    </div>
  );
}

function VideoPreview({ item }: { item: DriveItem }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [item.id]);
  if (failed) return <DriveFrame item={item} />;
  return (
    <video
      key={item.id}
      src={`/api/files/${item.id}?inline=true`}
      poster={sizedThumbnail(item.thumbnailLink, 1280)}
      controls
      autoPlay
      playsInline
      onError={() => setFailed(true)}
      className="max-w-full max-h-full rounded-lg bg-black"
    />
  );
}

function DriveFrame({ item, src }: { item: DriveItem; src?: string }) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => setLoaded(false), [item.id]);
  return (
    <div className="relative w-full h-full max-w-5xl bg-white rounded-lg overflow-hidden">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-elevated">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      )}
      <iframe
        key={item.id}
        src={src || `https://drive.google.com/file/d/${item.id}/preview`}
        title={item.name}
        className="w-full h-full border-0"
        allow="autoplay; fullscreen"
        // The dashboard is cross-origin isolated (COEP: credentialless, needed by FFmpeg.wasm);
        // third-party frames such as Drive's viewer only load as credentialless frames.
        {...({ credentialless: 'true' } as Record<string, string>)}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}

function AudioPreview({ item }: { item: DriveItem }) {
  const ex = useExplorer();
  const playing = ex.currentTrackId === item.id && ex.isPlaying;
  return (
    <div className="flex flex-col items-center text-center gap-6 px-6">
      <div className="w-56 h-56 md:w-72 md:h-72 rounded-[32px] bg-gradient-to-br from-violet-500/40 via-accent/30 to-surface flex items-center justify-center shadow-2xl">
        <button
          type="button"
          onClick={() => ex.play(item)}
          className="w-24 h-24 rounded-full bg-white text-black flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-transform"
          aria-label={playing ? 'Pausar' : 'Reproducir'}
        >
          {playing ? <Pause className="w-10 h-10 fill-current" /> : <Play className="w-10 h-10 fill-current translate-x-1" />}
        </button>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {item.bpm && <span className={cn('font-mono text-xs font-bold px-2 py-1 rounded-lg border', bpmTone(item.bpm))}>{item.bpm} BPM</span>}
        {item.musicalKey && <span className="font-mono text-xs font-bold px-2 py-1 rounded-lg border text-violet-300 bg-violet-500/15 border-violet-500/30">{item.musicalKey}</span>}
        {item.size ? <span className="text-xs px-2 py-1 rounded-lg bg-white/10 text-white/70">{formatBytes(item.size)}</span> : null}
      </div>
      <button
        type="button"
        onClick={() => { ex.setPreviewId(null); ex.setMiniDawItem(item); }}
        className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-white/10 text-white text-sm font-medium hover:bg-white/20"
      >
        <Scissors className="w-4 h-4" /> Editar en Mini-DAW
      </button>
    </div>
  );
}

function Fallback({ item }: { item: DriveItem }) {
  const ex = useExplorer();
  return (
    <div className="flex flex-col items-center text-center gap-4 px-6">
      <div className="w-28 h-28 rounded-3xl bg-white/10 flex items-center justify-center">
        <KindIcon item={item} className="w-14 h-14" />
      </div>
      <div>
        <p className="text-white font-semibold">{KIND_LABEL[item.kind]}{item.extension ? ` .${item.extension}` : ''}</p>
        <p className="text-white/60 text-sm mt-1">{item.size ? formatBytes(item.size) : ''} · No se puede previsualizar en el navegador</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => ex.download([item])} className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent/90">
          <Download className="w-4 h-4" /> Descargar
        </button>
        <button type="button" onClick={() => ex.openInDrive(item)} className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-white/10 text-white text-sm font-medium hover:bg-white/20">
          <HardDrive className="w-4 h-4" /> Abrir en Drive
        </button>
      </div>
    </div>
  );
}

function PreviewBody({ item }: { item: DriveItem }) {
  switch (item.kind) {
    case 'image': return <ImagePreview item={item} />;
    case 'video': return <VideoPreview item={item} />;
    case 'audio': return <AudioPreview item={item} />;
    case 'pdf':
    case 'text': return <DriveFrame item={item} src={`/api/files/${item.id}?inline=true`} />;
    case 'doc':
    case 'sheet':
    case 'slides': return <DriveFrame item={item} />;
    default: return <Fallback item={item} />;
  }
}

export function PreviewModal() {
  const ex = useExplorer();
  const files = useMemo(() => ex.visibleItems.filter(i => !i.isFolder), [ex.visibleItems]);
  const index = files.findIndex(f => f.id === ex.previewId);
  const item = index >= 0 ? files[index] : null;
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const inTrash = ex.view === 'trash';

  const go = (delta: number) => {
    if (files.length < 2 || index < 0) return;
    const next = files[(index + delta + files.length) % files.length];
    ex.setPreviewId(next.id);
    ex.selectOnly(next.id);
  };

  useEffect(() => {
    if (!ex.previewId) return;
    if (!item) {
      ex.setPreviewId(null);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof Element && t.closest('input, textarea, select, video, [role="dialog"]:not([data-preview])')) return;
      // Another dialog (share, delete, confirm…) opened on top of the preview handles its own keys
      if (document.querySelector('[aria-modal="true"]:not([data-preview])')) return;
      const handled = () => { e.preventDefault(); e.stopPropagation(); };
      if (e.key === 'Escape') { handled(); ex.setPreviewId(null); }
      else if (e.key === 'ArrowRight') { handled(); go(1); }
      else if (e.key === 'ArrowLeft') { handled(); go(-1); }
      else if (e.key === ' ' && item.kind === 'audio') { handled(); ex.play(item); }
      else if (e.key === ' ') { handled(); ex.setPreviewId(null); }
    };
    window.addEventListener('keydown', onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ex.previewId, item, index, files]);

  if (!item || typeof document === 'undefined') return null;

  const iconBtn = 'w-10 h-10 items-center justify-center rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors shrink-0';

  return createPortal(
    <div
      className="fixed inset-0 z-[95] bg-black/90 backdrop-blur-md flex flex-col animate-fade-in"
      role="dialog"
      aria-modal="true"
      data-preview
      aria-label={`Vista previa de ${item.name}`}
      onTouchStart={e => { if (e.touches.length === 1) touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
      onTouchEnd={e => {
        const start = touchRef.current;
        touchRef.current = null;
        if (!start || item.kind === 'pdf' || ['doc', 'sheet', 'slides', 'text'].includes(item.kind)) return;
        const dx = e.changedTouches[0].clientX - start.x;
        const dy = e.changedTouches[0].clientY - start.y;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
        else if (dy > 110 && Math.abs(dy) > Math.abs(dx) * 1.5) ex.setPreviewId(null);
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-2 md:px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 shrink-0">
        <button type="button" onClick={() => ex.setPreviewId(null)} className={cn(iconBtn, 'flex')} aria-label="Cerrar">
          <X className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate">{item.name}</p>
          <p className="text-[11px] text-white/50">
            {files.length > 1 ? `${index + 1} de ${files.length}` : KIND_LABEL[item.kind]}
            {item.size ? ` · ${formatBytes(item.size)}` : ''}
          </p>
        </div>
        {!inTrash && (
          <>
            <button type="button" onClick={() => ex.toggleStar([item])} className={cn(iconBtn, 'hidden sm:flex', item.starred && 'text-amber-400')} aria-label="Destacar" title="Destacar">
              <Star className={cn('w-[18px] h-[18px]', item.starred && 'fill-current')} />
            </button>
            <button type="button" onClick={() => ex.download([item])} className={cn(iconBtn, 'flex')} aria-label="Descargar" title="Descargar">
              <Download className="w-[18px] h-[18px]" />
            </button>
            <button type="button" onClick={() => ex.setShareItem(item)} className={cn(iconBtn, 'hidden sm:flex')} aria-label="Compartir" title="Compartir">
              <Share2 className="w-[18px] h-[18px]" />
            </button>
            <a href={driveUrl(item)} target="_blank" rel="noopener noreferrer" className={cn(iconBtn, 'hidden sm:flex')} aria-label="Abrir en Google Drive" title="Abrir en Google Drive">
              <ExternalLink className="w-[18px] h-[18px]" />
            </a>
            <button type="button" onClick={() => { ex.setPreviewId(null); ex.openDetails(item); }} className={cn(iconBtn, 'hidden sm:flex')} aria-label="Detalles" title="Detalles">
              <Info className="w-[18px] h-[18px]" />
            </button>
            <button
              type="button"
              onClick={e => {
                const rect = e.currentTarget.getBoundingClientRect();
                ex.showItemMenu(rect.right - 220, rect.bottom + 4, item);
              }}
              className={cn(iconBtn, 'flex')}
              aria-label="Más acciones"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </>
        )}
      </div>

      {/* Body */}
      <div className="relative flex-1 min-h-0 flex items-center justify-center px-2 md:px-16 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <PreviewBody item={item} />
        {files.length > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white items-center justify-center" aria-label="Anterior">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button type="button" onClick={() => go(1)} className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white items-center justify-center" aria-label="Siguiente">
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
