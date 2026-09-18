'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  UploadCloud, X, Music, Image as ImageIcon, Film, File as FileIcon, Loader2, CheckCircle2, AlertTriangle,
  FolderOpen, ChevronDown, ChevronUp, Plus, Trash2, RotateCcw, Timer, Mail, MessageCircle, Link as LinkIcon,
  Play, FolderInput, User, RefreshCw, Wand2, Check, FolderUp, MoreVertical, ListChecks,
} from 'lucide-react';
import { cn, getWhatsAppUrl, formatPhoneNumber } from '@/lib/utils';
import { customPrompt } from '@/lib/dialog';
import { useArtists } from '@/lib/hooks/useArtists';
import { getLibraryState, useLibrary } from '@/components/library/libraryStore';
import { useAudioControls } from '@/lib/contexts/AudioContext';
import { useContextMenu, type MenuItem } from '@/lib/contexts/ContextMenuContext';
import { detectAudioFeatures, getShortKey } from '@/lib/utils/audio';
import { uploadFileToDrive } from '@/lib/driveUpload';
import { apiCreateFolder, findItem, getFolder, insertItems, loadFolder, loadIndex, useStoreVersion } from '@/components/explorer/driveStore';
import { bpmTone, formatBytes, normalizeItem } from '@/components/explorer/fileKinds';
import { FOLDER_MIME } from '@/components/explorer/types';
import { copyText } from '@/components/explorer/explorerUtils';
import { FolderPicker } from './FolderPicker';
import { ArtistPicker } from './EntityPickers';
import { extractDroppedFiles, fileKey, filesFromInput } from './fileIntake';
import {
  detectArtist, detectProject, detectProjectForFile, effectiveDest, EXPIRATION_OPTIONS, findReplaceCandidate, makeItem,
  planDestination, projectFoldersOf, ROLE_LABEL, suggestBaseName,
  type Destination, type DestinationNames, type Plan, type UploadItem, type UploadRole,
} from './smartUploadLogic';
import type { UploadBatch, UploadSession } from '@/lib/contexts/GlobalDragDropContext';

const KIND_ICON = { audio: Music, image: ImageIcon, video: Film, other: FileIcon } as const;
const KIND_COLOR = {
  audio: 'text-violet-400 bg-violet-500/10',
  image: 'text-emerald-400 bg-emerald-500/10',
  video: 'text-rose-400 bg-rose-500/10',
  other: 'text-text-secondary bg-surface',
} as const;
const AUDIO_ROLES: UploadRole[] = ['bounce', 'mix', 'master', 'stem', 'other'];
const UPLOAD_CONCURRENCY = 3;
const ANALYSIS_CONCURRENCY = 2;

interface NotifyState {
  email: boolean;
  whatsapp: boolean;
  emailStatus?: 'sending' | 'sent' | 'error';
  emailError?: string;
}

const emptyDestination = (targetType: Destination['targetType'] = 'artist'): Destination => ({
  targetType,
  artistId: '',
  projectId: '',
  lockedFolder: null,
});

/** Root folder a destination lives in (artist folder or the beat library). */
const rootOf = (d: Destination) => (d.targetType === 'artist' ? d.artistId : getLibraryState().rootId);

function destFromBatch(batch: UploadBatch, fallback: Destination['targetType']): Destination | null {
  const hasTarget = !!(batch.artistId || batch.folderId || batch.projectId || batch.targetType === 'library');
  if (!hasTarget) return null;
  return {
    targetType: batch.targetType || fallback,
    artistId: batch.artistId || '',
    projectId: batch.projectId || '',
    lockedFolder: batch.folderId ? { id: batch.folderId, name: batch.folderName || 'Carpeta seleccionada' } : null,
  };
}

const sameDestination = (a: Destination, b: Destination) =>
  a.targetType === b.targetType && a.artistId === b.artistId && a.projectId === b.projectId
  && (a.lockedFolder?.id || '') === (b.lockedFolder?.id || '');

export interface SmartUploadProps {
  session: UploadSession;
  onClose: () => void;
}

