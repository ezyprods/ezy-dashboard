'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Zap, CalendarClock, Smartphone, Image as ImageIcon, Film, GalleryHorizontalEnd, Upload, HardDrive, Music4,
  X, Loader2, AlertTriangle, ChevronLeft, ChevronRight, Plus, AtSign, Users, Link2, ChevronDown, Hash, FileText,
  MessageSquarePlus, Eye, Sparkles, Tag,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { DatePicker } from '@/components/ui/DatePicker';
import { ArtistPicker } from '@/components/upload/EntityPickers';
import { useArtists } from '@/lib/hooks/useArtists';
import { cn, formatFileSize } from '@/lib/utils';
import { uploadFileToDrive } from '@/lib/driveUpload';
import {
  CAPTION_MAX, CAROUSEL_MAX, COLLABORATORS_MAX, FORMAT_LABEL, HASHTAGS_MAX, MENTIONS_MAX, USER_TAGS_MAX,
  cleanUsername, countHashtags, countMentions, formatSeconds, mediaProblem,
} from '@/lib/instagram/limits';
import {
  ASPECTS, Cancelled, baseName, isImageFile, isVideoFile, loadBitmap, needsOptimizing, optimizeVideo,
  readVideoInfo, renderImage, resolveRatio, thumbnailFrom, type AspectId, type FitMode,
} from '@/lib/instagram/prepareMedia';
import type { IgBootstrap, IgFormat, IgMediaItem, IgPostInput, IgUserTag } from '@/types/instagram';
import { PhonePreview, type PreviewItem } from './PhonePreview';
import { DrivePicker } from './DrivePicker';
import { MusicReelBuilder, type MusicReelResult } from './MusicReelBuilder';
import {
  createPost, downloadDriveBlob, driveFileInfo, driveThumb, getBootstrap, notifyChanged, updatePost, type ComposeRequest,
} from './igClient';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos y utilidades
// ─────────────────────────────────────────────────────────────────────────────

type Stage = 'loading' | 'optimizing' | 'uploading' | 'ready' | 'error';

interface Draft {
  key: string;
  kind: 'image' | 'video';
  name: string;
  bitmap?: ImageBitmap;
  ready?: IgMediaItem;
  previewUrl?: string;
  width: number;
  height: number;
  duration?: number;
  size?: number;
  stage: Stage;
  progress?: number;
  error?: string;
  altText?: string;
  userTags: IgUserTag[];
  sourceFileId?: string;
}

const FORMATS: { id: IgFormat; label: string; hint: string; Icon: typeof Smartphone }[] = [
  { id: 'STORY', label: 'Historia', hint: '24 h · 9:16', Icon: Smartphone },
  { id: 'POST', label: 'Post', hint: 'Imagen en el feed', Icon: ImageIcon },
  { id: 'REEL', label: 'Reel', hint: 'Vídeo vertical', Icon: Film },
  { id: 'CAROUSEL', label: 'Carrusel', hint: `2–${CAROUSEL_MAX} archivos`, Icon: GalleryHorizontalEnd },
];

const FEED_ASPECTS: { id: AspectId; label: string }[] = [
  { id: '4:5', label: '4:5' },
  { id: '1:1', label: '1:1' },
  { id: '1.91:1', label: 'Horizontal' },
  { id: 'original', label: 'Original' },
];

const FITS: { id: FitMode; label: string }[] = [
  { id: 'cover', label: 'Recortar' },
  { id: 'blur', label: 'Fondo difuminado' },
  { id: 'black', label: 'Fondo negro' },
  { id: 'white', label: 'Fondo blanco' },
];

function discardFiles(ids: string[]) {
  if (!ids.length) return;
  fetch('/api/instagram/discard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileIds: ids }),
    keepalive: true,
  }).catch(() => {});
}

let keySeq = 0;
const newKey = () => `m${Date.now().toString(36)}${(keySeq++).toString(36)}`;

