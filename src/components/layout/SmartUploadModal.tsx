'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Music, Image as ImageIcon, File as FileIcon, UploadCloud, X, AlertTriangle, CheckCircle2, Activity, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { customConfirm } from '@/lib/dialog';
import { createPortal } from 'react-dom';
import { findBestMatch } from '@/lib/utils';
import { FOLDER_NAME_MAP } from '@/lib/constants';
import { useArtists } from '@/lib/hooks/useArtists';

export interface SmartUploadFile {
  file: File;
  id: string;
  mimeGroup: 'audio' | 'image' | 'video' | 'other';
  subType: 'bounce' | 'master' | 'mix' | 'stem' | 'cover' | 'promo' | 'none';
  artistId: string;
  projectId: string; // empty means artist root folder
  folderId: string;  // final resolved target folder ID
  customName: string;
  // Audio analysis
  bpm?: number | null;
  key?: string | null;
  isAnalyzing?: boolean;
  // Upload state
  uploadStatus?: 'pending' | 'uploading' | 'done' | 'error' | 'cancelled';
  uploadProgress?: number;
  uploadError?: string;
  resultId?: string;
}

interface SmartUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialFiles: File[];
  preselectedArtistId?: string;
  preselectedFolderId?: string; // If user drops inside DriveExplorer in a specific folder
}

