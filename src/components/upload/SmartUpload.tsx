'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  UploadCloud, X, Music, Image as ImageIcon, Film, File as FileIcon, Loader2, CheckCircle2, AlertTriangle,
  FolderOpen, ChevronDown, ChevronUp, Plus, Trash2, RotateCcw, Timer, Mail, MessageCircle, Sparkles, Link as LinkIcon,
  Play, FolderInput, User, RefreshCw, Wand2,
} from 'lucide-react';
import { cn, getWhatsAppUrl, formatPhoneNumber } from '@/lib/utils';
import { customPrompt } from '@/lib/dialog';
import { useArtists } from '@/lib/hooks/useArtists';
import { usePersonalProjects } from '@/lib/hooks/usePersonalProjects';
import { useAudioControls } from '@/lib/contexts/AudioContext';
import { detectAudioFeatures, getShortKey } from '@/lib/utils/audio';
import { uploadFileToDrive } from '@/lib/driveUpload';
import { apiCreateFolder, getFolder, insertItems, loadFolder, loadIndex, useStoreVersion } from '@/components/explorer/driveStore';
import { bpmTone, formatBytes, normalizeItem } from '@/components/explorer/fileKinds';
import { FOLDER_MIME } from '@/components/explorer/types';
import { copyText } from '@/components/explorer/explorerUtils';
import { FolderPicker } from './FolderPicker';
import { ArtistPicker, PersonalProjectPicker } from './EntityPickers';
import {
  detectArtist, detectProject, EXPIRATION_OPTIONS, findReplaceCandidate, makeItem, planDestination, projectFoldersOf,
  ROLE_LABEL, suggestBaseName, type Destination, type Plan, type UploadItem, type UploadRole,
} from './smartUploadLogic';
import type { UploadRequest } from '@/lib/contexts/GlobalDragDropContext';

const KIND_ICON = { audio: Music, image: ImageIcon, video: Film, other: FileIcon } as const;
const KIND_COLOR = { audio: 'text-violet-400 bg-violet-500/10', image: 'text-emerald-400 bg-emerald-500/10', video: 'text-rose-400 bg-rose-500/10', other: 'text-text-secondary bg-surface' } as const;
const AUDIO_ROLES: UploadRole[] = ['bounce', 'mix', 'master', 'stem', 'other'];

interface NotifyState {
  email: boolean;
  whatsapp: boolean;
  emailStatus?: 'sending' | 'sent' | 'error';
  emailError?: string;
}

export interface SmartUploadProps {
  request: UploadRequest;
  onClose: () => void;
}