export function SmartUpload({ session, onClose }: SmartUploadProps) {
  const router = useRouter();
  const { artists, updateArtist } = useArtists();
  const library = useLibrary();
  const { playTrack } = useAudioControls();
  const { showMenu } = useContextMenu();
  const storeVersion = useStoreVersion(); // re-plan destinations when folder listings arrive

  const firstBatch = session.batches[0];
  const [items, setItems] = useState<UploadItem[]>([]);
  const [shared, setShared] = useState<Destination>(() => destFromBatch(firstBatch, 'artist') || emptyDestination(firstBatch?.targetType || 'artist'));
  const [autoDetected, setAutoDetected] = useState({ artist: false, project: false });
  const [phase, setPhase] = useState<'configure' | 'upload'>('configure');
  const [minimized, setMinimized] = useState(false);
  const [expire, setExpire] = useState({ enabled: false, ms: EXPIRATION_OPTIONS[2].ms });
  const [notify, setNotify] = useState<NotifyState>({ email: false, whatsapp: false });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [folderPickerFor, setFolderPickerFor] = useState<{ ids: string[] | 'shared'; rootId: string; rootName: string } | null>(null);
  const [destEditorFor, setDestEditorFor] = useState<string[] | null>(null);

  const controllers = useRef(new Map<string, AbortController>());
  const createdFolders = useRef(new Map<string, Promise<string>>());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const consumedBatches = useRef<Set<number>>(new Set());
  const analysisStarted = useRef(new Set<string>());
  const analysisRunning = useRef(0);
  const startedUploads = useRef(new Set<string>());
  const runningUploads = useRef(0);
  const finishedRef = useRef(false);
  const itemsRef = useRef<UploadItem[]>([]);
  itemsRef.current = items;
  const sharedRef = useRef(shared);
  sharedRef.current = shared;
  const expireRef = useRef(expire);
  expireRef.current = expire;

  const artist = artists.find(a => a.id === shared.artistId);
  const projectFolders = shared.targetType === 'artist' && shared.artistId ? projectFoldersOf(shared.artistId) : [];
  const sharedRoot = shared.targetType === 'artist' ? shared.artistId : library.rootId;

  const namesFor = useCallback((d: Destination): DestinationNames => ({
    artistName: artists.find(a => a.id === d.artistId)?.name,
    projectName: d.projectId ? getFolder(d.artistId).items.find(i => i.id === d.projectId)?.name : undefined,
    libraryRootId: library.rootId,
    libraryName: library.rootName,
  }), [artists, library.rootId, library.rootName]);


  // ─── Queueing files ─────────────────────────────────────────────────────
  const addFiles = useCallback((files: File[], dest: Destination | null = null) => {
    if (files.length === 0) return 0;
    let added = 0;
    setItems(prev => {
      const known = new Set(prev.map(p => fileKey(p.file)));
      const fresh = files.filter(f => !known.has(fileKey(f)));
      added = fresh.length;
      if (fresh.length === 0) return prev;
      const targetType = dest?.targetType || sharedRef.current.targetType;
      return [...prev, ...fresh.map(f => makeItem(f, targetType, dest))];
    });
    return added;
  }, []);

  // Every drop adds a batch to the same session instead of opening another dialog
  useEffect(() => {
    for (const batch of session.batches) {
      if (consumedBatches.current.has(batch.id)) continue;
      consumedBatches.current.add(batch.id);
      const batchDest = destFromBatch(batch, sharedRef.current.targetType);
      const isFirst = consumedBatches.current.size === 1;
      const current = sharedRef.current;
      const sharedIsEmpty = !current.artistId && current.targetType !== 'library' && !current.lockedFolder;

      if (isFirst && batchDest) {
        setShared(batchDest);
        sharedRef.current = batchDest;
        addFiles(batch.files, null);
        continue;
      }
      if (batchDest && sharedIsEmpty) {
        setShared(batchDest);
        sharedRef.current = batchDest;
        addFiles(batch.files, null);
        continue;
      }
      const override = batchDest && !sameDestination(batchDest, current) ? batchDest : null;
      const added = addFiles(batch.files, override);
      if (!isFirst && added > 0) {
        toast.success(`${added} archivo${added === 1 ? '' : 's'} añadido${added === 1 ? '' : 's'} a la subida`);
      } else if (!isFirst && added === 0 && batch.files.length > 0) {
        toast.info('Esos archivos ya estaban en la lista');
      }
    }
  }, [session.batches, addFiles]);

  // ─── BPM & key analysis (queued, so 20 audios don't freeze the browser) ──
  useEffect(() => {
    const pump = () => {
      while (analysisRunning.current < ANALYSIS_CONCURRENCY) {
        const next = itemsRef.current.find(i => i.analyzing && !analysisStarted.current.has(i.id));
        if (!next) return;
        analysisStarted.current.add(next.id);
        analysisRunning.current++;
        detectAudioFeatures(next.file)
          .then(({ bpm, key }) => {
            setItems(prev => prev.map(p => {
              if (p.id !== next.id) return p;
              const merged = { ...p, bpm: p.bpm || bpm, key: p.key || key, analyzing: false };
              const targetType = effectiveDest(merged, sharedRef.current).targetType;
              return p.nameEdited ? merged : { ...merged, baseName: suggestBaseName(merged, targetType) };
            }));
          })
          .catch(() => setItems(prev => prev.map(p => (p.id === next.id ? { ...p, analyzing: false } : p))))
          .finally(() => {
            analysisRunning.current--;
            pump();
          });
      }
    };
    pump();
  }, [items]);

  // ─── Auto-detection ─────────────────────────────────────────────────────
  useEffect(() => {
    if (shared.targetType !== 'artist' || shared.artistId || shared.lockedFolder || artists.length === 0) return;
    const candidates = items.filter(i => !i.dest).map(i => i.file);
    if (candidates.length === 0) return;
    const detected = detectArtist(candidates, artists);
    if (detected) {
      setShared(d => ({ ...d, artistId: detected }));
      setAutoDetected(a => ({ ...a, artist: true }));
    }
  }, [artists, items, shared.targetType, shared.artistId, shared.lockedFolder]);

  // Keep every folder listing used for routing warm
  useEffect(() => {
    const dests = [shared, ...items.map(i => i.dest).filter(Boolean) as Destination[]];
    const seen = new Set<string>();
    for (const d of dests) {
      for (const id of [d.artistId, d.projectId, d.targetType === 'library' ? library.rootId : '', d.lockedFolder?.id]) {
        if (id && !seen.has(id)) {
          seen.add(id);
          loadFolder(id);
        }
      }
    }
  }, [shared, items, library.rootId]);

  const artistRootReady = shared.artistId ? getFolder(shared.artistId).status === 'ready' : false;
  const projectDetectionDone = useRef('');
  /** Project chosen for the shared destination (known before the state update lands) */
  const sharedProjectRef = useRef('');
  useEffect(() => {
    if (shared.targetType !== 'artist' || !shared.artistId || !artistRootReady) return;
    if (projectDetectionDone.current === shared.artistId) return;
    projectDetectionDone.current = shared.artistId;
    if (shared.projectId || shared.lockedFolder) { sharedProjectRef.current = shared.projectId; return; } // decided by the page that opened the upload
    const detected = detectProject(items.filter(i => !i.dest).map(i => i.file), shared.artistId, artist?.name);
    sharedProjectRef.current = detected;
    if (detected) {
      setShared(d => ({ ...d, projectId: detected }));
      setAutoDetected(a => ({ ...a, project: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared.targetType, shared.artistId, shared.projectId, shared.lockedFolder, artistRootReady]);

  // Files that clearly belong to another project of the same artist get their own destination
  const autoRouted = useRef(new Set<string>());
  useEffect(() => {
    if (shared.targetType !== 'artist' || !shared.artistId || shared.lockedFolder || !artistRootReady) return;
    // Wait for the shared project detection so files that match it aren't given a redundant override
    if (projectDetectionDone.current !== shared.artistId) return;
    const updates = new Map<string, Destination>();
    for (const item of items) {
      if (item.dest || autoRouted.current.has(item.id) || item.subPath.length > 0) continue;
      autoRouted.current.add(item.id);
      const projectId = detectProjectForFile(item.file, shared.artistId, artist?.name);
      const sharedProject = shared.projectId || sharedProjectRef.current;
      if (projectId && projectId !== sharedProject) {
        updates.set(item.id, { ...shared, projectId });
      }
    }
    if (updates.size > 0) {
      setItems(prev => prev.map(i => (updates.has(i.id) ? { ...i, dest: updates.get(i.id)! } : i)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, shared.artistId, shared.projectId, shared.targetType, shared.lockedFolder, artistRootReady]);

  // A drop can preselect a folder before its name is known: fill it in once the listing arrives
  useEffect(() => {
    const locked = shared.lockedFolder;
    if (!locked || locked.name !== 'Carpeta seleccionada') return;
    const known = (locked.id === shared.artistId && artist?.name)
      || (locked.id === library.rootId && library.rootName)
      || findItem(locked.id)?.name
      || undefined;
    if (known) setShared(d => ({ ...d, lockedFolder: { id: locked.id, name: known } }));
  }, [shared.lockedFolder, shared.artistId, artist, library.rootId, library.rootName, storeVersion]);

  // ─── Item helpers ───────────────────────────────────────────────────────
  const updateItems = (ids: string[], patch: Partial<UploadItem> | ((item: UploadItem) => Partial<UploadItem>)) => {
    const idSet = new Set(ids);
    setItems(prev => prev.map(item => {
      if (!idSet.has(item.id)) return item;
      const changes = typeof patch === 'function' ? patch(item) : patch;
      const next = { ...item, ...changes };
      if (('role' in changes || 'bpm' in changes || 'key' in changes || 'dest' in changes) && !next.nameEdited) {
        next.baseName = suggestBaseName(next, effectiveDest(next, sharedRef.current).targetType);
      }
      return next;
    }));
  };

  const removeItems = (ids: string[]) => {
    const idSet = new Set(ids);
    ids.forEach(id => controllers.current.get(id)?.abort());
    setItems(prev => prev.filter(i => !idSet.has(i.id)));
    setSelected(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.delete(id));
      return next;
    });
  };

  const changeSharedTarget = (targetType: Destination['targetType']) => {
    setShared(d => ({ ...emptyDestination(targetType), artistId: targetType === 'artist' ? d.artistId : '' }));
    autoRouted.current = new Set();
    projectDetectionDone.current = '';
    setItems(prev => prev.map(i => (i.dest ? i : (i.nameEdited ? i : { ...i, baseName: suggestBaseName(i, targetType) }))));
  };

  // ─── Derived lists ──────────────────────────────────────────────────────
  const pending = items.filter(i => i.status === 'pending');
  const plans = useMemo(() => new Map(items.map(item => {
    const d = effectiveDest(item, shared);
    return [item.id, planDestination(item, d, namesFor(d))] as const;
  })), [items, shared, namesFor, storeVersion]);
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; error?: string; items: UploadItem[] }>();
    for (const item of pending) {
      const plan = plans.get(item.id)!;
      const key = plan.error || plan.label || 'Sin destino';
      if (!map.has(key)) map.set(key, { label: plan.label, error: plan.error, items: [] });
      map.get(key)!.items.push(item);
    }
    return Array.from(map.entries()).map(([key, value]) => ({ key, ...value }));
  }, [pending, plans]);

  const planErrors = groups.filter(g => g.error);
  const totalBytes = pending.reduce((s, i) => s + i.file.size, 0);
  const canUpload = pending.length > 0 && planErrors.length === 0 && pending.every(i => i.baseName.trim());
  const selectedItems = pending.filter(i => selected.has(i.id));

  // ─── Upload engine ──────────────────────────────────────────────────────
  /** Creates (once) a subfolder with this name, reusing it if it already exists. */
  const ensureChild = useCallback(async (parentId: string, name: string, rootIdForStore: string): Promise<string> => {
    const key = `${parentId}::${name.toLowerCase()}`;
    if (!createdFolders.current.has(key)) {
      createdFolders.current.set(key, (async () => {
        await loadFolder(parentId, { force: true });
        const existing = getFolder(parentId).items.find(i => i.isFolder && i.name.toLowerCase() === name.toLowerCase());
        if (existing) return existing.id;
        const id = await apiCreateFolder(name, parentId);
        const now = new Date().toISOString();
        insertItems([normalizeItem({ id, name, mimeType: FOLDER_MIME, createdTime: now, modifiedTime: now, parentFolderId: parentId }, parentId)], rootIdForStore);
        return id;
      })());
    }
    return createdFolders.current.get(key)!;
  }, []);

  const ensureFolderChain = useCallback(async (plan: Plan, rootIdForStore: string): Promise<{ id: string; label: string }> => {
    let parentId: string;
    if (plan.baseFolderId) parentId = plan.baseFolderId;
    else if (plan.baseCreate) parentId = await ensureChild(plan.baseCreate.parentId, plan.baseCreate.name, rootIdForStore);
    else throw new Error(plan.error || 'Destino no válido');

    // Folders dropped from the computer keep their structure in Drive
    for (const segment of plan.subPath) {
      parentId = await ensureChild(parentId, segment, rootIdForStore);
    }
    return { id: parentId, label: plan.label };
  }, [ensureChild]);

  const uploadOne = useCallback(async (item: UploadItem) => {
    const dest = effectiveDest(item, sharedRef.current);
    const rootIdForStore = rootOf(dest);
    const ctrl = new AbortController();
    controllers.current.set(item.id, ctrl);
    setItems(prev => prev.map(p => (p.id === item.id ? { ...p, status: 'uploading', progress: 0, error: undefined } : p)));
    try {
      // Refresh the listings the routing depends on
      for (const id of [dest.artistId, dest.projectId, dest.targetType === 'library' ? rootIdForStore : '', dest.lockedFolder?.id]) {
        if (id) await loadFolder(id);
      }
      const plan = planDestination(item, dest, namesFor(dest));
      if (plan.error) throw new Error(plan.error);
      const folder = await ensureFolderChain(plan, rootIdForStore);
      await loadFolder(folder.id);

      const replaceCandidate = item.replaceMode === 'replace'
        ? findReplaceCandidate(item, { ...plan, baseFolderId: folder.id, subPath: [] })
        : null;

      const name = `${item.baseName.trim()}${item.ext}`;
      const appProperties: Record<string, string> = {};
      if (item.bpm) appProperties.bpm = String(item.bpm);
      if (item.key) appProperties.key = item.key;
      if (expireRef.current.enabled) appProperties.expiresAt = String(Date.now() + expireRef.current.ms);

      const result = await uploadFileToDrive(item.file, folder.id, {
        name,
        fileId: replaceCandidate?.id,
        appProperties,
        signal: ctrl.signal,
        onProgress: fraction => setItems(prev => prev.map(p => (p.id === item.id ? { ...p, progress: Math.round(fraction * 100) } : p))),
      });

      if (expireRef.current.enabled) {
        // Expiring files are meant to be shared: anyone with the link can download them
        fetch(`/api/files/${result.id}/share`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'reader', type: 'anyone' }),
        }).catch(() => {});
      }

      if (dest.targetType === 'artist' && dest.artistId) {
        try { localStorage.setItem(`accessed_${dest.artistId}`, Date.now().toString()); } catch {}
      }

      insertItems([normalizeItem({
        ...result,
        modifiedTime: new Date().toISOString(),
        createdTime: new Date().toISOString(),
        size: String(item.file.size),
        parentFolderId: folder.id,
        appProperties,
      }, folder.id)], rootIdForStore);

      setItems(prev => prev.map(p => (p.id === item.id ? {
        ...p, status: 'done', progress: 100, resultId: result.id, resultFolderId: folder.id, resultFolderName: folder.label, replaced: !!replaceCandidate,
      } : p)));
    } catch (err: any) {
      const cancelled = err?.name === 'AbortError';
      setItems(prev => prev.map(p => (p.id === item.id ? {
        ...p, status: cancelled ? 'cancelled' : 'error', error: cancelled ? undefined : (err?.message || 'Error desconocido'),
      } : p)));
    } finally {
      controllers.current.delete(item.id);
    }
  }, [namesFor, ensureFolderChain]);

  /** Starts as many pending uploads as the concurrency allows (also for files added mid-upload). */
  const pumpUploads = useCallback(() => {
    while (runningUploads.current < UPLOAD_CONCURRENCY) {
      const next = itemsRef.current.find(i => i.status === 'pending' && !startedUploads.current.has(i.id));
      if (!next) return;
      startedUploads.current.add(next.id);
      runningUploads.current++;
      finishedRef.current = false;
      uploadOne(next).finally(() => {
        runningUploads.current--;
        pumpUploads();
      });
    }
  }, [uploadOne]);

  useEffect(() => {
    if (phase === 'upload') pumpUploads();
  }, [phase, items.length, pumpUploads]);

  const startUpload = () => {
    if (!canUpload) return;
    setSelected(new Set());
    setPhase('upload');
    pumpUploads();
  };

  const retry = (ids: string[]) => {
    ids.forEach(id => startedUploads.current.delete(id));
    setItems(prev => prev.map(i => (ids.includes(i.id) ? { ...i, status: 'pending', error: undefined, progress: 0 } : i)));
    setTimeout(pumpUploads, 0);
  };

  const cancelItem = (id: string) => {
    const ctrl = controllers.current.get(id);
    if (ctrl) ctrl.abort();
    else setItems(prev => prev.map(p => (p.id === id && p.status === 'pending' ? { ...p, status: 'cancelled' } : p)));
    startedUploads.current.add(id);
  };

  // ─── Completion ─────────────────────────────────────────────────────────
  const inFlight = items.some(i => i.status === 'uploading') || (phase === 'upload' && items.some(i => i.status === 'pending'));
  const done = items.filter(i => i.status === 'done');
  const failed = items.filter(i => i.status === 'error');
  const allFinished = phase === 'upload' && items.length > 0 && !inFlight;

  useEffect(() => {
    if (!allFinished || finishedRef.current) return;
    finishedRef.current = true;
    window.dispatchEvent(new CustomEvent('recentfiles:refresh'));
    const roots = new Set(items.filter(i => i.status === 'done').map(i => rootOf(effectiveDest(i, sharedRef.current))).filter(Boolean));
    roots.forEach(root => loadIndex(root, { force: true }));
    session.batches.forEach(b => b.onFinished?.());

    if (done.length > 0 && shared.targetType === 'artist' && artist && notify.email && artist.email) {
      setNotify(n => ({ ...n, emailStatus: 'sending' }));
      const titles = Array.from(new Set(done.map(i => i.baseName.replace(/\s*\[\d{2}-\d{2}-\d{4}\]$/, '')))).slice(0, 12).join(', ');
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

  useEffect(() => {
    if (!allFinished || hovered || failed.length > 0 || notify.whatsapp || notify.emailStatus === 'error' || notify.emailStatus === 'sending') return;
    const t = setTimeout(onClose, 12000);
    return () => clearTimeout(t);
  }, [allFinished, hovered, failed.length, notify.whatsapp, notify.emailStatus, onClose]);

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

  useEffect(() => {
    if (phase !== 'configure') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]:not([data-smart-upload])')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, onClose]);

  const folderHref = (item: UploadItem, folderId: string) => {
    const d = effectiveDest(item, sharedRef.current);
    if (d.targetType === 'artist') return `/artists/${d.artistId}?tab=files${folderId !== d.artistId ? `&folderId=${folderId}` : ''}`;
    return `/personal-projects${folderId !== rootOf(d) ? `?folderId=${folderId}` : ''}`;
  };

  if (typeof document === 'undefined') return null;

  // ─── Upload / results panel ─────────────────────────────────────────────
  if (phase === 'upload') {
    const active = items.filter(i => i.status !== 'cancelled');
    const totalProgress = active.length
      ? Math.round(active.reduce((s, i) => s + (i.status === 'done' ? 100 : i.status === 'error' ? 0 : i.progress), 0) / active.length)
      : 0;
    const uploadingCount = items.filter(i => i.status === 'uploading').length;
    const pendingCount = items.filter(i => i.status === 'pending').length;
    const title = allFinished
      ? (failed.length ? `${done.length} subidos · ${failed.length} con error` : `${done.length} archivo${done.length === 1 ? '' : 's'} subido${done.length === 1 ? '' : 's'}`)
      : `Subiendo ${done.length + uploadingCount} de ${active.length}…`;
    const waText = artist
      ? `Hola ${artist.name}! He subido archivos nuevos: ${Array.from(new Set(done.map(i => i.baseName))).slice(0, 10).join(', ')}.\n\nPuedes escucharlos en tu portal:\n${window.location.origin}/portal/${artist.id}`
      : '';

    return createPortal(
      <div
        className="fixed z-[120] inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom,0px))] md:inset-x-auto md:right-5 md:bottom-5 md:w-[420px]"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onDragOver={e => { if (Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); setIsDragOver(true); } }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false); }}
        onDrop={e => {
          if (!Array.from(e.dataTransfer.types).includes('Files')) return;
          e.preventDefault();
          e.stopPropagation();
          setIsDragOver(false);
          extractDroppedFiles(e.dataTransfer).then(({ files }) => {
            const added = addFiles(files, null);
            if (added) toast.success(`${added} archivo${added === 1 ? '' : 's'} añadido${added === 1 ? '' : 's'} a la cola`);
          });
        }}
        role="status"
      >
        <div className={cn('rounded-2xl border bg-surface-elevated/95 backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden animate-slide-up', isDragOver ? 'border-accent ring-2 ring-accent/40' : 'border-border')}>
          <div className="flex items-center gap-3 px-4 h-14">
            <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', allFinished ? (failed.length ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success') : 'bg-accent/15 text-accent')}>
              {allFinished ? (failed.length ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />) : <Loader2 className="w-5 h-5 animate-spin" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text-primary truncate">{title}</p>
              <p className="text-[11px] text-text-secondary truncate">
                {allFinished ? 'Puedes arrastrar más archivos aquí' : `${totalProgress}%${pendingCount ? ` · ${pendingCount} en cola` : ''}`}
              </p>
            </div>
            <button type="button" onClick={() => setMinimized(m => !m)} className="w-9 h-9 flex items-center justify-center rounded-lg text-text-secondary hover:bg-surface" aria-label={minimized ? 'Expandir' : 'Minimizar'}>
              {minimized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            <button type="button" onClick={close} className="w-9 h-9 flex items-center justify-center rounded-lg text-text-secondary hover:bg-surface" aria-label="Cerrar">
              <X className="w-4 h-4" />
            </button>
          </div>
          {!allFinished && <div className="h-1 bg-surface"><div className="h-full bg-accent transition-all duration-300" style={{ width: `${totalProgress}%` }} /></div>}

          {!minimized && (
            <div className="max-h-[min(55dvh,460px)] overflow-y-auto overscroll-contain border-t border-border/60">
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
                      {(item.status === 'error' || item.status === 'cancelled') && (
                        <button type="button" onClick={() => retry([item.id])} className="w-8 h-8 flex items-center justify-center rounded-lg text-text-secondary hover:text-accent hover:bg-surface" aria-label="Reintentar" title="Reintentar"><RefreshCw className="w-4 h-4" /></button>
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
                          <button type="button" onClick={() => { router.push(folderHref(item, item.resultFolderId!)); onClose(); }} className="w-8 h-8 flex items-center justify-center rounded-lg text-text-secondary hover:text-accent hover:bg-surface" aria-label="Abrir carpeta" title="Abrir carpeta"><FolderOpen className="w-4 h-4" /></button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

              {allFinished && done.length > 0 && shared.targetType === 'artist' && artist && (notify.email || notify.whatsapp) && (
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
                    <button type="button" onClick={() => retry(failed.map(f => f.id))} className="flex-1 h-9 rounded-xl border border-border text-xs font-semibold hover:bg-surface inline-flex items-center justify-center gap-1.5">
                      <RotateCcw className="w-3.5 h-3.5" /> Reintentar fallidos
                    </button>
                  )}
                  {done[0]?.resultFolderId && (
                    <button type="button" onClick={() => { router.push(folderHref(done[0], done[0].resultFolderId!)); onClose(); }} className="flex-1 h-9 rounded-xl bg-accent text-white text-xs font-semibold hover:bg-accent/90 inline-flex items-center justify-center gap-1.5">
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
    extractDroppedFiles(e.dataTransfer).then(({ files, truncated }) => {
      const added = addFiles(files, null);
      if (added) toast.success(`${added} archivo${added === 1 ? '' : 's'} añadido${added === 1 ? '' : 's'}`);
      if (truncated) toast.warning('Se han añadido los primeros 300 archivos');
    });
  };

  const openDestinationEditor = (ids: string[]) => setDestEditorFor(ids);

  const itemMenu = (item: UploadItem): MenuItem[] => [
    { heading: `${item.baseName}${item.ext}` },
    { label: 'Cambiar destino…', icon: 'FolderInput', action: () => openDestinationEditor([item.id]) },
    ...(item.dest ? [{ label: 'Usar el destino general', icon: 'RotateCcw', action: () => updateItems([item.id], { dest: null }) }] : []),
    ...(item.nameEdited ? [{ label: 'Restablecer nombre sugerido', icon: 'Sparkles', action: () => updateItems([item.id], i => ({ nameEdited: false, baseName: suggestBaseName(i, effectiveDest(i, sharedRef.current).targetType) })) }] : []),
    ...(item.kind === 'audio' ? AUDIO_ROLES.map(r => ({ label: ROLE_LABEL[r], checked: item.role === r, action: () => updateItems([item.id], { role: r }) })) : []),
    { separator: true },
    { label: 'Quitar de la lista', icon: 'Trash2', variant: 'danger' as const, action: () => removeItems([item.id]) },
  ];

  const bulkMenu = (x: number, y: number) => {
    const ids = selectedItems.map(i => i.id);
    showMenu(x, y, [
      { heading: `${ids.length} archivo${ids.length === 1 ? '' : 's'}` },
      { label: 'Cambiar destino…', icon: 'FolderInput', action: () => openDestinationEditor(ids) },
      { label: 'Usar el destino general', icon: 'RotateCcw', action: () => updateItems(ids, { dest: null }) },
      { separator: true },
      ...AUDIO_ROLES.map(r => ({ label: `Marcar como ${ROLE_LABEL[r].toLowerCase()}`, icon: 'Music', action: () => updateItems(ids, { role: r }) })),
      { separator: true },
      { label: 'Quitar de la lista', icon: 'Trash2', variant: 'danger' as const, action: () => removeItems(ids) },
    ]);
  };

  const dialogRootId = destEditorFor
    ? (() => {
      const first = pending.find(i => i.id === destEditorFor[0]);
      return rootOf(first ? effectiveDest(first, shared) : shared);
    })()
    : sharedRoot;

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
                {pending.length === 0 ? 'Arrastra o añade archivos y carpetas' : `${pending.length} archivo${pending.length === 1 ? '' : 's'} · ${formatBytes(totalBytes)}${groups.length > 1 ? ` · ${groups.length} destinos` : ''}`}
              </p>
            </div>
            <button
              type="button"
              onClick={e => {
                const r = e.currentTarget.getBoundingClientRect();
                showMenu(r.right - 200, r.bottom + 6, [
                  { label: 'Añadir archivos', icon: 'UploadCloud', action: () => fileInputRef.current?.click() },
                  { label: 'Añadir una carpeta', icon: 'FolderPlus', action: () => folderInputRef.current?.click() },
                ]);
              }}
              className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-border text-xs font-semibold hover:bg-surface"
            >
              <Plus className="w-4 h-4" /> Añadir
            </button>
            <button type="button" onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl text-text-secondary hover:bg-surface" aria-label="Cerrar">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 md:px-6 py-4 space-y-5">
            {/* Shared destination */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Destino general</h3>
                <div className="flex p-0.5 rounded-xl bg-surface border border-border/70">
                  {(['artist', 'library'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => changeSharedTarget(t)}
                      className={cn('h-8 px-3 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5', shared.targetType === t ? 'bg-surface-elevated text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary')}
                    >
                      {t === 'artist' ? <User className="w-3.5 h-3.5" /> : <Music className="w-3.5 h-3.5" />}
                      {t === 'artist' ? 'Artista' : 'Proyectos personales'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {shared.targetType === 'artist' ? (
                  <>
                    <div className="space-y-1.5 min-w-0">
                      <label className="text-xs font-medium text-text-secondary flex items-center gap-1.5">
                        Artista {autoDetected.artist && shared.artistId && <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-accent"><Wand2 className="w-3 h-3" /> detectado</span>}
                      </label>
                      <ArtistPicker
                        artists={artists}
                        value={shared.artistId}
                        highlight
                        onChange={id => {
                          projectDetectionDone.current = '';
                          autoRouted.current = new Set();
                          setAutoDetected({ artist: false, project: false });
                          sharedProjectRef.current = '';
                          setShared(d => ({ ...d, artistId: id, projectId: '', lockedFolder: null }));
                        }}
                      />
                    </div>
                    <div className="space-y-1.5 min-w-0">
                      <label className="text-xs font-medium text-text-secondary flex items-center gap-1.5">
                        Proyecto {autoDetected.project && shared.projectId && <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-accent"><Wand2 className="w-3 h-3" /> detectado</span>}
                      </label>
                      <div className="relative">
                        <select
                          value={shared.lockedFolder ? '__locked__' : shared.projectId}
                          disabled={!shared.artistId}
                          onChange={async e => {
                            const value = e.target.value;
                            if (value === '__pick__') {
                              setFolderPickerFor({ ids: 'shared', rootId: shared.artistId, rootName: artist?.name || 'Artista' });
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
                                  body: JSON.stringify({ artistId: shared.artistId, title, type: 'single' }),
                                });
                                const data = await res.json();
                                if (!res.ok) throw new Error(data.error || 'Error');
                                const now = new Date().toISOString();
                                insertItems([normalizeItem({ id: data.project.id, name: title, mimeType: FOLDER_MIME, createdTime: now, modifiedTime: now, parentFolderId: shared.artistId }, shared.artistId)], shared.artistId);
                                setShared(d => ({ ...d, projectId: data.project.id, lockedFolder: null }));
                                toast.success(`Proyecto "${title}" creado`, { id: t });
                              } catch (err: any) {
                                toast.error(`No se pudo crear el proyecto: ${err.message}`, { id: t });
                              }
                              return;
                            }
                            setAutoDetected(a => ({ ...a, project: false }));
                            setShared(d => ({ ...d, projectId: value === '__locked__' ? d.projectId : value, lockedFolder: value === '__locked__' ? d.lockedFolder : null }));
                          }}
                          className="w-full h-11 appearance-none bg-surface border border-border rounded-xl pl-3 pr-9 text-sm text-text-primary focus:outline-none focus:border-accent disabled:opacity-50"
                        >
                          {shared.lockedFolder && <option value="__locked__">📁 {shared.lockedFolder.name}</option>}
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
                  <div className="space-y-1.5 min-w-0 md:col-span-2">
                    <label className="text-xs font-medium text-text-secondary">Carpeta de la biblioteca</label>
                    <button
                      type="button"
                      disabled={!library.rootId}
                      onClick={() => setFolderPickerFor({ ids: 'shared', rootId: library.rootId, rootName: library.rootName })}
                      className="w-full h-11 flex items-center gap-2 px-3 rounded-xl border border-border bg-surface hover:border-accent/50 text-left disabled:opacity-50"
                    >
                      <FolderInput className="w-4 h-4 text-text-secondary shrink-0" />
                      <span className="flex-1 truncate text-sm text-text-primary">{shared.lockedFolder ? shared.lockedFolder.name : `${library.rootName} (raíz)`}</span>
                      <span className="text-[11px] font-semibold text-accent shrink-0">Cambiar</span>
                    </button>
                  </div>
                )}
              </div>

              {shared.lockedFolder && shared.targetType === 'artist' && (
                <div className="flex items-center gap-2 text-xs rounded-xl bg-accent/10 border border-accent/20 px-3 py-2">
                  <FolderOpen className="w-4 h-4 text-accent shrink-0" />
                  <span className="flex-1 min-w-0 truncate text-text-primary">Destino general: <b>{shared.lockedFolder.name}</b></span>
                  <button type="button" onClick={() => setFolderPickerFor({ ids: 'shared', rootId: shared.artistId, rootName: artist?.name || 'Artista' })} className="font-semibold text-accent shrink-0">Cambiar</button>
                  <button type="button" onClick={() => setShared(d => ({ ...d, lockedFolder: null }))} className="font-semibold text-text-secondary hover:text-text-primary shrink-0">Automático</button>
                </div>
              )}
            </section>

            {/* Files */}
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Archivos</h3>
                {pending.length > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelected(prev => (prev.size === pending.length ? new Set() : new Set(pending.map(i => i.id))))}
                      className="text-[11px] font-semibold text-text-secondary hover:text-text-primary inline-flex items-center gap-1.5"
                    >
                      <ListChecks className="w-3.5 h-3.5" /> {selected.size === pending.length && pending.length > 0 ? 'Quitar selección' : 'Seleccionar todos'}
                    </button>
                  </div>
                )}
              </div>

              {pending.length === 0 ? (
                <div className="rounded-2xl border-2 border-dashed border-border bg-surface/40 py-12 flex flex-col items-center gap-3 text-center">
                  <UploadCloud className="w-8 h-8 text-accent" />
                  <div>
                    <p className="text-sm font-semibold text-text-primary">Arrastra archivos o carpetas aquí</p>
                    <p className="text-xs text-text-secondary mt-0.5">Sin límite de tamaño · se mantiene la estructura de carpetas</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="h-10 px-4 rounded-xl bg-accent text-white text-sm font-semibold inline-flex items-center gap-2"><Plus className="w-4 h-4" /> Elegir archivos</button>
                    <button type="button" onClick={() => folderInputRef.current?.click()} className="h-10 px-4 rounded-xl border border-border text-sm font-semibold inline-flex items-center gap-2"><FolderUp className="w-4 h-4" /> Carpeta</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {groups.map(group => (
                    <div key={group.key} className="rounded-2xl border border-border/70 overflow-hidden">
                      <div className={cn('flex items-center gap-2 px-3 h-11 border-b', group.error ? 'bg-warning/10 border-warning/30' : 'bg-surface/50 border-border/50')}>
                        <FolderOpen className={cn('w-4 h-4 shrink-0', group.error ? 'text-warning' : 'text-accent')} />
                        <span className={cn('flex-1 min-w-0 truncate text-xs font-semibold', group.error ? 'text-warning' : 'text-text-primary')} title={group.error || group.label}>
                          {group.error || group.label}
                        </span>
                        <span className="text-[11px] text-text-secondary shrink-0">{group.items.length}</span>
                        <button
                          type="button"
                          onClick={() => openDestinationEditor(group.items.map(i => i.id))}
                          className="text-[11px] font-semibold text-accent shrink-0 hover:underline"
                        >
                          Cambiar
                        </button>
                      </div>
                      <div className="divide-y divide-border/40">
                        {group.items.map(item => {
                          const Icon = KIND_ICON[item.kind];
                          const plan = plans.get(item.id)!;
                          const replace = findReplaceCandidate(item, plan);
                          const expanded = expandedId === item.id;
                          const isSelected = selected.has(item.id);
                          return (
                            <div key={item.id} className={cn('bg-surface/20', isSelected && 'bg-accent/5')}>
                              <div className="flex items-center gap-2 px-2 md:px-3 py-2">
                                <button
                                  type="button"
                                  onClick={() => setSelected(prev => {
                                    const next = new Set(prev);
                                    if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                                    return next;
                                  })}
                                  className={cn('w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors', isSelected ? 'bg-accent border-accent text-white' : 'border-border hover:border-accent')}
                                  aria-label={isSelected ? 'Quitar de la selección' : 'Seleccionar'}
                                  aria-pressed={isSelected}
                                >
                                  {isSelected && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                                </button>
                                <span className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', KIND_COLOR[item.kind])}><Icon className="w-4 h-4" /></span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center min-w-0 rounded-lg border border-transparent focus-within:border-accent focus-within:bg-background hover:border-border px-1.5 -ml-1.5">
                                    <input
                                      value={item.baseName}
                                      onChange={e => updateItems([item.id], { baseName: e.target.value, nameEdited: true })}
                                      className="flex-1 min-w-0 bg-transparent py-1 text-sm font-medium text-text-primary focus:outline-none"
                                      aria-label="Nombre final"
                                    />
                                    <span className="text-xs text-text-secondary shrink-0">{item.ext}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-text-secondary">
                                    <span>{formatBytes(item.file.size)}</span>
                                    {item.subPath.length > 0 && <span className="truncate max-w-[160px]">· 📁 {item.subPath.join('/')}</span>}
                                    {item.kind === 'audio' && (item.analyzing
                                      ? <span className="inline-flex items-center gap-1 text-accent"><Loader2 className="w-3 h-3 animate-spin" /> analizando</span>
                                      : <>
                                          {item.bpm ? <span className={cn('font-mono font-bold px-1.5 rounded border', bpmTone(item.bpm))}>{item.bpm} BPM</span> : null}
                                          {item.key ? <span className="font-mono font-bold px-1.5 rounded border text-violet-400 bg-violet-500/10 border-violet-500/20">{getShortKey(item.key)}</span> : null}
                                        </>)}
                                    {item.dest && <span className="text-accent font-semibold">· destino propio</span>}
                                  </div>
                                </div>
                                {item.kind === 'audio' && (
                                  <div className="relative hidden sm:block">
                                    <select
                                      value={item.role}
                                      onChange={e => updateItems([item.id], { role: e.target.value as UploadRole })}
                                      className="h-9 appearance-none bg-surface border border-border rounded-lg pl-2.5 pr-7 text-xs font-semibold text-text-primary focus:outline-none focus:border-accent"
                                      aria-label="Tipo de archivo"
                                    >
                                      {AUDIO_ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                                    </select>
                                    <ChevronDown className="w-3.5 h-3.5 text-text-secondary absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                                  </div>
                                )}
                                <button type="button" onClick={() => setExpandedId(expanded ? null : item.id)} className="w-9 h-9 flex items-center justify-center rounded-lg text-text-secondary hover:bg-surface shrink-0" aria-label="Más opciones">
                                  {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </button>
                                <button
                                  type="button"
                                  onClick={e => { const r = e.currentTarget.getBoundingClientRect(); showMenu(r.right - 230, r.bottom + 4, itemMenu(item)); }}
                                  className="w-9 h-9 flex items-center justify-center rounded-lg text-text-secondary hover:bg-surface shrink-0"
                                  aria-label="Acciones del archivo"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </button>
                              </div>

                              {replace && (
                                <div className="mx-3 mb-2 flex items-center gap-2 rounded-lg bg-warning/10 border border-warning/25 px-2.5 py-1.5 text-[11px]">
                                  <RotateCcw className="w-3.5 h-3.5 text-warning shrink-0" />
                                  <span className="flex-1 min-w-0 truncate text-text-primary">Ya existe «{replace.name}»</span>
                                  <div className="flex rounded-md bg-surface p-0.5 shrink-0">
                                    {(['replace', 'new'] as const).map(m => (
                                      <button key={m} type="button" onClick={() => updateItems([item.id], { replaceMode: m })} className={cn('px-2 h-6 rounded text-[11px] font-semibold', item.replaceMode === m ? 'bg-surface-elevated text-text-primary shadow-sm' : 'text-text-secondary')}>
                                        {m === 'replace' ? 'Reemplazar' : 'Nueva copia'}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {expanded && (
                                <div className="px-3 pb-3 grid grid-cols-2 sm:grid-cols-4 gap-2 animate-fade-in">
                                  {item.kind === 'audio' && (
                                    <>
                                      <label className="col-span-2 sm:hidden space-y-1">
                                        <span className="text-[11px] font-medium text-text-secondary">Tipo</span>
                                        <select value={item.role} onChange={e => updateItems([item.id], { role: e.target.value as UploadRole })} className="w-full h-10 bg-surface border border-border rounded-lg px-2 text-sm">
                                          {AUDIO_ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                                        </select>
                                      </label>
                                      <label className="space-y-1">
                                        <span className="text-[11px] font-medium text-text-secondary">BPM</span>
                                        <input type="number" inputMode="numeric" value={item.bpm ?? ''} placeholder="—" onChange={e => updateItems([item.id], { bpm: e.target.value ? parseInt(e.target.value, 10) : null })} className="w-full h-10 bg-surface border border-border rounded-lg px-2.5 text-sm font-mono focus:outline-none focus:border-accent" />
                                      </label>
                                      <label className="space-y-1">
                                        <span className="text-[11px] font-medium text-text-secondary">Tonalidad</span>
                                        <input value={item.key ? getShortKey(item.key) : ''} placeholder="—" onChange={e => updateItems([item.id], { key: e.target.value.trim() || null })} className="w-full h-10 bg-surface border border-border rounded-lg px-2.5 text-sm font-mono focus:outline-none focus:border-accent" />
                                      </label>
                                    </>
                                  )}
                                  <div className="col-span-2 space-y-1">
                                    <span className="text-[11px] font-medium text-text-secondary">Destino de este archivo</span>
                                    <div className="flex gap-2">
                                      <button type="button" onClick={() => openDestinationEditor([item.id])} className="flex-1 h-10 rounded-lg border border-border bg-surface px-2.5 text-xs font-semibold text-left truncate hover:border-accent/50">
                                        {plan.error || plan.label}
                                      </button>
                                      {item.dest && (
                                        <button type="button" onClick={() => updateItems([item.id], { dest: null })} className="h-10 px-3 rounded-lg border border-border text-xs font-semibold hover:bg-surface">General</button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full h-11 rounded-xl border border-dashed border-border flex items-center justify-center gap-2 text-xs font-semibold text-text-secondary hover:text-accent hover:border-accent/50">
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
                  {shared.targetType === 'artist' && artist && (
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

          {/* Selection bar */}
          {selectedItems.length > 0 && (
            <div className="shrink-0 flex items-center gap-2 px-4 md:px-6 py-2.5 border-t border-border/60 bg-accent/5">
              <span className="text-xs font-semibold text-text-primary">{selectedItems.length} seleccionado{selectedItems.length === 1 ? '' : 's'}</span>
              <button type="button" onClick={() => openDestinationEditor(selectedItems.map(i => i.id))} className="h-9 px-3 rounded-xl border border-border text-xs font-semibold hover:bg-surface inline-flex items-center gap-1.5">
                <FolderInput className="w-3.5 h-3.5" /> Destino
              </button>
              {selectedItems.some(i => i.kind === 'audio') && (
                <div className="relative">
                  <select
                    value=""
                    onChange={e => { if (e.target.value) updateItems(selectedItems.map(i => i.id), { role: e.target.value as UploadRole }); }}
                    className="h-9 appearance-none bg-surface border border-border rounded-xl pl-3 pr-8 text-xs font-semibold focus:outline-none"
                    aria-label="Cambiar tipo"
                  >
                    <option value="">Tipo…</option>
                    {AUDIO_ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-text-secondary" />
                </div>
              )}
              <button type="button" onClick={e => { const r = e.currentTarget.getBoundingClientRect(); bulkMenu(r.right - 230, r.top - 8); }} className="h-9 w-9 rounded-xl border border-border inline-flex items-center justify-center hover:bg-surface" aria-label="Más acciones">
                <MoreVertical className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => removeItems(selectedItems.map(i => i.id))} className="h-9 px-3 rounded-xl text-xs font-semibold text-error hover:bg-error/10 inline-flex items-center gap-1.5 ml-auto">
                <Trash2 className="w-3.5 h-3.5" /> Quitar
              </button>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center gap-3 px-4 md:px-6 py-3 border-t border-border/60 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <p className="flex-1 min-w-0 text-xs text-text-secondary truncate">
              {planErrors.length > 0
                ? <span className="text-warning font-medium">{planErrors[0].error}</span>
                : pending.length > 0
                  ? (groups.length === 1 ? `Todo a ${groups[0].label}` : `${pending.length} archivos en ${groups.length} carpetas`)
                  : ''}
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

      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => { addFiles(filesFromInput(e.target.files), null); e.target.value = ''; }} />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={e => { const files = filesFromInput(e.target.files); const added = addFiles(files, null); if (added) toast.success(`${added} archivos añadidos`); e.target.value = ''; }}
        {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
      />

      {folderPickerFor && dialogRootId && (
        <FolderPicker
          isOpen
          onClose={() => setFolderPickerFor(null)}
          rootId={folderPickerFor.rootId}
          rootName={folderPickerFor.rootName}
          startFolderId={shared.lockedFolder?.id || shared.projectId || folderPickerFor.rootId}
          title={folderPickerFor.ids === 'shared' ? 'Carpeta de destino' : 'Destino de los archivos elegidos'}
          confirmLabel={folder => `Subir a "${folder.name}"`}
          onConfirm={(folder, trail) => {
            const crumb = { id: folder.id, name: trail.map(c => c.name).join(' / ') };
            if (folderPickerFor.ids === 'shared') {
              setShared(d => ({ ...d, lockedFolder: crumb }));
            } else {
              const base = effectiveDest(pending.find(i => i.id === folderPickerFor.ids[0])!, shared);
              updateItems(folderPickerFor.ids as string[], { dest: { ...base, lockedFolder: crumb } });
            }
            setFolderPickerFor(null);
          }}
        />
      )}

      {destEditorFor && (
        <DestinationEditor
          ids={destEditorFor}
          items={pending}
          shared={shared}
          artists={artists}
          library={{ rootId: library.rootId, rootName: library.rootName }}
          onClose={() => setDestEditorFor(null)}
          onApply={(ids, dest) => {
            updateItems(ids, { dest });
            setDestEditorFor(null);
          }}
          onPickFolder={(rootId, rootName, ids) => {
            setDestEditorFor(null);
            setFolderPickerFor({ ids, rootId, rootName });
          }}
        />
      )}
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

/** Destination editor for one file, a selection or a whole group. */
function DestinationEditor({
  ids, items, shared, artists, library, onClose, onApply, onPickFolder,
}: {
  ids: string[];
  items: UploadItem[];
  shared: Destination;
  artists: any[];
  library: { rootId: string; rootName: string };
  onClose: () => void;
  onApply: (ids: string[], dest: Destination | null) => void;
  onPickFolder: (rootId: string, rootName: string, ids: string[]) => void;
}) {
  const first = items.find(i => ids.includes(i.id));
  const [dest, setDest] = useState<Destination>(() => (first ? { ...effectiveDest(first, shared) } : { ...shared }));
  useStoreVersion();

  useEffect(() => {
    if (dest.artistId) loadFolder(dest.artistId);
  }, [dest.artistId]);

  const projectFolders = dest.targetType === 'artist' && dest.artistId ? projectFoldersOf(dest.artistId) : [];
  const artist = artists.find(a => a.id === dest.artistId);
  const count = ids.length;

  return (
    <div className="fixed inset-0 z-[130] flex items-end md:items-center justify-center md:p-6" role="dialog" aria-modal="true" aria-label="Destino de los archivos">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full md:max-w-lg bg-surface-elevated border-t md:border border-border rounded-t-[28px] md:rounded-2xl shadow-2xl animate-slide-up md:animate-scale-in p-4 md:p-6 space-y-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/15 text-accent flex items-center justify-center shrink-0"><FolderInput className="w-5 h-5" /></div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-text-primary">Destino</h3>
            <p className="text-xs text-text-secondary truncate">{count === 1 ? `${first?.baseName}${first?.ext}` : `${count} archivos`}</p>
          </div>
          <button type="button" onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl text-text-secondary hover:bg-surface" aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex p-0.5 rounded-xl bg-surface border border-border/70">
          {(['artist', 'library'] as const).map(t => (
            <button key={t} type="button" onClick={() => setDest(d => ({ ...d, targetType: t, lockedFolder: null }))} className={cn('flex-1 h-9 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5', dest.targetType === t ? 'bg-surface-elevated text-text-primary shadow-sm' : 'text-text-secondary')}>
              {t === 'artist' ? <User className="w-3.5 h-3.5" /> : <Music className="w-3.5 h-3.5" />}
              {t === 'artist' ? 'Artista' : 'Proyectos personales'}
            </button>
          ))}
        </div>

        {dest.targetType === 'artist' ? (
          <div className="space-y-3">
            <ArtistPicker artists={artists} value={dest.artistId} onChange={id => setDest(d => ({ ...d, artistId: id, projectId: '', lockedFolder: null }))} highlight />
            <div className="relative">
              <select
                value={dest.lockedFolder ? '__locked__' : dest.projectId}
                disabled={!dest.artistId}
                onChange={e => {
                  const value = e.target.value;
                  if (value === '__pick__') {
                    onPickFolder(dest.artistId, artist?.name || 'Artista', ids);
                    return;
                  }
                  setDest(d => ({ ...d, projectId: value === '__locked__' ? d.projectId : value, lockedFolder: value === '__locked__' ? d.lockedFolder : null }));
                }}
                className="w-full h-11 appearance-none bg-surface border border-border rounded-xl pl-3 pr-9 text-sm focus:outline-none focus:border-accent disabled:opacity-50"
              >
                {dest.lockedFolder && <option value="__locked__">📁 {dest.lockedFolder.name}</option>}
                <option value="">✨ Automático (por tipo de archivo)</option>
                {projectFolders.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                <option value="__pick__">📂 Elegir carpeta exacta…</option>
              </select>
              <ChevronDown className="w-4 h-4 text-text-secondary absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={!library.rootId}
            onClick={() => onPickFolder(library.rootId, library.rootName, ids)}
            className="w-full h-11 flex items-center gap-2 px-3 rounded-xl border border-border bg-surface text-left disabled:opacity-50"
          >
            <FolderInput className="w-4 h-4 text-text-secondary shrink-0" />
            <span className="flex-1 truncate text-sm">{dest.lockedFolder ? dest.lockedFolder.name : `${library.rootName} (raíz)`}</span>
            <span className="text-[11px] font-semibold text-accent">Elegir carpeta</span>
          </button>
        )}

        <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
          <button type="button" onClick={() => onApply(ids, null)} className="h-11 sm:h-10 px-4 rounded-xl border border-border text-sm font-medium hover:bg-surface sm:mr-auto">
            Usar el destino general
          </button>
          <button type="button" onClick={onClose} className="hidden sm:inline-flex h-10 px-4 rounded-xl border border-border text-sm font-medium hover:bg-surface items-center">Cancelar</button>
          <button
            type="button"
            onClick={() => onApply(ids, dest)}
            disabled={dest.targetType === 'artist' ? !dest.artistId : !library.rootId}
            className="h-11 sm:h-10 px-5 rounded-xl bg-accent text-white text-sm font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" /> Aplicar{count > 1 ? ` a ${count}` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