function pad(n: number) { return String(n).padStart(2, '0'); }
function ymd(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function hm(d: Date) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function combine(date: string, time: string): Date | null {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}:00`);
  return isNaN(d.getTime()) ? null : d;
}

const whenFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function quickSlots(now = new Date()) {
  const at = (days: number, h: number, m: number) => { const d = new Date(now); d.setDate(d.getDate() + days); d.setHours(h, m, 0, 0); return d; };
  const slots: { label: string; d: Date }[] = [];
  if (now.getHours() < 19) slots.push({ label: 'Hoy 19:30', d: at(0, 19, 30) });
  slots.push({ label: 'Mañana 13:00', d: at(1, 13, 0) });
  slots.push({ label: 'Mañana 19:30', d: at(1, 19, 30) });
  const toFri = (5 - now.getDay() + 7) % 7 || 7;
  if (toFri > 1) slots.push({ label: 'Viernes 19:30', d: at(toFri, 19, 30) });
  const toSun = (7 - now.getDay()) % 7 || 7;
  if (toSun > 1 && toSun !== toFri) slots.push({ label: 'Domingo 12:00', d: at(toSun, 12, 0) });
  return slots;
}

// ─────────────────────────────────────────────────────────────────────────────
// Piezas pequeñas
// ─────────────────────────────────────────────────────────────────────────────

function Section({ title, icon: Icon, children, aside }: { title: string; icon?: typeof Smartphone; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
          {Icon && <Icon className="w-3.5 h-3.5" />}{title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Pill({ active, onClick, children, className }: { active?: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button type="button" onClick={onClick}
      className={cn('h-8 px-3 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap',
        active ? 'bg-accent/15 border-accent text-accent-light' : 'border-border text-text-secondary hover:text-text-primary hover:border-text-secondary/40', className)}>
      {children}
    </button>
  );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="w-full flex items-center gap-3 text-left py-1">
      <span className={cn('relative w-9 h-5 rounded-full transition-colors shrink-0', checked ? 'bg-accent' : 'bg-border')}>
        <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-text-primary">{label}</span>
        {hint && <span className="block text-[11px] text-text-secondary">{hint}</span>}
      </span>
    </button>
  );
}

function UsernameInput({ values, onChange, max, placeholder }: { values: string[]; onChange: (v: string[]) => void; max: number; placeholder: string }) {
  const [text, setText] = useState('');
  const add = () => {
    const u = cleanUsername(text);
    if (u && !values.includes(u) && values.length < max) onChange([...values, u]);
    setText('');
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 min-h-11 px-2 py-1.5 rounded-xl border border-border bg-surface focus-within:border-accent">
      {values.map(u => (
        <span key={u} className="flex items-center gap-1 h-7 pl-2 pr-1 rounded-lg bg-accent/15 text-accent-light text-xs font-medium">
          @{u}
          <button type="button" onClick={() => onChange(values.filter(v => v !== u))} className="w-5 h-5 rounded flex items-center justify-center hover:bg-accent/20" aria-label={`Quitar ${u}`}><X className="w-3 h-3" /></button>
        </span>
      ))}
      {values.length < max && (
        <input value={text} onChange={e => setText(e.target.value)} onBlur={add}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',' || e.key === ' ') { e.preventDefault(); add(); } else if (e.key === 'Backspace' && !text && values.length) onChange(values.slice(0, -1)); }}
          placeholder={values.length ? '' : placeholder} className="flex-1 min-w-[120px] h-7 bg-transparent text-sm focus:outline-none" />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Formulario
// ─────────────────────────────────────────────────────────────────────────────

export function InstagramComposer({ request, onClose }: { request: ComposeRequest; onClose: () => void }) {
  const editing = request.post;
  const base = editing || request.duplicate;
  const { activeArtists } = useArtists();

  const [boot, setBoot] = useState<IgBootstrap | null>(null);
  const [bootError, setBootError] = useState('');
  const [mode, setMode] = useState<'now' | 'schedule'>(editing || request.duplicate ? 'schedule' : request.mode || 'schedule');
  const [format, setFormat] = useState<IgFormat>(base?.format || 'POST');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [active, setActive] = useState(0);
  const [aspect, setAspect] = useState<AspectId>('4:5');
  const [fit, setFit] = useState<FitMode>('cover');
  const [storyFit, setStoryFit] = useState<FitMode>('blur');
  const [caption, setCaption] = useState(base?.caption || '');
  const [firstComment, setFirstComment] = useState(base?.firstComment || '');
  const [showFirstComment, setShowFirstComment] = useState(!!base?.firstComment);
  const [collaborators, setCollaborators] = useState<string[]>(base?.collaborators || []);
  const [storyMentions, setStoryMentions] = useState<string[]>(base?.storyMentions || []);
  const [shareToFeed, setShareToFeed] = useState(base?.reel?.shareToFeed !== false);
  const [trial, setTrial] = useState(!!base?.reel?.trial);
  const [audioName, setAudioName] = useState(base?.reel?.audioName || '');
  const [thumbOffset, setThumbOffset] = useState((base?.reel?.thumbOffsetMs || 0) / 1000);
  const [cover, setCover] = useState<{ file?: File; fileId?: string; url: string } | null>(
    base?.reel?.coverFileId ? { fileId: base.reel.coverFileId, url: driveThumb(base.reel.coverFileId) } : null
  );
  const [artistId, setArtistId] = useState(base?.links?.artistId || request.artistId || '');
  const [linkedFiles, setLinkedFiles] = useState<{ id: string; name: string }[]>(base?.links?.files || []);
  const [title, setTitle] = useState(base?.title || '');
  const initialWhen = useMemo(() => {
    if (editing && new Date(editing.scheduledFor).getTime() > Date.now()) return new Date(editing.scheduledFor);
    if (request.at) return new Date(request.at);
    return quickSlots()[0].d;
  }, [editing, request.at]);
  const [date, setDate] = useState(ymd(initialWhen));
  const [time, setTime] = useState(hm(initialWhen));
  const [picker, setPicker] = useState<'' | 'media' | 'link'>('');
  const [musicOpen, setMusicOpen] = useState(false);
  const [tagPoint, setTagPoint] = useState<{ x: number; y: number } | null>(null);
  const [tagText, setTagText] = useState('');
  const [submitting, setSubmitting] = useState('');
  const [showMore, setShowMore] = useState(!!(base?.links?.files?.length || base?.title));
  const [mobilePreview, setMobilePreview] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const uploads = useRef(new Map<string, Promise<IgMediaItem>>());
  const aborts = useRef(new Map<string, AbortController>());
  const objectUrls = useRef(new Set<string>());
  const captionRef = useRef<HTMLTextAreaElement>(null);
  // Archivos subidos en esta sesión del formulario: si no se llegan a usar, se borran al cerrar
  const sessionFiles = useRef(new Map<string, string[]>());
  const submitted = useRef(false);
  const track = (key: string, ...ids: (string | undefined)[]) => {
    const list = sessionFiles.current.get(key) || [];
    sessionFiles.current.set(key, [...list, ...ids.filter((x): x is string => !!x)]);
  };

  const artist = activeArtists.find(a => a.id === artistId);
  const artistHandle = cleanUsername((artist as any)?.instagram || '');

  // ── Arranque ──────────────────────────────────────────────────────────────
  useEffect(() => {
    getBootstrap().then(setBoot).catch(e => setBootError(e.message));
  }, []);

  useEffect(() => {
    const urls = objectUrls.current;
    const abortMap = aborts.current;
    const files = sessionFiles.current;
    return () => {
      urls.forEach(u => URL.revokeObjectURL(u));
      abortMap.forEach(a => a.abort());
      if (!submitted.current) discardFiles([...files.values()].flat());
    };
  }, []);

  const objectUrl = (blob: Blob) => {
    const u = URL.createObjectURL(blob);
    objectUrls.current.add(u);
    return u;
  };

  const patch = useCallback((key: string, change: Partial<Draft>) => {
    setDrafts(list => list.map(d => (d.key === key ? { ...d, ...change } : d)));
  }, []);

  // Publicación existente: sus archivos ya están en Drive
  useEffect(() => {
    if (!base) return;
    setDrafts(base.media.map(m => ({
      key: newKey(),
      kind: m.kind,
      name: m.name,
      ready: m,
      previewUrl: driveThumb(m.thumbFileId || m.fileId, 900),
      width: m.width,
      height: m.height,
      duration: m.duration,
      size: m.size,
      stage: 'ready',
      altText: m.altText,
      userTags: m.userTags || [],
      sourceFileId: m.sourceFileId,
    })));
    if (base.media[0]?.width && base.format !== 'STORY') {
      const r = base.media[0].width / base.media[0].height;
      const match = (Object.entries(ASPECTS) as [AspectId, number][]).find(([, v]) => Math.abs(v - r) < 0.02);
      setAspect(match ? match[0] : 'original');
    }
  }, [base]);

  // ── Añadir archivos ───────────────────────────────────────────────────────

  const startVideoUpload = useCallback((key: string, file: File) => {
    if (!boot) return;
    const ctrl = new AbortController();
    aborts.current.set(key, ctrl);
    const job = (async (): Promise<IgMediaItem> => {
      const info = await readVideoInfo(file);
      if (info?.thumb) patch(key, { previewUrl: objectUrl(file) });
      patch(key, { width: info?.width || 0, height: info?.height || 0, duration: info?.duration || 0 });
      let final = file;
      const why = needsOptimizing(file, info, format === 'STORY');
      if (why) {
        patch(key, { stage: 'optimizing', progress: 0 });
        final = await optimizeVideo(file, info, { onProgress: p => patch(key, { progress: p }), signal: ctrl.signal, forStory: format === 'STORY' });
      }
      patch(key, { stage: 'uploading', progress: 0, size: final.size });
      const up = await uploadFileToDrive(final, boot.mediaFolderId, {
        name: `${baseName(file.name)}.mp4`,
        onProgress: p => patch(key, { progress: p }),
        signal: ctrl.signal,
      });
      track(key, up.id);
      let thumbFileId: string | undefined;
      if (info?.thumb) {
        const t = await uploadFileToDrive(new File([info.thumb], `${baseName(file.name)}-miniatura.jpg`, { type: 'image/jpeg' }), boot.mediaFolderId).catch(() => null);
        thumbFileId = t?.id;
        track(key, t?.id);
      }
      const w = Math.max(info?.width || 0, 0);
      const h = Math.max(info?.height || 0, 0);
      const scale = Math.max(w, h) > 1920 ? 1920 / Math.max(w, h) : 1;
      const item: IgMediaItem = {
        fileId: up.id,
        kind: 'video',
        mimeType: final.type || 'video/mp4',
        name: final.name,
        width: Math.round(w * scale),
        height: Math.round(h * scale),
        duration: info?.duration || 0,
        size: final.size,
        thumbFileId,
      };
      patch(key, { stage: 'ready', ready: item, progress: 1, width: item.width, height: item.height, size: item.size });
      return item;
    })();
    job.catch(err => {
      if (err instanceof Cancelled || (err as Error)?.name === 'AbortError') return;
      patch(key, { stage: 'error', error: (err as Error).message || 'No se pudo subir' });
    });
    uploads.current.set(key, job);
  }, [boot, format, patch]);

  const addLocalFiles = async (files: File[]) => {
    const accepted = files.filter(f => isImageFile(f) || isVideoFile(f));
    if (accepted.length < files.length) toast.error('Solo se pueden añadir imágenes y vídeos.');
    if (!accepted.length) return;

    // Formato inteligente según lo que se añade
    const total = drafts.length + accepted.length;
    const hasVideo = accepted.some(isVideoFile) || drafts.some(d => d.kind === 'video');
    let nextFormat = format;
    if (total > 1 && format !== 'CAROUSEL') nextFormat = 'CAROUSEL';
    else if (total === 1 && hasVideo && format === 'POST') nextFormat = 'REEL';
    if (nextFormat !== format) {
      setFormat(nextFormat);
      toast.info(`Cambiado a ${FORMAT_LABEL[nextFormat]}`);
    }
    const replace = nextFormat !== 'CAROUSEL';
    const room = replace ? 1 : CAROUSEL_MAX - drafts.length;
    const take = accepted.slice(0, Math.max(0, room));
    if (replace) clearDrafts();

    for (const file of take) {
      const key = newKey();
      if (isVideoFile(file)) {
        setDrafts(list => [...list, { key, kind: 'video', name: file.name, width: 0, height: 0, size: file.size, stage: 'loading', userTags: [], previewUrl: objectUrl(file) }]);
        startVideoUpload(key, file);
      } else {
        setDrafts(list => [...list, { key, kind: 'image', name: file.name, width: 0, height: 0, size: file.size, stage: 'loading', userTags: [] }]);
        loadBitmap(file)
          .then(bitmap => patch(key, { bitmap, width: bitmap.width, height: bitmap.height, stage: 'ready' }))
          .catch(err => patch(key, { stage: 'error', error: err.message }));
      }
    }
  };

  const addDriveFiles = async (files: { id: string; name: string; kind: string; mimeType: string; width: number; height: number; duration: number; size: number }[]) => {
    setPicker('');
    const total = drafts.length + files.length;
    const hasVideo = files.some(f => f.kind === 'video');
    let nextFormat = format;
    if (total > 1 && format !== 'CAROUSEL') nextFormat = 'CAROUSEL';
    else if (total === 1 && hasVideo && format === 'POST') nextFormat = 'REEL';
    if (nextFormat !== format) { setFormat(nextFormat); toast.info(`Cambiado a ${FORMAT_LABEL[nextFormat]}`); }
    if (nextFormat !== 'CAROUSEL') clearDrafts();
    const take = nextFormat === 'CAROUSEL' ? files.slice(0, CAROUSEL_MAX - drafts.length) : files.slice(0, 1);

    for (const f of take) {
      const key = newKey();
      if (f.kind === 'video') {
        const item: IgMediaItem = {
          fileId: f.id, kind: 'video', mimeType: f.mimeType, name: f.name, width: f.width, height: f.height, duration: f.duration, size: f.size, sourceFileId: f.id,
        };
        const tooBig = Math.max(f.width, f.height) > 1920;
        setDrafts(list => [...list, {
          key, kind: 'video', name: f.name, ready: tooBig ? undefined : item, previewUrl: driveThumb(f.id, 900),
          width: f.width, height: f.height, duration: f.duration, size: f.size,
          stage: tooBig ? 'error' : 'ready',
          error: tooBig ? 'Es mayor de 1080p: súbelo desde tu ordenador para optimizarlo.' : undefined,
          userTags: [], sourceFileId: f.id,
        }]);
      } else {
        setDrafts(list => [...list, { key, kind: 'image', name: f.name, width: f.width, height: f.height, size: f.size, stage: 'loading', userTags: [], sourceFileId: f.id }]);
        downloadDriveBlob(f.id)
          .then(loadBitmap)
          .then(bitmap => patch(key, { bitmap, width: bitmap.width, height: bitmap.height, stage: 'ready' }))
          .catch(err => patch(key, { stage: 'error', error: err.message }));
      }
    }
  };

  // Desde el explorador: empezar con ese archivo
  const startedWithDrive = useRef(false);
  useEffect(() => {
    if (!boot || !request.driveFileId || startedWithDrive.current) return;
    startedWithDrive.current = true;
    driveFileInfo(request.driveFileId)
      .then(f => {
        const kind = f.mimeType.startsWith('video/') ? 'video' : 'image';
        if (kind === 'video' && format === 'POST') setFormat('REEL');
        addDriveFiles([{ ...f, kind }]);
      })
      .catch(err => toast.error(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boot, request.driveFileId]);

  const addMusicReel = (r: MusicReelResult) => {
    setMusicOpen(false);
    if (format !== 'REEL' && format !== 'STORY') setFormat('REEL');
    clearDrafts();
    const key = newKey();
    setDrafts([{ key, kind: 'video', name: r.file.name, width: r.width, height: r.height, duration: r.duration, size: r.file.size, stage: 'uploading', progress: 0, userTags: [], previewUrl: objectUrl(r.file), sourceFileId: r.sourceFileId }]);
    if (!audioName) setAudioName(r.audioName);
    if (r.sourceFileId && !linkedFiles.some(f => f.id === r.sourceFileId)) setLinkedFiles(l => [...l, { id: r.sourceFileId!, name: r.audioName }]);
    if (!boot) return;
    const ctrl = new AbortController();
    aborts.current.set(key, ctrl);
    const job = (async () => {
      const up = await uploadFileToDrive(r.file, boot.mediaFolderId, { onProgress: p => patch(key, { progress: p }), signal: ctrl.signal });
      const t = await uploadFileToDrive(new File([r.thumb], `${baseName(r.file.name)}-miniatura.jpg`, { type: 'image/jpeg' }), boot.mediaFolderId).catch(() => null);
      track(key, up.id, t?.id);
      const item: IgMediaItem = { fileId: up.id, kind: 'video', mimeType: 'video/mp4', name: r.file.name, width: r.width, height: r.height, duration: r.duration, size: r.file.size, thumbFileId: t?.id, sourceFileId: r.sourceFileId };
      patch(key, { stage: 'ready', ready: item });
      return item;
    })();
    job.catch(err => { if ((err as Error)?.name !== 'AbortError') patch(key, { stage: 'error', error: (err as Error).message }); });
    uploads.current.set(key, job);
  };

  function clearDrafts() {
    for (const [k, ids] of sessionFiles.current) if (k !== 'submit') discardFiles(ids);
    for (const k of [...sessionFiles.current.keys()]) if (k !== 'submit') sessionFiles.current.delete(k);
    aborts.current.forEach(a => a.abort());
    aborts.current.clear();
    uploads.current.clear();
    setDrafts([]);
    setActive(0);
  }

  const removeDraft = (key: string) => {
    discardFiles(sessionFiles.current.get(key) || []);
    sessionFiles.current.delete(key);
    aborts.current.get(key)?.abort();
    aborts.current.delete(key);
    uploads.current.delete(key);
    setDrafts(list => list.filter(d => d.key !== key));
    setActive(0);
  };

  const move = (i: number, dir: -1 | 1) => {
    setDrafts(list => {
      const j = i + dir;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setActive(i + dir);
  };

  // ── Vista previa de las imágenes con el recorte elegido ────────────────────
  const effectiveAspect: AspectId = format === 'STORY' ? '9:16' : aspect;
  const effectiveFit: FitMode = format === 'STORY' ? storyFit : fit;
  const [previews, setPreviews] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    const created: string[] = [];
    (async () => {
      const out: Record<string, string> = {};
      for (const d of drafts) {
        if (d.kind !== 'image' || !d.bitmap) continue;
        const r = await renderImage(d.bitmap, { aspect: carouselAspect(), fit: effectiveFit, width: 540 }).catch(() => null);
        if (!r || !alive) continue;
        const u = URL.createObjectURL(r.blob);
        created.push(u);
        out[d.key] = u;
      }
      if (alive) setPreviews(out);
    })();
    return () => { alive = false; created.forEach(u => setTimeout(() => URL.revokeObjectURL(u), 2000)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts.map(d => `${d.key}:${!!d.bitmap}`).join(','), effectiveAspect, effectiveFit]);

  /** En un carrusel todas las fotos van con la misma proporción (la de la primera) */
  function carouselAspect(): AspectId {
    if (effectiveAspect !== 'original') return effectiveAspect;
    const first = drafts.find(d => d.kind === 'image');
    if (!first?.width) return '4:5';
    const r = resolveRatio('original', first.width, first.height);
    const match = (Object.entries(ASPECTS) as [AspectId, number][]).find(([, v]) => Math.abs(v - r) < 0.01);
    return match ? match[0] : 'original';
  }

  const feedRatio = useMemo(() => {
    const first = drafts[0];
    if (effectiveAspect !== 'original') return ASPECTS[effectiveAspect as Exclude<AspectId, 'original'>];
    if (!first?.width) return 4 / 5;
    return resolveRatio('original', first.width, first.height);
  }, [drafts, effectiveAspect]);

  // ── Comprobaciones ────────────────────────────────────────────────────────
  const used = format === 'CAROUSEL' ? drafts : drafts.slice(0, 1);
  const whenDate = combine(date, time);
  const problems = useMemo(() => {
    const p: string[] = [];
    if (!boot?.account.connected && mode === 'now') p.push('Conecta la cuenta de Instagram para publicar ahora.');
    if (used.length === 0) p.push('Añade una imagen o un vídeo.');
    if (format === 'CAROUSEL' && used.length === 1) p.push('Un carrusel necesita al menos 2 archivos.');
    for (const d of used) {
      if (d.stage === 'error') p.push(d.error || `Hay un problema con ${d.name}.`);
      const pr = mediaProblem({ kind: d.kind, duration: d.duration, size: d.size, width: d.ready?.width ?? (d.kind === 'video' ? d.width : 0), height: d.ready?.height ?? 0 }, format);
      if (pr && d.stage === 'ready') p.push(pr);
    }
    if (caption.length > CAPTION_MAX) p.push(`El texto pasa de ${CAPTION_MAX} caracteres.`);
    if (countHashtags(caption) > HASHTAGS_MAX) p.push(`Máximo ${HASHTAGS_MAX} hashtags.`);
    if (countMentions(caption) > MENTIONS_MAX) p.push(`Máximo ${MENTIONS_MAX} menciones.`);
    if (mode === 'schedule') {
      if (!whenDate) p.push('Elige fecha y hora.');
      else if (whenDate.getTime() < Date.now() + 60_000) p.push('La hora programada ya ha pasado.');
    }
    return [...new Set(p)];
  }, [boot, mode, used, format, caption, whenDate]);

  const busy = used.some(d => d.stage === 'loading' || d.stage === 'optimizing' || d.stage === 'uploading');

  // ── Guardar ───────────────────────────────────────────────────────────────
  const submit = async () => {
    if (!boot || problems.length || submitting) return;
    try {
      const media: IgMediaItem[] = [];
      for (let i = 0; i < used.length; i++) {
        const d = used[i];
        setSubmitting(used.length > 1 ? `Preparando ${i + 1} de ${used.length}…` : 'Preparando…');
        let item: IgMediaItem | undefined = d.ready;
        if (!item && d.kind === 'image' && d.bitmap) {
          const r = await renderImage(d.bitmap, { aspect: carouselAspect(), fit: effectiveFit });
          const up = await uploadFileToDrive(new File([r.blob], `${baseName(d.name)}.jpg`, { type: 'image/jpeg' }), boot.mediaFolderId);
          // Miniatura propia para la agenda (Drive tarda en generar las suyas)
          const small = i === 0 ? await thumbnailFrom(await loadBitmap(r.blob)).catch(() => null) : null;
          const th = small ? await uploadFileToDrive(new File([small], `${baseName(d.name)}-miniatura.jpg`, { type: 'image/jpeg' }), boot.mediaFolderId).catch(() => null) : null;
          track('submit', up.id, th?.id);
          item = { fileId: up.id, kind: 'image', mimeType: 'image/jpeg', name: `${baseName(d.name)}.jpg`, width: r.width, height: r.height, size: r.blob.size, thumbFileId: th?.id };
        }
        if (!item && d.kind === 'video') {
          setSubmitting('Terminando de subir el vídeo…');
          item = await uploads.current.get(d.key);
        }
        if (!item) throw new Error(`No se pudo preparar ${d.name}.`);
        media.push({ ...item, altText: d.altText?.trim() || undefined, userTags: d.userTags, sourceFileId: d.sourceFileId || item.sourceFileId });
      }

      let coverFileId = cover?.fileId;
      if (format === 'REEL' && cover?.file) {
        setSubmitting('Subiendo la portada…');
        const bmp = await loadBitmap(cover.file);
        const r = await renderImage(bmp, { aspect: '9:16', fit: 'cover', width: 1080 });
        coverFileId = (await uploadFileToDrive(new File([r.blob], 'portada.jpg', { type: 'image/jpeg' }), boot.mediaFolderId)).id;
        track('submit', coverFileId);
      }

      setSubmitting(mode === 'now' ? 'Enviando a Instagram…' : 'Programando…');
      const input: IgPostInput = {
        format,
        media,
        caption: format === 'STORY' ? '' : caption,
        firstComment: showFirstComment && format !== 'STORY' ? firstComment : undefined,
        collaborators: format === 'STORY' ? [] : collaborators,
        storyMentions: format === 'STORY' ? storyMentions : undefined,
        reel: format === 'REEL' ? {
          shareToFeed,
          audioName: audioName.trim() || undefined,
          coverFileId: cover ? coverFileId : undefined,
          thumbOffsetMs: !cover && thumbOffset > 0 ? Math.round(thumbOffset * 1000) : undefined,
          trial,
        } : undefined,
        links: { artistId: artistId || undefined, artistName: artist?.name, files: linkedFiles.length ? linkedFiles : undefined },
        title: title.trim() || undefined,
        scheduledFor: mode === 'now' ? null : whenDate!.toISOString(),
      };

      if (editing) {
        await updatePost(editing.id, input);
        toast.success('Publicación actualizada');
      } else {
        const r = await createPost(input);
        toast.success(r.publishing ? 'Publicando en Instagram… Puedes cerrar esta ventana.' : `Programada para el ${whenFmt.format(whenDate!)}`);
      }
      submitted.current = true;
      // Lo que se subió y se quitó por el camino ya no hace falta
      const usedIds = new Set([...media.flatMap(m => [m.fileId, m.thumbFileId]), coverFileId]);
      discardFiles([...sessionFiles.current.values()].flat().filter(id => !usedIds.has(id)));
      notifyChanged();
      onClose();
    } catch (err) {
      toast.error((err as Error).message || 'No se pudo guardar');
    } finally {
      setSubmitting('');
    }
  };

  // ── Etiquetas sobre la imagen ─────────────────────────────────────────────
  const activeDraft = used[Math.min(active, Math.max(0, used.length - 1))];
  const addTag = (username: string, point?: { x: number; y: number }) => {
    const u = cleanUsername(username);
    if (!u || !activeDraft) return;
    const tags = activeDraft.userTags.filter(t => t.username !== u);
    if (tags.length >= USER_TAGS_MAX) return toast.error(`Máximo ${USER_TAGS_MAX} personas por archivo.`);
    patch(activeDraft.key, { userTags: [...tags, { username: u, ...(activeDraft.kind === 'image' ? { x: point?.x ?? 0.5, y: point?.y ?? 0.5 } : {}) }] });
    setTagPoint(null);
    setTagText('');
  };

  const insertInCaption = (text: string, newLine = false) => {
    const el = captionRef.current;
    const sep = newLine ? (caption.trim() ? '\n\n' : '') : (caption && !/\s$/.test(caption) ? ' ' : '');
    if (!el || newLine) { setCaption(c => `${c.trimEnd()}${sep}${text}`); return; }
    const s = el.selectionStart ?? caption.length;
    const e = el.selectionEnd ?? caption.length;
    const next = caption.slice(0, s) + (s > 0 && !/\s$/.test(caption.slice(0, s)) ? ' ' : '') + text + caption.slice(e);
    setCaption(next);
    requestAnimationFrame(() => el.focus());
  };

  // ── Vista previa ──────────────────────────────────────────────────────────
  const previewItems: PreviewItem[] = used.map(d => ({
    key: d.key,
    // Los vídeos que ya están en Drive se previsualizan con su miniatura
    kind: d.kind === 'video' && !d.previewUrl?.startsWith('blob:') ? 'image' : d.kind,
    url: d.kind === 'image' ? (previews[d.key] || d.previewUrl) : d.previewUrl,
    tags: d.userTags,
  }));

  const ctaLabel = mode === 'now'
    ? 'Publicar ahora'
    : editing ? 'Guardar cambios' : whenDate ? `Programar · ${whenFmt.format(whenDate)}` : 'Programar';

  const preview = (
    <div className="space-y-3">
      <PhonePreview
        format={format}
        items={previewItems}
        ratio={feedRatio}
        caption={format === 'STORY' ? '' : caption}
        username={boot?.account.username || 'ezyprods'}
        avatarUrl={boot?.account.profilePictureUrl}
        collaborators={format === 'STORY' ? [] : collaborators}
        audioName={audioName}
        activeIndex={Math.min(active, Math.max(0, used.length - 1))}
        onActiveIndex={setActive}
        onTapImage={activeDraft?.kind === 'image' && format !== 'REEL' ? (x, y) => { setTagPoint({ x, y }); setTagText(''); } : undefined}
      />
      {activeDraft?.kind === 'image' && format !== 'REEL' && (
        <p className="text-[11px] text-text-secondary text-center">Toca la imagen para etiquetar a alguien.</p>
      )}
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Modal isOpen onClose={() => { if (!submitting) onClose(); }} title={editing ? 'Editar publicación' : request.duplicate ? 'Duplicar publicación' : 'Nueva publicación'} className="md:max-w-[1060px]!">
      {bootError ? (
        <p className="text-sm text-error">{bootError}</p>
      ) : !boot ? (
        <div className="flex items-center justify-center h-64 text-text-secondary"><Loader2 className="w-5 h-5 animate-spin" /></div>
      ) : (
        <div className="@container"><div className="grid @3xl:grid-cols-[minmax(0,1fr)_300px] gap-6 @3xl:gap-8">
          <div className="space-y-6 min-w-0">
            {/* Ahora o programar */}
            {!editing && (
              <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-surface border border-border">
                {([
                  { id: 'now', label: 'Publicar ahora', Icon: Zap },
                  { id: 'schedule', label: 'Programar', Icon: CalendarClock },
                ] as const).map(o => (
                  <button key={o.id} type="button" onClick={() => setMode(o.id)}
                    className={cn('h-11 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold transition-all',
                      mode === o.id ? 'bg-accent text-white shadow-lg shadow-accent/25' : 'text-text-secondary hover:text-text-primary')}>
                    <o.Icon className="w-4 h-4" />{o.label}
                  </button>
                ))}
              </div>
            )}

            {!boot.account.connected && (
              <div className="flex items-start gap-2 p-3 rounded-xl border border-warning/40 bg-warning/10 text-sm">
                <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                <span className="text-text-primary">Instagram aún no está conectado. Puedes programar igualmente: se publicará cuando lo conectes.</span>
              </div>
            )}

            {/* Formato */}
            <Section title="Formato">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {FORMATS.map(f => (
                  <button key={f.id} type="button" onClick={() => setFormat(f.id)}
                    className={cn('flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-all',
                      format === f.id ? 'border-accent bg-accent/10 ring-1 ring-accent/30' : 'border-border bg-surface hover:border-text-secondary/40')}>
                    <f.Icon className={cn('w-4 h-4', format === f.id ? 'text-accent-light' : 'text-text-secondary')} />
                    <span className="text-sm font-semibold text-text-primary">{f.label}</span>
                    <span className="text-[11px] text-text-secondary leading-tight">{f.hint}</span>
                  </button>
                ))}
              </div>
            </Section>

            {/* Contenido */}
            <Section title="Contenido" aside={format === 'CAROUSEL' && used.length > 0 ? <span className="text-[11px] text-text-secondary">{used.length}/{CAROUSEL_MAX}</span> : undefined}>
              <input ref={fileInput} type="file" hidden multiple={format === 'CAROUSEL'} accept="image/*,video/*"
                onChange={e => { addLocalFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
              <div
                className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1"
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); addLocalFiles(Array.from(e.dataTransfer.files || [])); }}
              >
                {used.map((d, i) => (
                  <div key={d.key} onClick={() => setActive(i)}
                    className={cn('relative shrink-0 w-24 h-32 rounded-xl overflow-hidden border-2 bg-surface cursor-pointer group',
                      i === active ? 'border-accent' : 'border-transparent')}>
                    {d.kind === 'video' && d.previewUrl?.startsWith('blob:') ? (
                      <video src={d.previewUrl} muted className="w-full h-full object-cover" />
                    ) : (previews[d.key] || d.previewUrl) ? (
                      <img src={previews[d.key] || d.previewUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-text-secondary" /></div>
                    )}
                    {d.kind === 'video' && d.duration ? (
                      <span className="absolute top-1 left-1 text-[10px] font-semibold text-white bg-black/60 rounded px-1">{formatSeconds(d.duration)}</span>
                    ) : null}
                    {(d.stage === 'optimizing' || d.stage === 'uploading' || d.stage === 'loading') && (
                      <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white gap-1 p-1 text-center">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-[10px] font-medium leading-tight">
                          {d.stage === 'optimizing' ? 'Optimizando' : d.stage === 'uploading' ? 'Subiendo' : 'Leyendo'}
                          {d.progress != null && d.stage !== 'loading' ? ` ${Math.round(d.progress * 100)}%` : ''}
                        </span>
                      </div>
                    )}
                    {d.stage === 'error' && (
                      <div className="absolute inset-0 bg-error/70 flex items-center justify-center p-1.5 text-center"><span className="text-[10px] text-white font-medium leading-tight">{d.error}</span></div>
                    )}
                    <button type="button" onClick={e => { e.stopPropagation(); removeDraft(d.key); }}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Quitar">
                      <X className="w-3.5 h-3.5" />
                    </button>
                    {format === 'CAROUSEL' && used.length > 1 && (
                      <div className="absolute bottom-1 inset-x-1 flex justify-between opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                        <button type="button" disabled={i === 0} onClick={e => { e.stopPropagation(); move(i, -1); }} className="w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center disabled:opacity-30" aria-label="Mover a la izquierda"><ChevronLeft className="w-3.5 h-3.5" /></button>
                        <button type="button" disabled={i === used.length - 1} onClick={e => { e.stopPropagation(); move(i, 1); }} className="w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center disabled:opacity-30" aria-label="Mover a la derecha"><ChevronRight className="w-3.5 h-3.5" /></button>
                      </div>
                    )}
                  </div>
                ))}

                {(format === 'CAROUSEL' ? used.length < CAROUSEL_MAX : used.length === 0) && (
                  <div className="shrink-0 flex gap-2">
                    <button type="button" onClick={() => fileInput.current?.click()}
                      className="w-24 h-32 rounded-xl border-2 border-dashed border-border hover:border-accent hover:bg-accent/5 flex flex-col items-center justify-center gap-1.5 text-text-secondary hover:text-accent-light transition-colors">
                      <Upload className="w-5 h-5" /><span className="text-[11px] font-medium">Subir</span>
                    </button>
                    <button type="button" onClick={() => setPicker('media')}
                      className="w-24 h-32 rounded-xl border-2 border-dashed border-border hover:border-accent hover:bg-accent/5 flex flex-col items-center justify-center gap-1.5 text-text-secondary hover:text-accent-light transition-colors">
                      <HardDrive className="w-5 h-5" /><span className="text-[11px] font-medium">Drive</span>
                    </button>
                    {(format === 'REEL' || format === 'STORY') && (
                      <button type="button" onClick={() => setMusicOpen(true)}
                        className="w-24 h-32 rounded-xl border-2 border-dashed border-accent/40 bg-accent/5 hover:border-accent flex flex-col items-center justify-center gap-1.5 text-accent-light transition-colors px-2 text-center">
                        <Music4 className="w-5 h-5" /><span className="text-[11px] font-medium leading-tight">Con mi música</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
              {used.length === 0 && (
                <p className="text-[11px] text-text-secondary">Arrastra aquí tus archivos. Los vídeos 4K o muy pesados se optimizan solos antes de subir.</p>
              )}
              {format === 'POST' && used[0]?.kind === 'video' && (
                <button type="button" onClick={() => setFormat('REEL')} className="text-xs text-warning flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />Los vídeos en el feed van como Reel. Cambiar a Reel</button>
              )}

              {/* Encuadre de las imágenes */}
              {used.some(d => d.kind === 'image' && d.bitmap) && (
                <div className="space-y-2 pt-1">
                  {format !== 'STORY' && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-text-secondary w-20">Proporción</span>
                      {FEED_ASPECTS.map(a => <Pill key={a.id} active={aspect === a.id} onClick={() => setAspect(a.id)}>{a.label}</Pill>)}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-text-secondary w-20">Encaje</span>
                    {FITS.map(f => (
                      <Pill key={f.id} active={effectiveFit === f.id} onClick={() => (format === 'STORY' ? setStoryFit(f.id) : setFit(f.id))}>{f.label}</Pill>
                    ))}
                  </div>
                </div>
              )}
            </Section>

            {/* Texto */}
            {format !== 'STORY' && (
              <Section title="Texto" icon={FileText}
                aside={<span className={cn('text-[11px] font-mono', caption.length > CAPTION_MAX ? 'text-error' : 'text-text-secondary')}>{caption.length}/{CAPTION_MAX} · #{countHashtags(caption)} · @{countMentions(caption)}</span>}>
                <textarea ref={captionRef} value={caption} onChange={e => setCaption(e.target.value)} rows={5}
                  placeholder="Escribe el texto de la publicación…"
                  className="w-full bg-surface border border-border rounded-xl px-3.5 py-3 text-sm leading-relaxed resize-y focus:outline-none focus:border-accent" />
                <div className="flex flex-wrap gap-1.5">
                  {boot.settings.captionTemplates.map(t => (
                    <Pill key={t.id} onClick={() => setCaption(c => (c.trim() ? `${t.text}\n\n${c}` : t.text))}><Sparkles className="w-3 h-3 inline mr-1 -mt-0.5" />{t.name}</Pill>
                  ))}
                  {boot.settings.hashtagSets.map(h => (
                    <Pill key={h.id} onClick={() => insertInCaption(h.tags, true)}><Hash className="w-3 h-3 inline mr-0.5 -mt-0.5" />{h.name}</Pill>
                  ))}
                  {artistHandle && !caption.toLowerCase().includes(`@${artistHandle}`) && (
                    <Pill onClick={() => insertInCaption(`@${artistHandle}`)}><AtSign className="w-3 h-3 inline mr-0.5 -mt-0.5" />{artistHandle}</Pill>
                  )}
                </div>
                {showFirstComment ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-secondary">Primer comentario (se publica justo después)</span>
                      <button type="button" onClick={() => { setShowFirstComment(false); setFirstComment(''); }} className="text-xs text-text-secondary hover:text-error">Quitar</button>
                    </div>
                    <textarea value={firstComment} onChange={e => setFirstComment(e.target.value)} rows={2} placeholder="Por ejemplo, los hashtags o el enlace…"
                      className="w-full bg-surface border border-border rounded-xl px-3.5 py-2.5 text-sm resize-y focus:outline-none focus:border-accent" />
                  </div>
                ) : (
                  <button type="button" onClick={() => setShowFirstComment(true)} className="text-xs text-text-secondary hover:text-accent-light flex items-center gap-1.5"><MessageSquarePlus className="w-3.5 h-3.5" />Añadir primer comentario</button>
                )}
              </Section>
            )}

            {/* Personas */}
            <Section title="Personas" icon={Users}>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <span className="text-xs text-text-secondary">Artista (opcional)</span>
                  <div className="flex gap-2">
                    <div className="flex-1 min-w-0"><ArtistPicker artists={activeArtists} value={artistId} onChange={setArtistId} /></div>
                    {artistId && <button type="button" onClick={() => setArtistId('')} className="h-11 px-3 rounded-xl border border-border text-text-secondary hover:text-error" aria-label="Quitar artista"><X className="w-4 h-4" /></button>}
                  </div>
                  {artist && !artistHandle && (
                    <p className="text-[11px] text-text-secondary">Añade su usuario de Instagram en la ficha del artista para mencionarle con un toque.</p>
                  )}
                  {artistHandle && format !== 'STORY' && !collaborators.includes(artistHandle) && collaborators.length < COLLABORATORS_MAX && (
                    <button type="button" onClick={() => setCollaborators(c => [...c, artistHandle])} className="text-xs text-accent-light flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" />Invitar a @{artistHandle} como colaborador</button>
                  )}
                  {artistHandle && format === 'STORY' && !storyMentions.includes(artistHandle) && (
                    <button type="button" onClick={() => setStoryMentions(m => [...m, artistHandle])} className="text-xs text-accent-light flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" />Mencionar a @{artistHandle}</button>
                  )}
                </div>

                {format === 'STORY' ? (
                  <div className="space-y-1.5">
                    <span className="text-xs text-text-secondary">Menciones en la historia</span>
                    <UsernameInput values={storyMentions} onChange={setStoryMentions} max={USER_TAGS_MAX} placeholder="@usuario y Enter" />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <span className="text-xs text-text-secondary">Colaboradores <span className="opacity-70">· la publicación sale también en su perfil (máx. {COLLABORATORS_MAX})</span></span>
                    <UsernameInput values={collaborators} onChange={setCollaborators} max={COLLABORATORS_MAX} placeholder="@usuario y Enter" />
                  </div>
                )}

                {activeDraft && format !== 'STORY' && (
                  <div className="space-y-1.5">
                    <span className="text-xs text-text-secondary flex items-center gap-1.5"><Tag className="w-3 h-3" />Etiquetas {used.length > 1 ? `en el archivo ${Math.min(active, used.length - 1) + 1}` : ''}</span>
                    {tagPoint && (
                      <div className="flex gap-2">
                        <input autoFocus value={tagText} onChange={e => setTagText(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(tagText, tagPoint); } if (e.key === 'Escape') setTagPoint(null); }}
                          placeholder="¿A quién etiquetas en ese punto?" className="flex-1 h-10 bg-surface border border-accent rounded-xl px-3 text-sm focus:outline-none" />
                        <button type="button" onClick={() => addTag(tagText, tagPoint)} className="h-10 px-3 rounded-xl bg-accent text-white text-sm font-medium">Etiquetar</button>
                      </div>
                    )}
                    <UsernameInput
                      values={activeDraft.userTags.map(t => t.username)}
                      onChange={names => patch(activeDraft.key, {
                        userTags: names.map(n => activeDraft.userTags.find(t => t.username === n) || { username: n, ...(activeDraft.kind === 'image' ? { x: 0.5, y: 0.5 } : {}) }),
                      })}
                      max={USER_TAGS_MAX}
                      placeholder={activeDraft.kind === 'image' ? '@usuario (o toca la imagen)' : '@usuario y Enter'}
                    />
                  </div>
                )}
              </div>
            </Section>

            {/* Opciones del Reel */}
            {format === 'REEL' && (
              <Section title="Reel" icon={Film}>
                <div className="space-y-2">
                  <Toggle checked={shareToFeed} onChange={setShareToFeed} label="Mostrar también en el feed" hint="Si lo quitas, solo aparece en la pestaña de Reels." />
                  <Toggle checked={trial} onChange={setTrial} label="Reel de prueba" hint="Se enseña primero a quien no te sigue y pasa a tu perfil si funciona bien." />
                  <input value={audioName} onChange={e => setAudioName(e.target.value)} placeholder="Nombre del audio (p. ej. EZY – Nombre del beat)" maxLength={80}
                    className="w-full h-10 bg-surface border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-accent" />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-text-secondary">Portada</span>
                    <input ref={coverInput} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) setCover({ file: f, url: objectUrl(f) }); e.target.value = ''; }} />
                    {cover ? (
                      <span className="flex items-center gap-2">
                        <img src={cover.url} alt="" className="w-8 h-12 rounded object-cover border border-border" />
                        <button type="button" onClick={() => setCover(null)} className="text-xs text-text-secondary hover:text-error">Quitar portada</button>
                      </span>
                    ) : (
                      <>
                        <Pill onClick={() => coverInput.current?.click()}>Imagen propia</Pill>
                        {used[0]?.duration ? (
                          <label className="flex items-center gap-2 text-xs text-text-secondary">
                            o fotograma en
                            <input type="range" min={0} max={Math.max(0, (used[0].duration || 0) - 0.1)} step={0.1} value={thumbOffset} onChange={e => setThumbOffset(Number(e.target.value))} className="w-28 accent-[var(--accent)]" />
                            <span className="font-mono text-text-primary">{formatSeconds(thumbOffset)}</span>
                          </label>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              </Section>
            )}

            {/* Texto alternativo */}
            {activeDraft?.kind === 'image' && format !== 'STORY' && (
              <Section title="Texto alternativo" icon={Eye}>
                <input value={activeDraft.altText || ''} onChange={e => patch(activeDraft.key, { altText: e.target.value })} maxLength={1000}
                  placeholder="Describe la imagen para personas con lector de pantalla (opcional)"
                  className="w-full h-10 bg-surface border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-accent" />
              </Section>
            )}

            {/* Más */}
            <div className="space-y-3">
              <button type="button" onClick={() => setShowMore(s => !s)} className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-secondary hover:text-text-primary">
                <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', showMore && 'rotate-180')} />Vincular y organizar
              </button>
              {showMore && (
                <div className="space-y-3 pl-5">
                  <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} placeholder="Nombre en la agenda (opcional)"
                    className="w-full h-10 bg-surface border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-accent" />
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap gap-1.5">
                      {linkedFiles.map(f => (
                        <span key={f.id} className="flex items-center gap-1.5 h-8 pl-2.5 pr-1 rounded-lg bg-surface border border-border text-xs text-text-primary max-w-full">
                          <Link2 className="w-3 h-3 text-text-secondary shrink-0" /><span className="truncate">{f.name}</span>
                          <button type="button" onClick={() => setLinkedFiles(l => l.filter(x => x.id !== f.id))} className="w-6 h-6 rounded flex items-center justify-center hover:text-error" aria-label="Quitar"><X className="w-3 h-3" /></button>
                        </span>
                      ))}
                      <Pill onClick={() => setPicker('link')}><Link2 className="w-3 h-3 inline mr-1 -mt-0.5" />Vincular archivo de Drive</Pill>
                    </div>
                    <p className="text-[11px] text-text-secondary">La pista, el proyecto o el vídeo original del que sale esta publicación.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Cuándo */}
            {mode === 'schedule' && (
              <Section title="Cuándo" icon={CalendarClock}>
                <div className="flex flex-wrap gap-1.5">
                  {quickSlots().map(s => (
                    <Pill key={s.label} active={date === ymd(s.d) && time === hm(s.d)} onClick={() => { setDate(ymd(s.d)); setTime(hm(s.d)); }}>{s.label}</Pill>
                  ))}
                </div>
                <div className="flex gap-2">
                  <div className="flex-1"><DatePicker value={date} onChange={setDate} /></div>
                  <input type="time" value={time} onChange={e => setTime(e.target.value)}
                    className="w-32 h-10 bg-surface border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-accent" />
                </div>
              </Section>
            )}

            {/* Vista previa en móvil */}
            <div className="@3xl:hidden">
              <button type="button" onClick={() => setMobilePreview(v => !v)} className="w-full h-10 rounded-xl border border-border text-sm text-text-secondary flex items-center justify-center gap-2">
                <Eye className="w-4 h-4" />{mobilePreview ? 'Ocultar vista previa' : 'Ver cómo queda'}
              </button>
              {mobilePreview && <div className="pt-4">{preview}</div>}
            </div>

            {/* Pie */}
            <div className="sticky bottom-0 -mx-5 md:-mx-6 px-5 md:px-6 pt-3 pb-1 bg-surface-elevated/95 backdrop-blur border-t border-border/60 space-y-2">
              {problems.length > 0 && used.length > 0 && (
                <p className="text-xs text-warning flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{problems[0]}</p>
              )}
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] text-text-secondary truncate hidden sm:block">
                  {used.length ? `${FORMAT_LABEL[format]} · ${used.length} archivo${used.length > 1 ? 's' : ''}${used[0]?.size ? ` · ${formatFileSize(used.reduce((a, d) => a + (d.size || 0), 0))}` : ''}` : ''}
                </span>
                <div className="flex gap-2 ml-auto">
                  <button type="button" onClick={onClose} disabled={!!submitting} className="h-11 px-4 rounded-xl text-sm text-text-secondary hover:text-text-primary disabled:opacity-40">Cancelar</button>
                  <button type="button" onClick={submit} disabled={problems.length > 0 || !!submitting}
                    className={cn('h-11 px-5 rounded-xl text-sm font-semibold text-white flex items-center gap-2 transition-all disabled:opacity-40',
                      mode === 'now' ? 'bg-gradient-to-r from-[#d62976] to-[#6c5ce7] shadow-lg shadow-[#d62976]/20' : 'bg-accent shadow-lg shadow-accent/25')}>
                    {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />{submitting}</> : busy ? <><Loader2 className="w-4 h-4 animate-spin" />{ctaLabel}</> : <>{mode === 'now' ? <Zap className="w-4 h-4" /> : <CalendarClock className="w-4 h-4" />}{ctaLabel}</>}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <aside className="hidden @3xl:block">
            <div className="sticky top-0">{preview}</div>
          </aside>
        </div></div>
      )}

      {picker === 'media' && (
        <DrivePicker kinds={format === 'REEL' ? ['video'] : format === 'POST' ? ['image'] : ['image', 'video']} multiple={format === 'CAROUSEL'}
          onClose={() => setPicker('')} onPick={addDriveFiles} />
      )}
      {picker === 'link' && (
        <DrivePicker kinds={['audio', 'video', 'image']} title="Vincular archivo" onClose={() => setPicker('')}
          onPick={([f]) => { setPicker(''); if (!linkedFiles.some(x => x.id === f.id)) setLinkedFiles(l => [...l, { id: f.id, name: f.name }]); }} />
      )}
      {musicOpen && <MusicReelBuilder onClose={() => setMusicOpen(false)} onDone={addMusicReel} defaultSubtitle={artist?.name ? `${artist.name} · prod. EZY` : 'prod. EZY'} />}
    </Modal>
  );
}