export function SmartUpload({ request, onClose }: SmartUploadProps) {
  const router = useRouter();
  const { artists, updateArtist } = useArtists();
  const { projects: personalProjects, createProject: createPersonalProject, updateProject: updatePersonalProject } = usePersonalProjects();
  const { playTrack } = useAudioControls();
  useStoreVersion(); // re-plan destinations when folder listings arrive

  const [items, setItems] = useState<UploadItem[]>([]);
  const [dest, setDest] = useState<Destination>(() => ({
    targetType: request.targetType || (request.personalProjectId ? 'personal' : 'artist'),
    artistId: request.artistId || '',
    projectId: request.projectId || '',
    personalProjectId: request.personalProjectId || '',
    lockedFolder: request.folderId ? { id: request.folderId, name: request.folderName || 'Carpeta seleccionada' } : null,
  }));
  const [autoDetected, setAutoDetected] = useState<{ artist: boolean; project: boolean }>({ artist: false, project: false });
  const [phase, setPhase] = useState<'configure' | 'upload'>('configure');
  const [minimized, setMinimized] = useState(false);
  const [expire, setExpire] = useState<{ enabled: boolean; ms: number }>({ enabled: false, ms: EXPIRATION_OPTIONS[2].ms });
  const [notify, setNotify] = useState<NotifyState>({ email: false, whatsapp: false });
  const [pickerFor, setPickerFor] = useState<'all' | string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [hovered, setHovered] = useState(false);
  const controllers = useRef(new Map<string, AbortController>());
  const createdFolders = useRef(new Map<string, Promise<string>>());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const finishedRef = useRef(false);
  const analysisStarted = useRef(new Set<string>());

  const artist = artists.find(a => a.id === dest.artistId);
  const personal = personalProjects.find(p => p.id === dest.personalProjectId);
  const projectFolders = dest.targetType === 'artist' && dest.artistId ? projectFoldersOf(dest.artistId) : [];
  const project = projectFolders.find(p => p.id === dest.projectId);
  const rootId = dest.targetType === 'artist' ? dest.artistId : dest.personalProjectId;
  const rootName = dest.targetType === 'artist' ? (artist?.name || 'Artista') : (personal?.title || 'Proyecto');

  // ─── Adding files ───────────────────────────────────────────────────────
  const addFiles = useCallback((files: File[]) => {
    if (files.length === 0) return;
    setItems(prev => {
      const fresh = files.filter(f => !prev.some(p => p.file.name === f.name && p.file.size === f.size && p.file.lastModified === f.lastModified));
      return [...prev, ...fresh.map(f => makeItem(f, dest.targetType))];
    });
  }, [dest.targetType]);

  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    addFiles(request.files);
  }, [addFiles, request.files]);

  // BPM & key analysis for audio files that don't carry them in the name
  useEffect(() => {
    items.filter(i => i.analyzing && !analysisStarted.current.has(i.id)).forEach(item => {
      analysisStarted.current.add(item.id);
      detectAudioFeatures(item.file)
        .then(({ bpm, key }) => {
          setItems(prev => prev.map(p => {
            if (p.id !== item.id) return p;
            const next = { ...p, bpm: p.bpm || bpm, key: p.key || key, analyzing: false };
            return p.nameEdited ? next : { ...next, baseName: suggestBaseName(next, dest.targetType) };
          }));
        })
        .catch(() => setItems(prev => prev.map(p => (p.id === item.id ? { ...p, analyzing: false } : p))));
    });
  }, [items, dest.targetType]);

  // ─── Auto-detection of artist & project ─────────────────────────────────
  useEffect(() => {
    if (dest.targetType !== 'artist' || dest.artistId || request.artistId || artists.length === 0 || items.length === 0) return;
    const detected = detectArtist(items.map(i => i.file), artists);
    if (detected) {
      setDest(d => ({ ...d, artistId: detected }));
      setAutoDetected(a => ({ ...a, artist: true }));
    }
  }, [artists, items, dest.targetType, dest.artistId, request.artistId]);

  // Keep the folder listings needed for routing warm
  useEffect(() => {
    if (dest.targetType === 'artist' && dest.artistId) loadFolder(dest.artistId);
    if (dest.targetType === 'artist' && dest.projectId) loadFolder(dest.projectId);
    if (dest.targetType === 'personal' && dest.personalProjectId) loadFolder(dest.personalProjectId);
    if (dest.lockedFolder) loadFolder(dest.lockedFolder.id);
  }, [dest.targetType, dest.artistId, dest.projectId, dest.personalProjectId, dest.lockedFolder]);

  const artistRootReady = dest.artistId ? getFolder(dest.artistId).status === 'ready' : false;
  const projectDetectionDone = useRef<string>('');
  useEffect(() => {
    if (dest.targetType !== 'artist' || !dest.artistId || dest.projectId || dest.lockedFolder || !artistRootReady) return;
    if (projectDetectionDone.current === dest.artistId) return;
    projectDetectionDone.current = dest.artistId;
    const detected = detectProject(items.map(i => i.file), dest.artistId, artist?.name);
    if (detected) {
      setDest(d => ({ ...d, projectId: detected }));
      setAutoDetected(a => ({ ...a, project: true }));
    }
  }, [dest.targetType, dest.artistId, dest.projectId, dest.lockedFolder, artistRootReady, items]);

  // Resolve the locked folder's real name for display
  useEffect(() => {
    if (!dest.lockedFolder || dest.lockedFolder.name !== 'Carpeta seleccionada') return;
    if (dest.lockedFolder.id === dest.artistId && artist) setDest(d => ({ ...d, lockedFolder: { id: artist.id, name: artist.name } }));
    if (dest.lockedFolder.id === dest.personalProjectId && personal) setDest(d => ({ ...d, lockedFolder: { id: personal.id, name: personal.title } }));
  }, [dest.lockedFolder, dest.artistId, dest.personalProjectId, artist, personal]);

  // Re-suggest names when the target changes
  const changeTarget = (targetType: Destination['targetType']) => {
    setDest(d => ({ ...d, targetType, lockedFolder: null }));
    setItems(prev => prev.map(i => (i.nameEdited ? i : { ...i, baseName: suggestBaseName(i, targetType), folderOverride: null })));
  };

  const updateItem = (id: string, patch: Partial<UploadItem>) => {
    setItems(prev => prev.map(i => {
      if (i.id !== id) return i;
      const next = { ...i, ...patch };
      if (('role' in patch || 'bpm' in patch || 'key' in patch) && !next.nameEdited) {
        next.baseName = suggestBaseName(next, dest.targetType);
      }
      return next;
    }));
  };

  // ─── Plans ──────────────────────────────────────────────────────────────
  const names = { artistName: artist?.name, personalName: personal?.title, projectName: project?.name };
  const plans = new Map<string, Plan>(items.map(i => [i.id, planDestination(i, dest, names)]));
  const pending = items.filter(i => i.status === 'pending');
  const planErrors = pending.map(i => plans.get(i.id)?.error).filter(Boolean) as string[];
  const destinationsCount = new Set(pending.map(i => plans.get(i.id)?.label)).size;
  const totalBytes = pending.reduce((s, i) => s + i.file.size, 0);
  const canUpload = pending.length > 0 && planErrors.length === 0 && pending.every(i => i.baseName.trim());

  // ─── Upload engine ──────────────────────────────────────────────────────
  const ensureFolder = async (plan: Plan): Promise<{ id: string; name: string }> => {
    if (plan.folderId) return { id: plan.folderId, name: plan.label.split(' / ').pop() || plan.label };
    if (!plan.create) throw new Error(plan.error || 'Destino no válido');
    const { name, parentId } = plan.create;
    const key = `${parentId}::${name}`;
    if (!createdFolders.current.has(key)) {
      createdFolders.current.set(key, (async () => {
        await loadFolder(parentId, { force: true });
        const existing = getFolder(parentId).items.find(i => i.isFolder && i.name === name);
        if (existing) return existing.id;
        const id = await apiCreateFolder(name, parentId);
        const now = new Date().toISOString();
        insertItems([normalizeItem({ id, name, mimeType: FOLDER_MIME, createdTime: now, modifiedTime: now, parentFolderId: parentId }, parentId)], rootId);
        return id;
      })());
    }
    return { id: await createdFolders.current.get(key)!, name };
  };

  const uploadOne = async (item: UploadItem, destination: Destination) => {
    const ctrl = new AbortController();
    controllers.current.set(item.id, ctrl);
    setItems(prev => prev.map(p => (p.id === item.id ? { ...p, status: 'uploading', progress: 0, error: undefined } : p)));
    try {
      // Make sure routing sees fresh listings
      if (destination.targetType === 'artist' && destination.artistId) await loadFolder(destination.artistId);
      if (destination.projectId) await loadFolder(destination.projectId);
      if (destination.personalProjectId && destination.targetType === 'personal') await loadFolder(destination.personalProjectId);
      const plan = planDestination(item, destination, names);
      const folder = await ensureFolder(plan);
      await loadFolder(folder.id);
      const replaceCandidate = item.replaceMode === 'replace' ? findReplaceCandidate(item, { ...plan, folderId: folder.id }) : null;

      const name = `${item.baseName.trim()}${item.ext}`;
      const appProperties: Record<string, string> = {};
      if (item.bpm) appProperties.bpm = String(item.bpm);
      if (item.key) appProperties.key = item.key;
      if (expire.enabled) appProperties.expiresAt = String(Date.now() + expire.ms);

      const result = await uploadFileToDrive(item.file, folder.id, {
        name,
        fileId: replaceCandidate?.id,
        appProperties,
        signal: ctrl.signal,
        onProgress: fraction => setItems(prev => prev.map(p => (p.id === item.id ? { ...p, progress: Math.round(fraction * 100) } : p))),
      });

      if (expire.enabled) {
        // Expiring files are meant to be shared: anyone with the link can download them
        fetch(`/api/files/${result.id}/share`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'reader', type: 'anyone' }),
        }).catch(() => {});
      }

      if (destination.targetType === 'personal' && destination.personalProjectId && item.kind === 'audio') {
        updatePersonalProject(destination.personalProjectId, {
          latestBounceFileId: result.id,
          latestBounceName: name,
          ...(item.bpm ? { bpm: item.bpm } : {}),
          ...(item.key ? { key: getShortKey(item.key) } : {}),
        }).catch(() => {});
      }

      if (destination.artistId && destination.targetType === 'artist') {
        try { localStorage.setItem(`accessed_${destination.artistId}`, Date.now().toString()); } catch {}
      }

      insertItems([normalizeItem({
        ...result,
        modifiedTime: new Date().toISOString(),
        createdTime: new Date().toISOString(),
        size: String(item.file.size),
        parentFolderId: folder.id,
        appProperties,
      }, folder.id)], destination.targetType === 'artist' ? destination.artistId : destination.personalProjectId);

      setItems(prev => prev.map(p => (p.id === item.id ? {
        ...p, status: 'done', progress: 100, resultId: result.id, resultFolderId: folder.id, resultFolderName: plan.label, replaced: !!replaceCandidate,
      } : p)));
    } catch (err: any) {
      const cancelled = err?.name === 'AbortError';
      setItems(prev => prev.map(p => (p.id === item.id ? { ...p, status: cancelled ? 'cancelled' : 'error', error: cancelled ? undefined : (err?.message || 'Error desconocido') } : p)));
    } finally {
      controllers.current.delete(item.id);
    }
  };

  const runQueue = async (queue: UploadItem[], destination: Destination) => {
    let cursor = 0;
    const worker = async () => {
      while (cursor < queue.length) {
        const item = queue[cursor++];
        await uploadOne(item, destination);
      }
    };
    await Promise.all([worker(), worker()]);
  };

  const startUpload = async () => {
    if (!canUpload) return;
    finishedRef.current = false;
    setPhase('upload');
    const queue = items.filter(i => i.status === 'pending');
    await runQueue(queue, dest);
  };

  const retry = async (item: UploadItem) => {
    finishedRef.current = false;
    await runQueue([{ ...item, status: 'pending' }], dest);
  };

  const cancelItem = (id: string) => {
    const ctrl = controllers.current.get(id);
    if (ctrl) ctrl.abort();
    else setItems(prev => prev.map(p => (p.id === id && p.status === 'pending' ? { ...p, status: 'cancelled' } : p)));
  };

  // ─── Completion: refresh + notifications ────────────────────────────────
  const inFlight = items.some(i => i.status === 'uploading' || (phase === 'upload' && i.status === 'pending'));
  const done = items.filter(i => i.status === 'done');
  const failed = items.filter(i => i.status === 'error');
  const allFinished = phase === 'upload' && items.length > 0 && !inFlight;

  useEffect(() => {
    if (!allFinished || finishedRef.current) return;
    finishedRef.current = true;
    window.dispatchEvent(new CustomEvent('recentfiles:refresh'));
    if (rootId) loadIndex(rootId, { force: true });
    request.onFinished?.();

    if (done.length > 0 && dest.targetType === 'artist' && artist && notify.email && artist.email) {
      setNotify(n => ({ ...n, emailStatus: 'sending' }));
      const titles = Array.from(new Set(done.map(i => i.baseName.replace(/\s*\[\d{2}-\d{2}-\d{4}\]$/, '')))).join(', ');
      fetch('/api/communications/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artistEmail: artist.email,
          artistName: artist.name,
          projectName: titles || 'Nuevos archivos',
          message: `He subido archivos nuevos a tu portal: ${titles}. Échales un oído cuando puedas.`,
          portalUrl: `${window.location.origin}/portal/${artist.id}`,
        }),
      })
        .then(async res => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo enviar el email');
          setNotify(n => ({ ...n, emailStatus: 'sent' }));
        })
        .catch(err => setNotify(n => ({ ...n, emailStatus: 'error', emailError: err.message })));
    }
  }, [allFinished]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-close a clean upload after a while (never while hovered, with errors or pending WhatsApp)
  useEffect(() => {
    if (!allFinished || hovered || failed.length > 0 || notify.whatsapp || notify.emailStatus === 'error' || notify.emailStatus === 'sending') return;
    const t = setTimeout(onClose, 12000);
    return () => clearTimeout(t);
  }, [allFinished, hovered, failed.length, notify.whatsapp, notify.emailStatus, onClose]);

  // Warn before leaving the page while uploading
  useEffect(() => {
    if (!inFlight) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [inFlight]);

  const close = () => {
    if (inFlight) {
      setMinimized(true);
      toast.info('La subida continúa en segundo plano');
      return;
    }
    controllers.current.forEach(c => c.abort());
    onClose();
  };

  // Escape closes the configuration dialog
  useEffect(() => {
    if (phase !== 'configure') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"][aria-label]:not([data-smart-upload])')) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, onClose]);

  if (typeof document === 'undefined') return null;

  const folderHref = (folderId: string) => {
    if (dest.targetType === 'artist') return `/artists/${dest.artistId}?tab=files${folderId !== dest.artistId ? `&folderId=${folderId}` : ''}`;
    return `/personal-projects/${dest.personalProjectId}?tab=files${folderId !== dest.personalProjectId ? `&folderId=${folderId}` : ''}`;
  };

  const pickerStart = pickerFor === 'all'
    ? dest.lockedFolder?.id
    : pickerFor ? items.find(i => i.id === pickerFor)?.folderOverride?.id : undefined;

  const folderPicker = pickerFor && rootId && (
    <FolderPicker
      isOpen
      onClose={() => setPickerFor(null)}
      rootId={rootId}
      rootName={rootName}
      startFolderId={pickerStart || (dest.projectId || rootId)}
      title={pickerFor === 'all' ? 'Carpeta de destino' : 'Destino de este archivo'}
      description={pickerFor === 'all' ? 'Todos los archivos se subirán a esta carpeta' : undefined}
      confirmLabel={folder => `Subir a "${folder.name}"`}
      onConfirm={(folder, trail) => {
        const label = trail.map(c => c.name).join(' / ');
        const crumb = { id: folder.id, name: label };
        if (pickerFor === 'all') setDest(d => ({ ...d, lockedFolder: crumb }));
        else updateItem(pickerFor, { folderOverride: crumb });
        setPickerFor(null);
      }}
    />
  );

  // ─── Upload / results panel ─────────────────────────────────────────────
  if (phase === 'upload') {
    const active = items.filter(i => i.status !== 'cancelled' || i.progress > 0);
    const totalProgress = active.length ? Math.round(active.reduce((s, i) => s + (i.status === 'done' ? 100 : i.progress), 0) / active.length) : 0;
    const title = allFinished
      ? failed.length ? `${done.length} subidos · ${failed.length} con error` : `${done.length} archivo${done.length === 1 ? '' : 's'} subido${done.length === 1 ? '' : 's'}`
      : `Subiendo ${items.filter(i => i.status === 'uploading').length || ''} de ${active.length}…`.replace('  ', ' ');
    const waText = artist ? `Hola ${artist.name}! He subido archivos nuevos: ${Array.from(new Set(done.map(i => i.baseName))).join(', ')}.\n\nPuedes escucharlos en tu portal:\n${window.location.origin}/portal/${artist.id}` : '';

    return createPortal(
      <div
        className="fixed z-[120] inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom,0px))] md:inset-x-auto md:right-5 md:bottom-5 md:w-[400px]"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        role="status"
      >
        <div className="rounded-2xl border border-border bg-surface-elevated/95 backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden animate-slide-up">
          <div className="flex items-center gap-3 px-4 h-14">
            <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', allFinished ? (failed.length ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success') : 'bg-accent/15 text-accent')}>
              {allFinished ? (failed.length ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />) : <Loader2 className="w-5 h-5 animate-spin" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text-primary truncate">{title}</p>
              <p className="text-[11px] text-text-secondary truncate">{allFinished ? rootName : `${totalProgress}% · ${rootName}`}</p>
            </div>
            <button type="button" onClick={() => setMinimized(m => !m)} className="w-9 h-9 flex items-center justify-center rounded-lg text-text-secondary hover:bg-surface" aria-label={minimized ? 'Expandir' : 'Minimizar'}>
              {minimized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            <button type="button" onClick={close} className="w-9 h-9 flex items-center justify-center rounded-lg text-text-secondary hover:bg-surface" aria-label="Cerrar">
              <X className="w-4 h-4" />
            </button>
          </div>
          {!allFinished && (
            <div className="h-1 bg-surface"><div className="h-full bg-accent transition-all duration-300" style={{ width: `${totalProgress}%` }} /></div>
          )}

          {!minimized && (
            <div className="max-h-[min(55dvh,440px)] overflow-y-auto overscroll-contain border-t border-border/60">
              {items.map(item => {
                const Icon = KIND_ICON[item.kind];
                return (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border/40 last:border-b-0">
                    <span className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', KIND_COLOR[item.kind])}><Icon className="w-4 h-4" /></span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-text-primary truncate" title={`${item.baseName}${item.ext}`}>{item.baseName}{item.ext}</p>
                      {item.status === 'uploading' ? (
                        <div className="mt-1 h-1 rounded-full bg-surface overflow-hidden"><div className="h-full bg-accent transition-all" style={{ width: `${item.progress}%` }} /></div>
                      ) : item.status === 'error' ? (
                        <p className="text-[11px] text-error truncate" title={item.error}>{item.error}</p>
                      ) : item.status === 'done' ? (
                        <p className="text-[11px] text-text-secondary truncate">{item.replaced ? 'Versión reemplazada · ' : ''}{item.resultFolderName}</p>
                      ) : (
                        <p className="text-[11px] text-text-secondary">{item.status === 'cancelled' ? 'Cancelado' : 'En cola'}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {item.status === 'uploading' && <span className="text-[11px] font-mono text-accent w-9 text-right">{item.progress}%</span>}
                      {(item.status === 'uploading' || item.status === 'pending') && (
                        <button type="button" onClick={() => cancelItem(item.id)} className="w-8 h-8 flex items-center justify-center rounded-lg text-text-secondary hover:text-error hover:bg-error/10" aria-label="Cancelar"><X className="w-4 h-4" /></button>
                      )}
                      {item.status === 'error' && (
                        <button type="button" onClick={() => retry(item)} className="w-8 h-8 flex items-center justify-center rounded-lg text-text-secondary hover:text-accent hover:bg-surface" aria-label="Reintentar" title="Reintentar"><RefreshCw className="w-4 h-4" /></button>
                      )}
                      {item.status === 'done' && item.resultId && (
                        <>
                          {item.kind === 'audio' && (
                            <button type="button" onClick={() => playTrack({ id: item.resultId!, name: item.baseName, url: `/api/audio/${item.resultId}`, bpm: item.bpm, musicalKey: item.key })} className="w-8 h-8 flex items-center justify-center rounded-lg text-text-secondary hover:text-accent hover:bg-surface" aria-label="Reproducir" title="Reproducir"><Play className="w-4 h-4" /></button>
                          )}
                          <button
                            type="button"
                            onClick={() => copyText(expire.enabled ? `${window.location.origin}/api/files/${item.resultId}?download=true` : `https://drive.google.com/file/d/${item.resultId}/view`, expire.enabled ? 'Enlace de descarga copiado' : 'Enlace copiado')}
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-text-secondary hover:text-accent hover:bg-surface"
                            aria-label="Copiar enlace"
                            title={expire.enabled ? 'Copiar enlace de descarga' : 'Copiar enlace'}
                          ><LinkIcon className="w-4 h-4" /></button>
                          <button type="button" onClick={() => { router.push(folderHref(item.resultFolderId!)); onClose(); }} className="w-8 h-8 flex items-center justify-center rounded-lg text-text-secondary hover:text-accent hover:bg-surface" aria-label="Abrir carpeta" title="Abrir carpeta"><FolderOpen className="w-4 h-4" /></button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

              {allFinished && done.length > 0 && dest.targetType === 'artist' && artist && (notify.email || notify.whatsapp) && (
                <div className="px-4 py-3 space-y-2 bg-surface/40">
                  {notify.email && (
                    <div className={cn('flex items-center gap-2 text-xs rounded-lg px-3 py-2 border',
                      notify.emailStatus === 'sent' ? 'text-success border-success/25 bg-success/10'
                        : notify.emailStatus === 'error' ? 'text-error border-error/25 bg-error/10'
                          : 'text-accent border-accent/25 bg-accent/10')}>
                      {notify.emailStatus === 'sending' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : notify.emailStatus === 'sent' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Mail className="w-3.5 h-3.5" />}
                      <span className="flex-1 min-w-0 truncate">
                        {notify.emailStatus === 'sent' ? `Email enviado a ${artist.email}` : notify.emailStatus === 'error' ? (notify.emailError || 'No se pudo enviar el email') : `Enviando email a ${artist.email}…`}
                      </span>
                    </div>
                  )}
                  {notify.whatsapp && artist.phone && (
                    <a
                      href={getWhatsAppUrl(artist.phone, waText)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setNotify(n => ({ ...n, whatsapp: false }))}
                      className="flex items-center justify-center gap-2 h-10 rounded-xl bg-[#25D366] hover:brightness-95 text-white text-sm font-semibold"
                    >
                      <MessageCircle className="w-4 h-4" /> Avisar por WhatsApp
                    </a>
                  )}
                </div>
              )}

              {allFinished && (
                <div className="flex gap-2 px-4 py-3 border-t border-border/60">
                  {failed.length > 0 && (
                    <button type="button" onClick={() => failed.forEach(retry)} className="flex-1 h-9 rounded-xl border border-border text-xs font-semibold hover:bg-surface inline-flex items-center justify-center gap-1.5">
                      <RotateCcw className="w-3.5 h-3.5" /> Reintentar fallidos
                    </button>
                  )}
                  {done[0]?.resultFolderId && (
                    <button type="button" onClick={() => { router.push(folderHref(done[0].resultFolderId!)); onClose(); }} className="flex-1 h-9 rounded-xl bg-accent text-white text-xs font-semibold hover:bg-accent/90 inline-flex items-center justify-center gap-1.5">
                      <FolderOpen className="w-3.5 h-3.5" /> Ver archivos
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>,
      document.body,
    );
  }

  // ─── Configuration dialog ───────────────────────────────────────────────
  const onDialogDrop = (e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center md:p-6" role="dialog" aria-modal="true" data-smart-upload aria-label="Subida inteligente">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
        <div
          onDragOver={e => { if (Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); } }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false); }}
          onDrop={onDialogDrop}
          className={cn(
            'relative w-full md:max-w-3xl h-[calc(100dvh-env(safe-area-inset-top,0px)-0.5rem)] md:h-auto md:max-h-[88dvh] flex flex-col bg-surface-elevated border-t md:border border-border rounded-t-[28px] md:rounded-2xl shadow-2xl animate-slide-up md:animate-scale-in overflow-hidden',
            isDragOver && 'ring-2 ring-accent',
          )}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 md:px-6 py-4 border-b border-border/60 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-accent/15 text-accent flex items-center justify-center shrink-0">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-text-primary">Subida inteligente</h2>
              <p className="text-xs text-text-secondary truncate">
                {pending.length === 0 ? 'Añade archivos para empezar' : `${pending.length} archivo${pending.length === 1 ? '' : 's'} · ${formatBytes(totalBytes)}`}
              </p>
            </div>
            <button type="button" onClick={() => fileInputRef.current?.click()} className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-border text-xs font-semibold hover:bg-surface">
              <Plus className="w-4 h-4" /> Añadir
            </button>
            <button type="button" onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl text-text-secondary hover:bg-surface" aria-label="Cerrar">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 md:px-6 py-4 space-y-5">
            {/* Destination */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Destino</h3>
                <div className="flex p-0.5 rounded-xl bg-surface border border-border/70">
                  {(['artist', 'personal'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => changeTarget(t)}
                      className={cn('h-8 px-3 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5', dest.targetType === t ? 'bg-surface-elevated text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary')}
                    >
                      {t === 'artist' ? <User className="w-3.5 h-3.5" /> : <Music className="w-3.5 h-3.5" />}
                      {t === 'artist' ? 'Artista' : 'Proyecto personal'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {dest.targetType === 'artist' ? (
                  <>
                    <div className="space-y-1.5 min-w-0">
                      <label className="text-xs font-medium text-text-secondary flex items-center gap-1.5">
                        Artista {autoDetected.artist && dest.artistId && <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-accent"><Wand2 className="w-3 h-3" /> detectado</span>}
                      </label>
                      <ArtistPicker
                        artists={artists}
                        value={dest.artistId}
                        highlight
                        onChange={id => {
                          projectDetectionDone.current = '';
                          setAutoDetected({ artist: false, project: false });
                          setDest(d => ({ ...d, artistId: id, projectId: '', lockedFolder: null }));
                          setItems(prev => prev.map(i => ({ ...i, folderOverride: null })));
                        }}
                      />
                    </div>
                    <div className="space-y-1.5 min-w-0">
                      <label className="text-xs font-medium text-text-secondary flex items-center gap-1.5">
                        Proyecto {autoDetected.project && dest.projectId && <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-accent"><Wand2 className="w-3 h-3" /> detectado</span>}
                      </label>
                      <div className="relative">
                        <select
                          value={dest.lockedFolder ? '__locked__' : dest.projectId}
                          disabled={!dest.artistId}
                          onChange={async e => {
                            const value = e.target.value;
                            if (value === '__pick__') {
                              setPickerFor('all');
                              return;
                            }
                            if (value === '__new__') {
                              const title = (await customPrompt('Nombre del nuevo proyecto', '', 'Nuevo proyecto'))?.trim();
                              if (!title) return;
                              const t = toast.loading('Creando proyecto…');
                              try {
                                const res = await fetch('/api/projects', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ artistId: dest.artistId, title, type: 'single' }),
                                });
                                const data = await res.json();
                                if (!res.ok) throw new Error(data.error || 'Error');
                                const now = new Date().toISOString();
                                insertItems([normalizeItem({ id: data.project.id, name: title, mimeType: FOLDER_MIME, createdTime: now, modifiedTime: now, parentFolderId: dest.artistId }, dest.artistId)], dest.artistId);
                                setDest(d => ({ ...d, projectId: data.project.id, lockedFolder: null }));
                                toast.success(`Proyecto "${title}" creado`, { id: t });
                              } catch (err: any) {
                                toast.error(`No se pudo crear el proyecto: ${err.message}`, { id: t });
                              }
                              return;
                            }
                            setAutoDetected(a => ({ ...a, project: false }));
                            setDest(d => ({ ...d, projectId: value === '__locked__' ? d.projectId : value, lockedFolder: value === '__locked__' ? d.lockedFolder : null }));
                          }}
                          className="w-full h-11 appearance-none bg-surface border border-border rounded-xl pl-3 pr-9 text-sm text-text-primary focus:outline-none focus:border-accent disabled:opacity-50"
                        >
                          {dest.lockedFolder && <option value="__locked__">📁 {dest.lockedFolder.name}</option>}
                          <option value="">✨ Automático (bounces → Bounces)</option>
                          {projectFolders.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          <option value="__new__">＋ Crear proyecto nuevo…</option>
                          <option value="__pick__">📂 Elegir carpeta exacta…</option>
                        </select>
                        <ChevronDown className="w-4 h-4 text-text-secondary absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-1.5 min-w-0">
                      <label className="text-xs font-medium text-text-secondary">Proyecto personal</label>
                      <PersonalProjectPicker
                        projects={personalProjects}
                        value={dest.personalProjectId}
                        highlight
                        onChange={id => {
                          setDest(d => ({ ...d, personalProjectId: id, lockedFolder: null }));
                          setItems(prev => prev.map(i => ({ ...i, folderOverride: null })));
                        }}
                        onCreate={async ({ title, category }) => {
                          const first = items.find(i => i.kind === 'audio');
                          const now = new Date();
                          const created = await createPersonalProject({
                            title,
                            category,
                            year: now.getFullYear(),
                            month: now.getMonth() + 1,
                            bpm: first?.bpm || undefined,
                            key: first?.key ? getShortKey(first.key) : undefined,
                            status: 'idea',
                          });
                          toast.success(`Proyecto "${title}" creado`);
                          return created;
                        }}
                      />
                    </div>
                    <div className="space-y-1.5 min-w-0">
                      <label className="text-xs font-medium text-text-secondary">Carpeta</label>
                      <button
                        type="button"
                        disabled={!dest.personalProjectId}
                        onClick={() => (dest.lockedFolder ? setDest(d => ({ ...d, lockedFolder: null })) : setPickerFor('all'))}
                        className="w-full h-11 flex items-center gap-2 px-3 rounded-xl border border-border bg-surface hover:border-accent/50 text-left disabled:opacity-50"
                      >
                        <FolderInput className="w-4 h-4 text-text-secondary shrink-0" />
                        <span className="flex-1 truncate text-sm text-text-primary">{dest.lockedFolder ? dest.lockedFolder.name : 'Automática según el tipo'}</span>
                        <span className="text-[11px] font-semibold text-accent shrink-0">{dest.lockedFolder ? 'Quitar' : 'Elegir'}</span>
                      </button>
                    </div>
                  </>
                )}
              </div>

              {dest.lockedFolder && dest.targetType === 'artist' && (
                <div className="flex items-center gap-2 text-xs rounded-xl bg-accent/10 border border-accent/20 px-3 py-2">
                  <FolderOpen className="w-4 h-4 text-accent shrink-0" />
                  <span className="flex-1 min-w-0 truncate text-text-primary">Todo se subirá a <b>{dest.lockedFolder.name}</b></span>
                  <button type="button" onClick={() => setPickerFor('all')} className="font-semibold text-accent shrink-0">Cambiar</button>
                  <button type="button" onClick={() => setDest(d => ({ ...d, lockedFolder: null }))} className="font-semibold text-text-secondary hover:text-text-primary shrink-0">Automático</button>
                </div>
              )}
            </section>

            {/* Files */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Archivos</h3>
                {pending.length > 1 && pending.some(i => i.kind === 'audio') && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-text-secondary hidden sm:inline">Todos como</span>
                    <select
                      value=""
                      onChange={e => {
                        const role = e.target.value as UploadRole;
                        if (!role) return;
                        setItems(prev => prev.map(i => (i.kind === 'audio' && i.status === 'pending' ? { ...i, role, baseName: i.nameEdited ? i.baseName : suggestBaseName({ ...i, role }, dest.targetType) } : i)));
                      }}
                      className="h-8 bg-surface border border-border rounded-lg px-2 text-xs text-text-primary focus:outline-none focus:border-accent"
                    >
                      <option value="">Tipo…</option>
                      {AUDIO_ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {pending.length === 0 ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full rounded-2xl border-2 border-dashed border-border hover:border-accent/60 bg-surface/40 py-12 flex flex-col items-center gap-2 text-center transition-colors"
                >
                  <UploadCloud className="w-8 h-8 text-accent" />
                  <span className="text-sm font-semibold text-text-primary">Arrastra archivos aquí o toca para elegirlos</span>
                  <span className="text-xs text-text-secondary">Audios, imágenes, vídeos, proyectos… sin límite de tamaño</span>
                </button>
              ) : (
                <div className="rounded-2xl border border-border/70 divide-y divide-border/50 overflow-hidden">
                  {pending.map(item => {
                    const Icon = KIND_ICON[item.kind];
                    const plan = plans.get(item.id)!;
                    const replace = findReplaceCandidate(item, plan);
                    const expanded = expandedId === item.id;
                    return (
                      <div key={item.id} className="bg-surface/30">
                        <div className="flex items-center gap-3 px-3 py-2.5">
                          <span className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', KIND_COLOR[item.kind])}><Icon className="w-4 h-4" /></span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center min-w-0 rounded-lg border border-transparent focus-within:border-accent focus-within:bg-background hover:border-border px-1.5 -mx-1.5">
                              <input
                                value={item.baseName}
                                onChange={e => updateItem(item.id, { baseName: e.target.value, nameEdited: true })}
                                className="flex-1 min-w-0 bg-transparent py-1 text-sm font-medium text-text-primary focus:outline-none"
                                aria-label="Nombre final"
                              />
                              <span className="text-xs text-text-secondary shrink-0">{item.ext}</span>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5 text-[11px] text-text-secondary">
                              <span>{formatBytes(item.file.size)}</span>
                              {item.kind === 'audio' && (item.analyzing
                                ? <span className="inline-flex items-center gap-1 text-accent"><Loader2 className="w-3 h-3 animate-spin" /> analizando</span>
                                : <>
                                    {item.bpm && <span className={cn('font-mono font-bold px-1.5 rounded border', bpmTone(item.bpm))}>{item.bpm} BPM</span>}
                                    {item.key && <span className="font-mono font-bold px-1.5 rounded border text-violet-400 bg-violet-500/10 border-violet-500/20">{getShortKey(item.key)}</span>}
                                  </>)}
                              <span className="text-text-secondary/50">→</span>
                              {plan.error
                                ? <span className="text-warning font-medium">{plan.error}</span>
                                : <button type="button" onClick={() => rootId && setPickerFor(item.id)} className="truncate max-w-[240px] hover:text-accent" title="Cambiar destino de este archivo">
                                    {plan.label}{plan.create ? ' (se creará)' : ''}{item.folderOverride ? ' ✎' : ''}
                                  </button>}
                            </div>
                          </div>
                          {item.kind === 'audio' && (
                            <div className="relative hidden sm:block">
                              <select
                                value={item.role}
                                onChange={e => updateItem(item.id, { role: e.target.value as UploadRole })}
                                className="h-9 appearance-none bg-surface border border-border rounded-lg pl-2.5 pr-7 text-xs font-semibold text-text-primary focus:outline-none focus:border-accent"
                              >
                                {AUDIO_ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                              </select>
                              <ChevronDown className="w-3.5 h-3.5 text-text-secondary absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                          )}
                          <button type="button" onClick={() => setExpandedId(expanded ? null : item.id)} className="w-9 h-9 flex items-center justify-center rounded-lg text-text-secondary hover:bg-surface shrink-0" aria-label="Más opciones">
                            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                          <button type="button" onClick={() => setItems(prev => prev.filter(i => i.id !== item.id))} className="w-9 h-9 flex items-center justify-center rounded-lg text-text-secondary hover:text-error hover:bg-error/10 shrink-0" aria-label="Quitar archivo">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {replace && (
                          <div className="mx-3 mb-2.5 flex items-center gap-2 rounded-lg bg-warning/10 border border-warning/25 px-2.5 py-1.5 text-[11px]">
                            <RotateCcw className="w-3.5 h-3.5 text-warning shrink-0" />
                            <span className="flex-1 min-w-0 truncate text-text-primary">Ya existe «{replace.name}»</span>
                            <div className="flex rounded-md bg-surface p-0.5 shrink-0">
                              {(['replace', 'new'] as const).map(m => (
                                <button key={m} type="button" onClick={() => updateItem(item.id, { replaceMode: m })} className={cn('px-2 h-6 rounded text-[11px] font-semibold', item.replaceMode === m ? 'bg-surface-elevated text-text-primary shadow-sm' : 'text-text-secondary')}>
                                  {m === 'replace' ? 'Reemplazar' : 'Nueva copia'}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {expanded && (
                          <div className="px-3 pb-3 grid grid-cols-2 sm:grid-cols-4 gap-2 animate-fade-in">
                            {item.kind === 'audio' && (
                              <label className="col-span-2 sm:hidden space-y-1">
                                <span className="text-[11px] font-medium text-text-secondary">Tipo</span>
                                <select value={item.role} onChange={e => updateItem(item.id, { role: e.target.value as UploadRole })} className="w-full h-10 bg-surface border border-border rounded-lg px-2 text-sm">
                                  {AUDIO_ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                                </select>
                              </label>
                            )}
                            {item.kind === 'audio' && (
                              <>
                                <label className="space-y-1">
                                  <span className="text-[11px] font-medium text-text-secondary">BPM</span>
                                  <input type="number" inputMode="numeric" value={item.bpm ?? ''} placeholder="—" onChange={e => updateItem(item.id, { bpm: e.target.value ? parseInt(e.target.value, 10) : null })} className="w-full h-10 bg-surface border border-border rounded-lg px-2.5 text-sm font-mono focus:outline-none focus:border-accent" />
                                </label>
                                <label className="space-y-1">
                                  <span className="text-[11px] font-medium text-text-secondary">Tonalidad</span>
                                  <input value={item.key ? getShortKey(item.key) : ''} placeholder="—" onChange={e => updateItem(item.id, { key: e.target.value.trim() || null })} className="w-full h-10 bg-surface border border-border rounded-lg px-2.5 text-sm font-mono focus:outline-none focus:border-accent" />
                                </label>
                              </>
                            )}
                            <div className="col-span-2 space-y-1">
                              <span className="text-[11px] font-medium text-text-secondary">Destino de este archivo</span>
                              <div className="flex gap-2">
                                <button type="button" disabled={!rootId} onClick={() => setPickerFor(item.id)} className="flex-1 h-10 rounded-lg border border-border bg-surface px-2.5 text-xs font-semibold text-left truncate hover:border-accent/50 disabled:opacity-50">
                                  {item.folderOverride ? item.folderOverride.name : 'Elegir carpeta…'}
                                </button>
                                {item.folderOverride && (
                                  <button type="button" onClick={() => updateItem(item.id, { folderOverride: null })} className="h-10 px-3 rounded-lg border border-border text-xs font-semibold hover:bg-surface">Auto</button>
                                )}
                              </div>
                            </div>
                            {!item.nameEdited ? null : (
                              <button type="button" onClick={() => updateItem(item.id, { nameEdited: false, baseName: suggestBaseName(item, dest.targetType) })} className="col-span-2 sm:col-span-4 h-9 rounded-lg text-xs font-semibold text-accent hover:bg-accent/10 inline-flex items-center justify-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5" /> Restaurar nombre sugerido
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full h-11 flex items-center justify-center gap-2 text-xs font-semibold text-text-secondary hover:text-accent hover:bg-surface/60">
                    <Plus className="w-4 h-4" /> Añadir más archivos
                  </button>
                </div>
              )}
            </section>

            {/* Options */}
            {pending.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Opciones</h3>
                <div className="rounded-2xl border border-border/70 divide-y divide-border/50">
                  {dest.targetType === 'artist' && artist && (
                    <div className="px-4 py-3 space-y-2.5">
                      <p className="text-sm font-medium text-text-primary">Avisar a {artist.name}</p>
                      <div className="flex flex-wrap gap-2">
                        <ToggleChip
                          active={notify.email}
                          icon={Mail}
                          label={artist.email ? 'Email' : 'Email (añadir)'}
                          onClick={async () => {
                            if (!artist.email) {
                              const email = (await customPrompt(`Email de ${artist.name}`, '', 'Añadir email'))?.trim();
                              if (!email) return;
                              if (!/^\S+@\S+\.\S+$/.test(email)) { toast.error('Email no válido'); return; }
                              const res = await updateArtist(artist.id, { email });
                              if (!res.success) { toast.error('No se pudo guardar el email'); return; }
                              setNotify(n => ({ ...n, email: true }));
                              return;
                            }
                            setNotify(n => ({ ...n, email: !n.email }));
                          }}
                        />
                        <ToggleChip
                          active={notify.whatsapp}
                          icon={MessageCircle}
                          label={artist.phone ? 'WhatsApp' : 'WhatsApp (añadir)'}
                          onClick={async () => {
                            if (!artist.phone) {
                              const phone = (await customPrompt(`Teléfono de ${artist.name}`, '+34 ', 'Añadir teléfono'))?.trim();
                              if (!phone || phone.replace(/\D/g, '').length < 8) return;
                              const res = await updateArtist(artist.id, { phone: formatPhoneNumber(phone) });
                              if (!res.success) { toast.error('No se pudo guardar el teléfono'); return; }
                              setNotify(n => ({ ...n, whatsapp: true }));
                              return;
                            }
                            setNotify(n => ({ ...n, whatsapp: !n.whatsapp }));
                          }}
                        />
                      </div>
                    </div>
                  )}
                  <div className="px-4 py-3 space-y-2.5">
                    <button type="button" onClick={() => setExpire(x => ({ ...x, enabled: !x.enabled }))} className="w-full flex items-center gap-3 text-left">
                      <Timer className={cn('w-4 h-4 shrink-0', expire.enabled ? 'text-warning' : 'text-text-secondary')} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-text-primary">Autodestrucción</span>
                        <span className="block text-[11px] text-text-secondary">Se borra solo al caducar y queda con enlace público de descarga</span>
                      </span>
                      <span className={cn('w-10 h-6 rounded-full p-0.5 transition-colors shrink-0', expire.enabled ? 'bg-accent' : 'bg-surface border border-border')}>
                        <span className={cn('block w-5 h-5 rounded-full bg-white shadow transition-transform', expire.enabled && 'translate-x-4')} />
                      </span>
                    </button>
                    {expire.enabled && (
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 animate-fade-in">
                        {EXPIRATION_OPTIONS.map(opt => (
                          <button key={opt.ms} type="button" onClick={() => setExpire({ enabled: true, ms: opt.ms })} className={cn('h-9 rounded-lg text-xs font-semibold border', expire.ms === opt.ms ? 'bg-accent text-white border-accent' : 'border-border text-text-secondary hover:bg-surface')}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-3 px-4 md:px-6 py-3 border-t border-border/60 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <p className="flex-1 min-w-0 text-xs text-text-secondary truncate">
              {planErrors.length > 0
                ? <span className="text-warning font-medium">{planErrors[0]}</span>
                : pending.length > 0 ? `${pending.length} archivo${pending.length === 1 ? '' : 's'} → ${destinationsCount === 1 ? plans.get(pending[0].id)?.label : `${destinationsCount} carpetas`}` : ''}
            </p>
            <button type="button" onClick={onClose} className="hidden sm:inline-flex h-10 px-4 rounded-xl border border-border text-sm font-medium hover:bg-surface items-center">Cancelar</button>
            <button
              type="button"
              onClick={startUpload}
              disabled={!canUpload}
              className="h-11 sm:h-10 px-5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent/90 disabled:opacity-40 disabled:pointer-events-none inline-flex items-center gap-2 shrink-0"
            >
              <UploadCloud className="w-4 h-4" /> Subir{pending.length ? ` ${pending.length}` : ''}
            </button>
          </div>

          {isDragOver && (
            <div className="pointer-events-none absolute inset-0 bg-accent/10 border-2 border-dashed border-accent rounded-[inherit] flex items-center justify-center">
              <span className="px-4 py-2 rounded-full bg-accent text-white text-sm font-semibold shadow-lg">Suelta para añadir</span>
            </div>
          )}
        </div>
      </div>
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => { addFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
      {folderPicker}
    </>,
    document.body,
  );
}

function ToggleChip({ active, icon: Icon, label, onClick }: { active: boolean; icon: React.ElementType; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('h-9 px-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors', active ? 'bg-accent/15 border-accent/50 text-accent' : 'border-border text-text-secondary hover:bg-surface')}
      aria-pressed={active}
    >
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );
}