// ─── BPM Detection via Web Audio API ──────────────────────────────────────────
async function detectAudioFeatures(file: File): Promise<{ bpm: number | null; key: string | null }> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const AudioCtxClass: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    const audioCtx = new AudioCtxClass();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    audioCtx.close();

    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;

    const bufferSize = 512;
    const peaks: number[] = [];
    let lastPeak = 0;
    const threshold = 0.3;

    for (let i = 0; i < channelData.length; i += bufferSize) {
      let sum = 0;
      for (let j = 0; j < bufferSize && i + j < channelData.length; j++) {
        sum += Math.abs(channelData[i + j]);
      }
      const rms = Math.sqrt(sum / bufferSize);
      const frameTime = i / sampleRate;
      if (rms > threshold && frameTime - lastPeak > 0.3) {
        peaks.push(frameTime);
        lastPeak = frameTime;
      }
    }

    let bpm: number | null = null;
    if (peaks.length > 4) {
      const intervals: number[] = [];
      for (let i = 1; i < Math.min(peaks.length, 50); i++) {
        intervals.push(peaks[i] - peaks[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const rawBpm = 60 / avgInterval;
      let normalized = rawBpm;
      while (normalized > 180) normalized /= 2;
      while (normalized < 60) normalized *= 2;
      bpm = Math.round(normalized);
    }

    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const start = Math.floor(channelData.length * 0.3);
    const sampleLen = Math.min(sampleRate * 10, channelData.length - start);
    const sample = channelData.slice(start, start + sampleLen);

    const chromagram = new Array(12).fill(0);
    for (let n = 0; n < 12; n++) {
      const freq = 261.63 * Math.pow(2, n / 12);
      let real = 0, imag = 0;
      for (let i = 0; i < sample.length; i++) {
        const t = i / sampleRate;
        real += sample[i] * Math.cos(2 * Math.PI * freq * t);
        imag += sample[i] * Math.sin(2 * Math.PI * freq * t);
      }
      chromagram[n] = Math.sqrt(real * real + imag * imag);
    }
    const maxIdx = chromagram.indexOf(Math.max(...chromagram));
    const key = noteNames[maxIdx];

    return { bpm, key };
  } catch {
    return { bpm: null, key: null };
  }
}

// ─── Name Generation ──────────────────────────────────────────────────────────
function generateName(original: string, subType: string, artistName?: string): string {
  if (subType === 'none') return original;

  const extMatch = original.match(/\.[^.]+$/);
  const ext = extMatch ? extMatch[0] : '';
  const baseName = original.replace(/\.[^.]+$/, '');
  let cleanName = baseName.replace(/^\[.*?\]\s*/, '').replace(/^(Master|Bounce|Mix|Stem)_/i, '').trim();

  // DD-MM-YYYY
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const dateStr = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}`;

  if (subType === 'bounce') {
    const artistPrefix = artistName ? `${artistName} - ` : '';
    return `${artistPrefix}${cleanName} [${dateStr}]${ext}`;
  }

  return original;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function SmartUploadModal({
  isOpen,
  onClose,
  initialFiles,
  preselectedArtistId,
  preselectedFolderId
}: SmartUploadModalProps) {
  const { activeArtists: artists } = useArtists();
  const [items, setItems] = useState<SmartUploadFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [globalStatus, setGlobalStatus] = useState<'idle' | 'uploading' | 'done'>('idle');
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  const [artistFolders, setArtistFolders] = useState<Record<string, any[]>>({});
  const [projectSubfolders, setProjectSubfolders] = useState<Record<string, any[]>>({});
  const [loadingFolders, setLoadingFolders] = useState<Record<string, boolean>>({});

  const hasInitializedRef = useRef(false);

  // 1. Initialize files and apply fuzzy matching detection
  useEffect(() => {
    if (initialFiles.length === 0 || hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    const initialized = initialFiles.map((f, i) => {
      let mimeGroup: SmartUploadFile['mimeGroup'] = 'other';
      if (f.type.startsWith('audio/')) mimeGroup = 'audio';
      else if (f.type.startsWith('image/')) mimeGroup = 'image';
      else if (f.type.startsWith('video/')) mimeGroup = 'video';

      let subType: SmartUploadFile['subType'] = 'none';
      if (mimeGroup === 'audio') {
        const nl = f.name.toLowerCase();
        if (nl.includes('master')) subType = 'master';
        else if (nl.includes('mix')) subType = 'mix';
        else if (nl.includes('stem')) subType = 'stem';
        else subType = 'bounce';
      }

      // Detect Artist using Fuzzy Match
      let detectedArtistId = '';
      let detectedArtistName = '';
      if (preselectedArtistId) {
        detectedArtistId = preselectedArtistId;
        detectedArtistName = artists.find(a => a.id === preselectedArtistId)?.name || '';
      } else {
        const bestArtistMatch = findBestMatch(f.name, artists, (a: any) => a.name, 0.4);
        if (bestArtistMatch) {
          detectedArtistId = bestArtistMatch.id;
          detectedArtistName = bestArtistMatch.name;
        } else if (artists.length > 0) {
          detectedArtistId = artists[0].id;
          detectedArtistName = artists[0].name;
        }
      }

      return {
        file: f,
        id: `file-${i}`,
        mimeGroup,
        subType,
        artistId: detectedArtistId,
        projectId: '', // Resolved dynamically based on name and artist folders
        folderId: preselectedFolderId || '', // Resolved dynamically based on smart folder routing
        customName: generateName(f.name, subType, detectedArtistName),
        bpm: undefined,
        key: undefined,
        isAnalyzing: mimeGroup === 'audio',
        uploadStatus: 'pending' as const,
        uploadProgress: 0,
      };
    });

    setItems(initialized);

    // Audio Analysis
    initialized.forEach(item => {
      if (item.mimeGroup === 'audio') {
        detectAudioFeatures(item.file).then(({ bpm, key }) => {
          setItems(prev => prev.map(p => p.id === item.id ? { ...p, bpm, key, isAnalyzing: false } : p));
        });
      }
    });
  }, [initialFiles, artists, preselectedArtistId, preselectedFolderId]);

  // Load artist folders
  const loadArtistFolders = useCallback(async (artistId: string) => {
    if (!artistId || artistFolders[artistId] || loadingFolders[artistId]) return;
    setLoadingFolders(prev => ({ ...prev, [artistId]: true }));
    try {
      const res = await fetch(`/api/files?folderId=${artistId}`);
      if (res.ok) {
        const data = await res.json();
        const folders = (data.items || []).filter((item: any) => item.mimeType === 'application/vnd.google-apps.folder');
        setArtistFolders(prev => ({ ...prev, [artistId]: folders }));
      }
    } catch (err) {
      console.error('Error loading artist folders:', err);
    } finally {
      setLoadingFolders(prev => ({ ...prev, [artistId]: false }));
    }
  }, [artistFolders, loadingFolders]);

  // Load project subfolders
  const loadProjectFolders = useCallback(async (projectId: string) => {
    if (!projectId || projectSubfolders[projectId] || loadingFolders[projectId]) return;
    setLoadingFolders(prev => ({ ...prev, [projectId]: true }));
    try {
      const res = await fetch(`/api/files?folderId=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        const folders = (data.items || []).filter((item: any) => item.mimeType === 'application/vnd.google-apps.folder');
        setProjectSubfolders(prev => ({ ...prev, [projectId]: folders }));
      }
    } catch (err) {
      console.error('Error loading project folders:', err);
    } finally {
      setLoadingFolders(prev => ({ ...prev, [projectId]: false }));
    }
  }, [projectSubfolders, loadingFolders]);

  // Trigger loading artist folders for all detected artists
  useEffect(() => {
    items.forEach(item => {
      if (item.artistId && !artistFolders[item.artistId]) {
        loadArtistFolders(item.artistId);
      }
    });
  }, [items, artistFolders, loadArtistFolders]);

  // Auto-detect project based on fuzzy filename matching
  useEffect(() => {
    let madeChanges = false;
    const newItems = items.map(item => {
      if (item.projectId || !item.artistId || preselectedFolderId) return item; // Already resolved or preselected
      const folders = artistFolders[item.artistId];
      if (!folders || folders.length === 0) return item;

      const ignoreList = ['01_Legal_y_Contratos', '02_Diseño_y_Media', '03_Lanzamientos_y_Proyectos', '02_Bounces_y_Grabaciones'];
      const projects = folders.filter(f => !ignoreList.includes(f.name));

      if (projects.length > 0) {
        // Try fuzzy matching project name
        const bestProjectMatch = findBestMatch(item.file.name, projects, (p: any) => p.name, 0.4);
        if (bestProjectMatch) {
          madeChanges = true;
          return { ...item, projectId: bestProjectMatch.id };
        } else {
          // Default to first project
          madeChanges = true;
          return { ...item, projectId: projects[0].id };
        }
      }
      return item;
    });
    
    if (madeChanges) {
      setItems(newItems);
    }
  }, [items, artistFolders, preselectedFolderId]);

  // Load subfolders for detected projects
  useEffect(() => {
    items.forEach(item => {
      if (item.projectId && !projectSubfolders[item.projectId]) {
        loadProjectFolders(item.projectId);
      }
    });
  }, [items, projectSubfolders, loadProjectFolders]);

  // ─── Smart Folder Target Resolution ─────────────────────────────────────────
  useEffect(() => {
    if (preselectedFolderId) return; // If manually provided by DriveExplorer, keep it.

    let madeChanges = false;
    const newItems = items.map(item => {
      if (item.uploadStatus !== 'pending') return item;

      let targetFolderId = item.folderId;
      
      // If it's a Bounce, route to Artist's global bounces folder
      if (item.subType === 'bounce') {
        const aFolders = artistFolders[item.artistId] || [];
        const bouncesFolder = aFolders.find(f => f.name.toLowerCase().includes('bounce') || f.name === FOLDER_NAME_MAP['Bounces']);
        const newTarget = bouncesFolder ? bouncesFolder.id : item.artistId; // Fallback to artist root
        if (targetFolderId !== newTarget) {
          targetFolderId = newTarget;
          madeChanges = true;
        }
      } 
      // If it's Master/Mix, route inside the specific Project folder
      else if (item.projectId) {
        const pFolders = projectSubfolders[item.projectId] || [];
        const mappedName = FOLDER_NAME_MAP[item.subType === 'master' ? 'Master' : item.subType === 'mix' ? 'Mix' : 'Sessions'];
        const specificFolder = pFolders.find(f => f.name.toLowerCase() === item.subType || f.name === mappedName);
        const newTarget = specificFolder ? specificFolder.id : item.projectId; // Fallback to project root
        if (targetFolderId !== newTarget) {
          targetFolderId = newTarget;
          madeChanges = true;
        }
      } 
      // Fallback
      else {
        const newTarget = item.artistId || '';
        if (targetFolderId !== newTarget) {
          targetFolderId = newTarget;
          madeChanges = true;
        }
      }

      return { ...item, folderId: targetFolderId };
    });

    if (madeChanges) setItems(newItems);
  }, [items, artistFolders, projectSubfolders, preselectedFolderId]);

  // ─── State Modifiers ─────────────────────────────────────────────────────────
  const updateItem = (id: string, updates: Partial<SmartUploadFile>) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, ...updates };
      if (updates.subType !== undefined) {
        const artistName = artists.find(a => a.id === updated.artistId)?.name;
        updated.customName = generateName(item.file.name, updated.subType, artistName);
        // Reset resolved folderId so the router effect can pick it up again
        if (!preselectedFolderId) updated.folderId = ''; 
      }
      if (updates.artistId !== undefined && updates.artistId !== item.artistId) {
        const artistName = artists.find(a => a.id === updates.artistId)?.name;
        updated.customName = generateName(item.file.name, updated.subType, artistName);
        updated.projectId = ''; // Reset project for new artist
        if (!preselectedFolderId) updated.folderId = '';
      }
      return updated;
    }));
  };

  const cancelItem = (id: string) => {
    const ctrl = abortControllersRef.current.get(id);
    if (ctrl) ctrl.abort();
    updateItem(id, { uploadStatus: 'cancelled', uploadProgress: 0 });
  };

  // ─── Pre-check Existing Files (Masters/Bounces) ────────────────────────────
  const preCheckItem = async (item: SmartUploadFile): Promise<string | undefined> => {
    if (item.subType !== 'master' && item.subType !== 'bounce') return undefined;
    if (!item.folderId) return undefined;

    try {
      const res = await fetch(`/api/files?folderId=${item.folderId}`);
      if (!res.ok) return undefined;
      const data = await res.json();
      const existingFiles: any[] = data.items || [];

      if (item.subType === 'master') {
        const masters = existingFiles.filter(f =>
          f.mimeType.startsWith('audio/') &&
          (f.name.toLowerCase().includes('master') || f.name.toLowerCase() === item.customName.toLowerCase())
        );
        if (masters.length > 0) {
          const confirm = await customConfirm(
            `Hemos detectado un Master anterior en este proyecto: "${masters[0].name}".\n\n¿Deseas REEMPLAZARLO con esta nueva versión? (Cancelar = subir como archivo nuevo)`
          );
          return confirm ? masters[0].id : undefined;
        }
      } else if (item.subType === 'bounce') {
        const cleanBase = item.file.name
          .replace(/\.[^.]+$/, '')
          .replace(/^\[.*?\]\s*/, '')
          .replace(/^(Master|Bounce|Mix|Stem)_/i, '')
          .trim()
          .toLowerCase();
        const bounces = existingFiles.filter(f => {
          if (!f.mimeType.startsWith('audio/')) return false;
          const fn = f.name.toLowerCase();
          return fn.includes(cleanBase) && (fn.includes('bounce') || /\[\d{2}-\d{2}-\d{4}\]/.test(fn) || /\[\d{4}-\d{2}-\d{2}\]/.test(fn));
        });
        if (bounces.length > 0) {
          const confirm = await customConfirm(
            `Hemos detectado ${bounces.length} versión(es) anterior(es) de este Bounce ("${cleanBase}").\n\nLos bounces se acumulan como historial automáticamente.\n\nPresiona Aceptar si prefieres REEMPLAZAR la versión más reciente en lugar de añadirla.`
          );
          if (confirm) {
            bounces.sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime());
            return bounces[0].id;
          }
        }
      }
    } catch (err) {
      console.error('Error in pre-check', err);
    }
    return undefined;
  };

  // ─── Upload Execution ────────────────────────────────────────────────────────
  const handleUpload = async () => {
    setIsProcessing(true);
    setGlobalStatus('uploading');

    let processedCount = 0;
    const itemsToUpload = items.filter(i => i.uploadStatus === 'pending');

    for (const item of itemsToUpload) {
      if (item.uploadStatus === 'cancelled') continue;
      if (!item.folderId) {
        updateItem(item.id, { uploadStatus: 'error', uploadError: 'No target folder resolved' });
        continue;
      }

      updateItem(item.id, { uploadStatus: 'uploading', uploadProgress: 10 });
      
      const fileToReplaceId = await preCheckItem(item);

      const ctrl = new AbortController();
      abortControllersRef.current.set(item.id, ctrl);

      try {
        const formData = new FormData();
        const extension = item.file.name.substring(item.file.name.lastIndexOf('.'));
        let finalName = item.customName;
        if (!finalName.endsWith(extension)) finalName += extension;
        
        const renamedFile = new File([item.file], finalName, { type: item.file.type });
        formData.append('file', renamedFile);

        if (fileToReplaceId) {
          formData.append('fileId', fileToReplaceId); // Overwrite mode
        } else {
          formData.append('parentId', item.folderId); // New file mode
        }

        // Fake progress logic using XMLHttpRequest
        const uploadTask = new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/api/files');
          
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const p = Math.round((e.loaded / e.total) * 90); // 10% to 100%
              updateItem(item.id, { uploadProgress: Math.max(10, p) });
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              const data = JSON.parse(xhr.responseText);
              updateItem(item.id, { uploadStatus: 'done', uploadProgress: 100, resultId: data.file?.id });
              
              // Email notification for Masters
              if (item.subType === 'master') {
                const artistData = artists.find(a => a.id === item.artistId);
                if (artistData?.email) {
                  fetch('/api/notifications/master', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      artistEmail: artistData.email,
                      artistName: artistData.name,
                      songName: item.file.name.replace(/\.[^.]+$/, '').replace(/\[MASTER\]\s*/i, ''),
                      isUpdate: !!fileToReplaceId,
                      downloadLink: data.file?.webViewLink || ''
                    })
                  }).catch(console.error);
                }
              }
              resolve();
            } else {
              reject(new Error(xhr.responseText || 'Upload failed'));
            }
          };

          xhr.onerror = () => reject(new Error('Network error'));
          xhr.onabort = () => reject(new Error('Cancelled by user'));
          
          ctrl.signal.addEventListener('abort', () => xhr.abort());
          xhr.send(formData);
        });

        await uploadTask;
        processedCount++;

      } catch (err: any) {
        if (err.message !== 'Cancelled by user') {
          updateItem(item.id, { uploadStatus: 'error', uploadError: err.message, uploadProgress: 0 });
        }
      } finally {
        abortControllersRef.current.delete(item.id);
      }
    }

    setIsProcessing(false);
    setGlobalStatus('done');
  };

  if (!isOpen || initialFiles.length === 0) return null;

  const hasAnyDone = items.some(i => i.uploadStatus === 'done');
  const allDone = items.every(i => i.uploadStatus === 'done' || i.uploadStatus === 'error' || i.uploadStatus === 'cancelled');
  
  // Collect unique artists that will receive emails
  const artistsReceivingEmails = Array.from(new Set(
    items.filter(i => i.subType === 'master')
         .map(i => artists.find(a => a.id === i.artistId))
         .filter(a => a && a.email)
  ));

  const modal = (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/70 backdrop-blur-md p-6 animate-in fade-in duration-200">
      <div className="glass w-full max-w-4xl max-h-[90vh] rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden shadow-[0_0_80px_rgba(108,92,231,0.15)] animate-in slide-in-from-bottom-4 zoom-in-95 duration-300">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-border shrink-0 bg-surface/50 backdrop-blur-xl">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-accent/10 flex items-center justify-center shadow-inner">
              <UploadCloud className="w-6 h-6 text-accent" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-text-primary">Subida Inteligente</h2>
              <p className="text-sm text-text-secondary mt-0.5">
                {items.length} archivo{items.length !== 1 ? 's' : ''} · Detección automática de tipo, BPM, tonalidad y artista destino
              </p>
            </div>
          </div>
          {!isProcessing && (
            <button onClick={() => { abortControllersRef.current.forEach(c => c.abort()); onClose(); }} className="p-2 rounded-lg text-text-secondary hover:text-white hover:bg-surface-elevated transition-colors">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Files list */}
        <div className="flex-1 overflow-y-auto px-8 py-5 space-y-4 bg-background/30 custom-scrollbar">
          {items.map(item => {
            const currentArtistFolders = artistFolders[item.artistId] || [];
            const projectList = currentArtistFolders.filter(f => !['01_Legal_y_Contratos', '02_Diseño_y_Media', '03_Lanzamientos_y_Proyectos', '02_Bounces_y_Grabaciones'].includes(f.name));

            return (
            <div key={item.id} className={`rounded-xl border p-5 transition-all duration-300 ${item.uploadStatus === 'done' ? 'border-success/40 bg-success/5' : item.uploadStatus === 'error' ? 'border-danger/40 bg-danger/5' : item.uploadStatus === 'cancelled' ? 'border-border/30 bg-surface/30 opacity-50' : 'border-border bg-surface shadow-sm'}`}>
              {/* File row */}
              <div className="flex items-center gap-4 mb-4">
                <div className="w-10 h-10 rounded-xl bg-surface-elevated flex items-center justify-center shrink-0 border border-border/50">
                  {item.mimeGroup === 'audio' ? <Music className="w-4 h-4 text-accent" /> : item.mimeGroup === 'image' ? <ImageIcon className="w-4 h-4 text-success" /> : <FileIcon className="w-4 h-4 text-text-secondary" />}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold text-text-primary truncate" title={item.file.name}>{item.file.name}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs text-text-secondary bg-surface-elevated px-2 py-0.5 rounded-md border border-border/50">{(item.file.size / 1024 / 1024).toFixed(1)} MB</span>
                    {item.mimeGroup === 'audio' && (
                      <>
                        {item.isAnalyzing ? (
                          <span className="text-xs text-accent flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Analizando audio...</span>
                        ) : (
                          <>
                            {item.bpm && <span className="text-xs bg-accent/10 text-accent border border-accent/20 px-2 py-0.5 rounded-md font-mono flex items-center gap-1.5"><Activity className="w-3 h-3" /> {item.bpm} BPM</span>}
                            {item.key && <span className="text-xs bg-purple-500/10 text-purple-300 border border-purple-500/20 px-2 py-0.5 rounded-md font-mono">{item.key}</span>}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Status icon */}
                <div className="shrink-0 flex items-center gap-2">
                  {item.uploadStatus === 'done' && <span className="text-xs text-success font-medium mr-2">¡Completado!</span>}
                  {item.uploadStatus === 'done' && <CheckCircle2 className="w-5 h-5 text-success" />}
                  {item.uploadStatus === 'error' && <AlertTriangle className="w-5 h-5 text-danger" />}
                  {item.uploadStatus === 'uploading' && (
                    <button onClick={() => cancelItem(item.id)} className="p-1.5 rounded-full hover:bg-surface-elevated text-text-secondary hover:text-danger transition-colors" title="Cancelar este archivo"><XCircle className="w-5 h-5" /></button>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              {item.uploadStatus === 'uploading' && (
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-text-secondary">Subiendo archivo a Drive...</span>
                    <span className="text-xs text-accent font-mono font-bold">{item.uploadProgress || 0}%</span>
                  </div>
                  <div className="w-full h-2 bg-surface-elevated rounded-full overflow-hidden border border-border/50">
                    <div className="h-full bg-gradient-to-r from-accent to-accent-light rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(108,92,231,0.5)]" style={{ width: `${item.uploadProgress || 0}%` }} />
                  </div>
                </div>
              )}

              {item.uploadStatus === 'error' && <p className="text-xs text-danger mb-2 bg-danger/10 p-2 rounded-lg border border-danger/20">{item.uploadError || 'Error desconocido'}</p>}

              {/* Controls - only show when pending */}
              {item.uploadStatus === 'pending' && (
                <div className="grid grid-cols-2 gap-4 mt-2">
                  {/* Select Artist */}
                  <div>
                    <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5">Artista Destino</label>
                    <select value={item.artistId} onChange={e => updateItem(item.id, { artistId: e.target.value })} className="w-full bg-surface-elevated border border-border/60 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-accent outline-none text-text-primary transition-all hover:border-border">
                      {artists.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>

                  {/* Select Project (only if it's a mix/master/stem that requires a project) */}
                  <div className={(item.subType === 'bounce' || preselectedFolderId) ? "opacity-50 pointer-events-none" : ""}>
                    <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5">Proyecto asociado</label>
                    <select value={item.projectId} onChange={e => updateItem(item.id, { projectId: e.target.value })} className="w-full bg-surface-elevated border border-border/60 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-accent outline-none text-text-primary transition-all hover:border-border">
                      {item.subType === 'bounce' ? (
                         <option value="">Carpeta General (Artista)</option>
                      ) : (
                        projectList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)
                      )}
                    </select>
                  </div>

                  {item.mimeGroup === 'audio' && (
                    <div>
                      <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5">Tipo de Archivo</label>
                      <select value={item.subType} onChange={e => updateItem(item.id, { subType: e.target.value as any })} className="w-full bg-surface-elevated border border-border/60 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-accent outline-none text-text-primary transition-all hover:border-border">
                        <option value="bounce">🎵 Bounce (Demo)</option>
                        <option value="mix">🎛️ Mix</option>
                        <option value="master">💿 Master (Final)</option>
                        <option value="stem">🎸 Stem</option>
                        <option value="none">📁 Otro Audio</option>
                      </select>
                    </div>
                  )}

                  {/* Generated name preview — full width or partial depending on audio */}
                  <div className={item.mimeGroup === 'audio' ? '' : 'col-span-2'}>
                    <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5">Nombre final en Drive</label>
                    <div className="flex items-center gap-2 bg-surface border border-border/40 rounded-lg px-4 py-2 h-[38px] shadow-inner">
                      <span className="text-sm text-text-primary font-mono break-all line-clamp-1" title={item.customName}>{item.customName}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )})}
        </div>

        {/* Footer */}
        <div className="px-8 py-5 border-t border-border shrink-0 flex items-center justify-between gap-4 bg-surface/50 backdrop-blur-xl">
          <div className="text-sm text-text-secondary">
            {globalStatus === 'uploading' && <span className="flex items-center gap-2 font-medium"><Loader2 className="w-4 h-4 animate-spin text-accent" /> Procesando subidas...</span>}
            {globalStatus === 'done' && <span className="flex items-center gap-2 text-success font-bold"><CheckCircle2 className="w-5 h-5" /> {hasAnyDone ? '¡Todos los archivos listos!' : 'Proceso finalizado'}</span>}
            {globalStatus === 'idle' && artistsReceivingEmails.length > 0 && (
              <span className="flex items-center gap-2 text-accent/80 font-medium bg-accent/10 px-3 py-1.5 rounded-lg border border-accent/20">
                <span>📧</span> Notificando Masters a: {artistsReceivingEmails.map(a => a?.name).join(', ')}
              </span>
            )}
            {globalStatus === 'idle' && artistsReceivingEmails.length === 0 && (
              <span className="text-text-secondary/70">Revisa la configuración y pulsa Subir</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {allDone ? (
              <Button onClick={onClose} variant="default" className="px-8">Cerrar</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => { abortControllersRef.current.forEach(c => c.abort()); onClose(); }} disabled={isProcessing}>Cancelar</Button>
                <Button onClick={handleUpload} disabled={isProcessing} className="px-6 bg-accent hover:bg-accent-light text-white shadow-lg shadow-accent/20">
                  {isProcessing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Subiendo...</> : <><UploadCloud className="w-4 h-4 mr-2" />Subir {items.length} archivo{items.length !== 1 ? 's' : ''}</>}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modal, document.body);
}
