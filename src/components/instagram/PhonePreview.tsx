'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Heart, MessageCircle, Send, Bookmark, Music2, Play, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { IgFormat, IgUserTag } from '@/types/instagram';

export interface PreviewItem {
  key: string;
  kind: 'image' | 'video';
  url?: string;
  tags?: IgUserTag[];
}

interface Props {
  format: IgFormat;
  items: PreviewItem[];
  /** Proporción del feed (ancho/alto) */
  ratio: number;
  caption: string;
  username: string;
  avatarUrl?: string;
  collaborators: string[];
  audioName?: string;
  activeIndex: number;
  onActiveIndex: (i: number) => void;
  /** Toque sobre la imagen (coordenadas 0..1) para etiquetar */
  onTapImage?: (x: number, y: number) => void;
}

function Avatar({ url, size = 28 }: { url?: string; size?: number }) {
  return (
    <div className="rounded-full p-[1.5px] bg-gradient-to-tr from-[#feda75] via-[#d62976] to-[#4f5bd5] shrink-0" style={{ width: size, height: size }}>
      <div className="w-full h-full rounded-full bg-black overflow-hidden flex items-center justify-center">
        {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <User className="w-3/5 h-3/5 text-white/60" />}
      </div>
    </div>
  );
}

function Media({ item, className, onTap, contain }: { item?: PreviewItem; className?: string; onTap?: (x: number, y: number) => void; contain?: boolean }) {
  if (!item?.url) {
    return <div className={cn('bg-white/5 flex items-center justify-center text-white/30 text-xs', className)}>Sin archivo</div>;
  }
  const handle = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onTap || item.kind !== 'image') return;
    const r = e.currentTarget.getBoundingClientRect();
    onTap((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  };
  return (
    <div className={cn('relative overflow-hidden bg-black', onTap && item.kind === 'image' && 'cursor-crosshair', className)} onClick={handle}>
      {item.kind === 'video' ? (
        <video src={item.url} className={cn('w-full h-full', contain ? 'object-contain' : 'object-cover')} muted loop autoPlay playsInline />
      ) : (
        <img src={item.url} alt="" className={cn('w-full h-full', contain ? 'object-contain' : 'object-cover')} draggable={false} />
      )}
      {(item.tags || []).filter(t => t.x != null).map(t => (
        <span
          key={t.username}
          className="absolute -translate-x-1/2 translate-y-1 px-1.5 py-0.5 rounded bg-black/75 text-white text-[9px] font-semibold whitespace-nowrap pointer-events-none"
          style={{ left: `${(t.x ?? 0.5) * 100}%`, top: `${(t.y ?? 0.5) * 100}%` }}
        >
          {t.username}
        </span>
      ))}
    </div>
  );
}

function CaptionText({ username, text }: { username: string; text: string }) {
  const [open, setOpen] = useState(false);
  if (!text.trim()) return null;
  const parts = text.split(/(\s[#@][\w.\p{L}]+|^[#@][\w.\p{L}]+)/u);
  return (
    <p className={cn('text-[11px] leading-snug text-white whitespace-pre-line', !open && 'line-clamp-2')} onClick={() => setOpen(o => !o)}>
      <span className="font-semibold mr-1">{username}</span>
      {parts.map((p, i) => /^\s?[#@]/.test(p) ? <span key={i} className="text-[#e0f1ff]">{p}</span> : <span key={i}>{p}</span>)}
    </p>
  );
}

export function PhonePreview(p: Props) {
  const { format, items, activeIndex } = p;
  const current = items[Math.min(activeIndex, Math.max(0, items.length - 1))];
  const handle = p.username || 'ezyprods';
  const collabLine = p.collaborators.length ? ` y ${p.collaborators.length === 1 ? p.collaborators[0] : `${p.collaborators.length} más`}` : '';

  return (
    <div className="mx-auto w-full max-w-[270px] select-none">
      <div className="rounded-[34px] border-[6px] border-[#1d1d24] bg-black shadow-2xl overflow-hidden aspect-[9/19.5] relative">
        {(format === 'STORY' || format === 'REEL') ? (
          <div className="absolute inset-0">
            <Media item={current} className="absolute inset-0" onTap={format === 'STORY' ? p.onTapImage : undefined} contain={current?.kind === 'image'} />
            {format === 'STORY' ? (
              <div className="absolute top-0 inset-x-0 p-2.5 bg-gradient-to-b from-black/50 to-transparent">
                <div className="h-0.5 rounded-full bg-white/40 overflow-hidden mb-2"><div className="h-full w-1/3 bg-white" /></div>
                <div className="flex items-center gap-1.5">
                  <Avatar url={p.avatarUrl} size={22} />
                  <span className="text-[10px] font-semibold text-white">{handle}</span>
                  <span className="text-[10px] text-white/60">ahora</span>
                </div>
              </div>
            ) : (
              <>
                <div className="absolute right-2 bottom-20 flex flex-col items-center gap-3.5 text-white">
                  <Heart className="w-5 h-5" /><MessageCircle className="w-5 h-5" /><Send className="w-5 h-5" />
                </div>
                <div className="absolute bottom-0 inset-x-0 p-3 pr-10 bg-gradient-to-t from-black/70 via-black/30 to-transparent space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Avatar url={p.avatarUrl} size={22} />
                    <span className="text-[10px] font-semibold text-white truncate">{handle}{collabLine}</span>
                  </div>
                  <CaptionText username="" text={p.caption} />
                  <div className="flex items-center gap-1 text-[10px] text-white/90">
                    <Music2 className="w-3 h-3 shrink-0" />
                    <span className="truncate">{p.audioName || `${handle} · Audio original`}</span>
                  </div>
                </div>
                {current?.kind === 'image' && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><Play className="w-10 h-10 text-white/70" /></div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="absolute inset-0 bg-black flex flex-col pt-6">
            <div className="flex items-center gap-2 px-2.5 py-2">
              <Avatar url={p.avatarUrl} />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-white truncate">{handle}{collabLine}</p>
              </div>
            </div>
            <div className="relative w-full" style={{ aspectRatio: String(p.ratio) }}>
              <Media item={current} className="absolute inset-0" onTap={p.onTapImage} />
              {format === 'CAROUSEL' && items.length > 1 && (
                <>
                  <span className="absolute top-2 right-2 text-[9px] font-semibold text-white bg-black/60 rounded-full px-1.5 py-0.5">{activeIndex + 1}/{items.length}</span>
                  {activeIndex > 0 && (
                    <button type="button" onClick={() => p.onActiveIndex(activeIndex - 1)} className="absolute left-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/80 text-black flex items-center justify-center"><ChevronLeft className="w-4 h-4" /></button>
                  )}
                  {activeIndex < items.length - 1 && (
                    <button type="button" onClick={() => p.onActiveIndex(activeIndex + 1)} className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/80 text-black flex items-center justify-center"><ChevronRight className="w-4 h-4" /></button>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center justify-between px-2.5 py-2 text-white">
              <div className="flex items-center gap-3"><Heart className="w-[18px] h-[18px]" /><MessageCircle className="w-[18px] h-[18px]" /><Send className="w-[18px] h-[18px]" /></div>
              {format === 'CAROUSEL' && items.length > 1 && (
                <div className="flex gap-1">{items.map((it, i) => <span key={it.key} className={cn('w-1 h-1 rounded-full', i === activeIndex ? 'bg-[#0095f6]' : 'bg-white/40')} />)}</div>
              )}
              <Bookmark className="w-[18px] h-[18px]" />
            </div>
            <div className="px-2.5 space-y-1 overflow-hidden">
              <CaptionText username={handle} text={p.caption} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
