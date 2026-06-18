'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Music, Image as ImageIcon, File as FileIcon, UploadCloud, X, AlertTriangle, CheckCircle2, Activity, XCircle, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { customConfirm } from '@/lib/dialog';
import { createPortal } from 'react-dom';
import { findBestMatch } from '@/lib/utils';
import { FOLDER_NAME_MAP } from '@/lib/constants';
import { useArtists } from '@/lib/hooks/useArtists';
import { convertWavToMp3 } from '@/lib/audioEncoder';

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
  notifyArtist?: boolean;
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

// ─── Resolve target folder for a single item ─────────────────────────────────
function resolveTargetFolder(
  item: SmartUploadFile,
  aFolders: any[],
  pFolders: any[],
  preselectedFolderId?: string
): string {
  if (preselectedFolderId) return preselectedFolderId;

  // Bounce → Artist's global bounces folder
  if (item.subType === 'bounce') {
    const bouncesFolder = aFolders.find(f => f.name.toLowerCase().includes('bounce') || f.name === FOLDER_NAME_MAP['Bounces']);
    return bouncesFolder ? bouncesFolder.id : `CREATE_FOLDER::${FOLDER_NAME_MAP['Bounces']}::${item.artistId}`;
  }

  // Master → Project root directly
  if (item.subType === 'master' && item.projectId) {
    return item.projectId;
  }

  // Mix/Stem/Session → Specific subfolder inside project
  if (item.projectId && item.subType !== 'none' && item.subType !== 'master') {
    let mappedName = '';
    if (item.subType === 'mix') mappedName = FOLDER_NAME_MAP['Mix'];
    else if (item.subType === 'stem') mappedName = FOLDER_NAME_MAP['Sessions'];
    else mappedName = FOLDER_NAME_MAP['Other'] || '05_Referencias_y_Otros';

    const specificFolder = pFolders.find(f => f.name.toLowerCase() === item.subType || f.name === mappedName);
    return specificFolder ? specificFolder.id : `CREATE_FOLDER::${mappedName}::${item.projectId}`;
  }

  // Fallback
  return item.artistId || '';
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

  // Use refs for folder caches to avoid triggering re-renders in the effect chain
  const artistFoldersRef = useRef<Record<string, any[]>>({});
  const projectSubfoldersRef = useRef<Record<string, any[]>>({});
  const loadingFoldersRef = useRef<Set<string>>(new Set());
  // State version counter to trigger re-renders when folder data loads
  const [folderDataVersion, setFolderDataVersion] = useState(0);

  const hasInitializedRef = useRef(false);
  const isResolvingRef = useRef(false);

  // Sort artists by recent interaction
  const [sortedArtists, setSortedArtists] = useState<any[]>([]);

  useEffect(() => {
    const sorted = [...artists].sort((a, b) => {
      let accessedA = 0, accessedB = 0;
      if (typeof window !== 'undefined') {
        const storedA = localStorage.getItem(`accessed_${a.id}`);
        const storedB = localStorage.getItem(`accessed_${b.id}`);
        
        const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        
        accessedA = storedA ? parseInt(storedA, 10) : (isNaN(timeA) ? 0 : timeA);
        accessedB = storedB ? parseInt(storedB, 10) : (isNaN(timeB) ? 0 : timeB);
        
        if (isNaN(accessedA)) accessedA = 0;
        if (isNaN(accessedB)) accessedB = 0;
      }
      return accessedB - accessedA;
    });
    setSortedArtists(sorted);
  }, [artists]);

  // ─── Folder Loading (writes to refs, bumps version counter) ─────────────────
  const loadArtistFolders = useCallback(async (artistId: string) => {
    if (!artistId || artistFoldersRef.current[artistId] || loadingFoldersRef.current.has(artistId)) return;
    loadingFoldersRef.current.add(artistId);
    try {
      const res = await fetch(`/api/files?folderId=${artistId}`);
      if (res.ok) {
        const data = await res.json();
        const folders = (data.items || []).filter((item: any) => item.mimeType === 'application/vnd.google-apps.folder');
        artistFoldersRef.current[artistId] = folders;
        setFolderDataVersion(v => v + 1); // Trigger re-render
      }
    } catch (err) {
      console.error('Error loading artist folders:', err);
    } finally {
      loadingFoldersRef.current.delete(artistId);
    }
  }, []);

  const loadProjectFolders = useCallback(async (projectId: string) => {
    if (!projectId || projectSubfoldersRef.current[projectId] || loadingFoldersRef.current.has(projectId)) return;
    loadingFoldersRef.current.add(projectId);
    try {
      const res = await fetch(`/api/files?folderId=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        const folders = (data.items || []).filter((item: any) => item.mimeType === 'application/vnd.google-apps.folder');
        projectSubfoldersRef.current[projectId] = folders;
        setFolderDataVersion(v => v + 1); // Trigger re-render
      }
    } catch (err) {
      console.error('Error loading project folders:', err);
    } finally {
      loadingFoldersRef.current.delete(projectId);
    }
  }, []);

  // ─── Core Resolution: runs once when folder data arrives ────────────────────
  const resolveItemsFromFolderData = useCallback(() => {
    if (isResolvingRef.current) return;
    isResolvingRef.current = true;

    setItems(prevItems => {
      let changed = false;
      const ignoreList = ['01_Legal_y_Contratos', '02_Diseño_y_Media', '03_Lanzamientos_y_Proyectos', '02_Bounces_y_Grabaciones'];
      
      const newItems = prevItems.map(item => {
        if (item.uploadStatus !== 'pending') return item;

        let updatedItem = { ...item };
        let itemChanged = false;

        // 1. Auto-detect project if not yet set
        if (!updatedItem.projectId && updatedItem.artistId && !preselectedFolderId) {
          const folders = artistFoldersRef.current[updatedItem.artistId];
          if (folders && folders.length > 0) {
            const projects = folders.filter((f: any) => !ignoreList.includes(f.name));
            if (projects.length > 0) {
              const bestProjectMatch = findBestMatch(updatedItem.file.name, projects, (p: any) => p.name, 0.4);
              updatedItem.projectId = bestProjectMatch ? bestProjectMatch.id : projects[0].id;
              itemChanged = true;
            }
          }
        }

        // 2. Trigger project subfolder loading if needed
        if (updatedItem.projectId && !projectSubfoldersRef.current[updatedItem.projectId] && !loadingFoldersRef.current.has(updatedItem.projectId)) {
          // Schedule async load (don't await)
          loadProjectFolders(updatedItem.projectId);
        }

        // 3. Resolve target folder
        const aFolders = artistFoldersRef.current[updatedItem.artistId] || [];
        const pFolders = projectSubfoldersRef.current[updatedItem.projectId] || [];
        const newFolderId = resolveTargetFolder(updatedItem, aFolders, pFolders, preselectedFolderId);
        
        if (newFolderId !== updatedItem.folderId) {
          updatedItem.folderId = newFolderId;
          itemChanged = true;
        }

        if (itemChanged) {
          changed = true;
          return updatedItem;
        }
        return item; // Return original reference if nothing changed
      });

      isResolvingRef.current = false;
      return changed ? newItems : prevItems; // Only update state if something actually changed
    });
  }, [preselectedFolderId, loadProjectFolders]);

  // 1. Initialize files and apply fuzzy matching detection
  useEffect(() => {
    if (initialFiles.length === 0 || hasInitializedRef.current || artists.length === 0) return;
    hasInitializedRef.current = true;

    // Reset refs for fresh initialization
    artistFoldersRef.current = {};
    projectSubfoldersRef.current = {};
    loadingFoldersRef.current = new Set();

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
        notifyArtist: false,
      };
    });

    setItems(initialized);

    // Audio Analysis — run once per file, update only the specific item
    initialized.forEach(item => {
      if (item.mimeGroup === 'audio') {
        detectAudioFeatures(item.file).then(({ bpm, key }) => {
          setItems(prev => prev.map(p => p.id === item.id ? { ...p, bpm, key, isAnalyzing: false } : p));
        });
      }
    });

    // Trigger loading artist folders for detected artists
    const uniqueArtistIds = new Set(initialized.map(i => i.artistId).filter(Boolean));
    uniqueArtistIds.forEach(artistId => {
      loadArtistFolders(artistId);
    });
  }, [initialFiles, artists, preselectedArtistId, preselectedFolderId, loadArtistFolders]);

  // 2. When folder data version changes (new folder data loaded), resolve items
  useEffect(() => {
    if (items.length === 0) return;
    resolveItemsFromFolderData();
  }, [folderDataVersion, resolveItemsFromFolderData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── State Modifiers ─────────────────────────────────────────────────────────
  const updateItem = useCallback((id: string, updates: Partial<SmartUploadFile>) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, ...updates };
      
      // If subType or artistId changes, regenerate the name
      if (updates.subType !== undefined || updates.artistId !== undefined) {
        const subTypeToUse = updates.subType !== undefined ? updates.subType : item.subType;
        const artistIdToUse = updates.artistId !== undefined ? updates.artistId : item.artistId;
        const artistName = artists.find(a => a.id === artistIdToUse)?.name;
        
        updated.customName = generateName(item.file.name, subTypeToUse, artistName);
        
        // Reset resolved folderId so the router effect can pick it up again
        if (!preselectedFolderId && updates.artistId !== undefined && updates.artistId !== item.artistId) {
           updated.projectId = ''; // Reset project if artist changes
           updated.folderId = '';
           // Load folders for the new artist
           loadArtistFolders(updates.artistId);
        } else if (!preselectedFolderId && updates.subType !== undefined) {
           updated.folderId = '';
        }
      }
      
      return updated;
    }));

    // After an item update, trigger resolution on next tick
    setTimeout(() => resolveItemsFromFolderData(), 0);
  }, [artists, preselectedFolderId, loadArtistFolders, resolveItemsFromFolderData]);

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
            bounces.sort((a: any, b: any) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime());
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
    const newlyCreatedFolders = new Map<string, string>(); // 'folderName::parentId' -> 'newFolderId'

    for (const item of itemsToUpload) {
      if (item.uploadStatus === 'cancelled') continue;
      
      let finalFolderId = item.folderId;
      
      if (!finalFolderId) {
        setItems(prev => prev.map(p => p.id === item.id ? { ...p, uploadStatus: 'error', uploadError: 'No target folder resolved' } : p));
        continue;
      }

      setItems(prev => prev.map(p => p.id === item.id ? { ...p, uploadStatus: 'uploading', uploadProgress: 5 } : p));

      // Handle Auto Folder Creation
      if (finalFolderId.startsWith('CREATE_FOLDER::')) {
        const parts = finalFolderId.split('::');
        const fName = parts[1];
        const pId = parts[2];
        const cacheKey = `${fName}::${pId}`;
        if (newlyCreatedFolders.has(cacheKey)) {
          finalFolderId = newlyCreatedFolders.get(cacheKey)!;
        } else {
          try {
            const res = await fetch('/api/folders', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: fName, parentId: pId })
            });
            if (!res.ok) throw new Error('Failed to create folder');
            const data = await res.json();
            finalFolderId = data.folderId || data.id; // Support both just in case
            newlyCreatedFolders.set(cacheKey, finalFolderId);
          } catch (err) {
             setItems(prev => prev.map(p => p.id === item.id ? { ...p, uploadStatus: 'error', uploadError: `Error al crear la subcarpeta: ${fName}` } : p));
             continue;
          }
        }
      }

      let fileToProcess = item.file;
      let finalCustomName = item.customName;
      let extension = item.file.name.substring(item.file.name.lastIndexOf('.'));

      // WAV to MP3 Conversion for Bounces
      if (item.subType === 'bounce' && extension.toLowerCase() === '.wav') {
        try {
          let lastReportedPercent = -1;
          fileToProcess = await convertWavToMp3(item.file, (p) => {
            const newPercent = 5 + Math.floor(p * 0.15); // up to 20%
            if (newPercent !== lastReportedPercent) {
              lastReportedPercent = newPercent;
              setItems(prev => prev.map(it => it.id === item.id ? { ...it, uploadProgress: newPercent } : it));
            }
          });
          extension = '.mp3';
          finalCustomName = finalCustomName.replace(/\.wav$/i, '') + '.mp3';
        } catch (err) {
          console.error('Error converting WAV to MP3', err);
          setItems(prev => prev.map(p => p.id === item.id ? { ...p, uploadStatus: 'error', uploadError: 'Error al convertir WAV a MP3' } : p));
          continue;
        }
      }

      // Pre-check uses the temporary updated item to search the correct folder
      const tempItemForCheck = { ...item, folderId: finalFolderId, file: fileToProcess, customName: finalCustomName };
      const fileToReplaceId = await preCheckItem(tempItemForCheck);

      const ctrl = new AbortController();
      abortControllersRef.current.set(item.id, ctrl);

      try {
        let finalName = finalCustomName;
        if (!finalName.endsWith(extension)) finalName += extension;
        
        const renamedFile = new File([fileToProcess], finalName, { type: fileToProcess.type });

        const sessionRes = await fetch('/api/files/upload-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
             name: finalName,
             mimeType: renamedFile.type || 'application/octet-stream',
             parentId: finalFolderId,
             fileId: fileToReplaceId
          })
        });

        if (!sessionRes.ok) {
           const errData = await sessionRes.json();
           throw new Error(errData.error || 'Failed to create upload session');
        }

        const { uploadUrl } = await sessionRes.json();

        // Real progress logic using XMLHttpRequest
        const itemId = item.id;
        const uploadTask = new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', uploadUrl);
          xhr.setRequestHeader('Content-Type', renamedFile.type || 'application/octet-stream');
          
          let lastXhrPercent = -1;
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const p = Math.round((e.loaded / e.total) * 90); // 10% to 100%
              const clamped = Math.max(10, p);
              if (clamped !== lastXhrPercent) {
                lastXhrPercent = clamped;
                setItems(prev => prev.map(it => it.id === itemId ? { ...it, uploadProgress: clamped } : it));
              }
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              let responseData: any = {};
              try { responseData = JSON.parse(xhr.responseText); } catch (e) {}
              
              setItems(prev => prev.map(it => it.id === itemId ? { ...it, uploadStatus: 'done', uploadProgress: 100, resultId: responseData.id || fileToReplaceId } : it));
              
              // Email notification
              if (item.notifyArtist) {
                const artistData = artists.find(a => a.id === item.artistId);
                if (artistData?.email) {
                  fetch('/api/notifications/master', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      artistEmail: artistData.email,
                      artistName: artistData.name,
                      songName: finalName.replace(/\.[^.]+$/, '').replace(/\[MASTER\]\s*/i, ''),
                      isUpdate: !!fileToReplaceId,
                      downloadLink: ''
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
          xhr.send(renamedFile);
        });

        await uploadTask;
        processedCount++;

      } catch (err: any) {
        if (err.message !== 'Cancelled by user') {
          setItems(prev => prev.map(p => p.id === item.id ? { ...p, uploadStatus: 'error', uploadError: err.message, uploadProgress: 0 } : p));
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
    items.filter(i => i.notifyArtist)
         .map(i => artists.find(a => a.id === i.artistId))
         .filter(a => a && a.email)
  ));

  // Derive folder data from refs for rendering (safe because folderDataVersion triggers re-render)
  const artistFolders = artistFoldersRef.current;

  const modal = (
    <div className="fixed bottom-4 right-4 z-[500] pointer-events-none p-4 flex flex-col items-end justify-end">
      
      <div className={globalStatus === 'idle'
        ? "pointer-events-auto glass w-[500px] max-h-[85vh] rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden shadow-[0_0_40px_rgba(108,92,231,0.15)] animate-in slide-in-from-bottom-4 duration-300"
        : "pointer-events-auto glass w-[380px] max-h-[70vh] rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden shadow-[0_0_40px_rgba(108,92,231,0.15)] transition-all duration-300"}>
        {/* Header - Only show full header in idle, or a mini header in uploading */}
        {globalStatus === 'idle' ? (
          <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0 bg-surface/80 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shadow-inner shrink-0">
                <UploadCloud className="w-5 h-5 text-accent" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-text-primary truncate">Subida Inteligente</h2>
                <p className="text-xs text-text-secondary mt-0.5 truncate">
                  {items.length} archivo{items.length !== 1 ? 's' : ''} detectados automáticamente
                </p>
              </div>
            </div>
            {!isProcessing && (
              <button onClick={() => { abortControllersRef.current.forEach(c => c.abort()); onClose(); }} className="p-2 rounded-lg text-text-secondary hover:text-white hover:bg-surface-elevated transition-colors shrink-0">
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0 bg-surface/80 backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-bold text-text-primary">Subiendo {items.length} archivo{items.length !== 1 ? 's' : ''}</h2>
            </div>
            {allDone && (
              <button onClick={() => { abortControllersRef.current.forEach(c => c.abort()); onClose(); }} className="p-1 rounded-lg text-text-secondary hover:text-white hover:bg-surface-elevated transition-colors">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Files list */}
        <div className={`flex-1 overflow-y-auto ${globalStatus === 'idle' ? 'px-4 py-4 space-y-4' : 'px-4 py-3 space-y-2'} bg-background/30 custom-scrollbar`}>
          {items.map(item => {
            const currentArtistFolders = artistFolders[item.artistId] || [];
            const projectList = currentArtistFolders.filter(f => !['01_Legal_y_Contratos', '02_Diseño_y_Media', '03_Lanzamientos_y_Proyectos', '02_Bounces_y_Grabaciones'].includes(f.name));

            return (
            <div key={item.id} className={`rounded-xl border ${globalStatus === 'idle' ? 'p-4' : 'p-3'} transition-all duration-300 ${item.uploadStatus === 'done' ? 'border-success/40 bg-success/5' : item.uploadStatus === 'error' ? 'border-danger/40 bg-danger/5' : item.uploadStatus === 'cancelled' ? 'border-border/30 bg-surface/30 opacity-50' : 'border-border bg-surface shadow-sm'}`}>
              {/* File row */}
              <div className={`flex items-center gap-3 ${globalStatus === 'idle' ? 'mb-3' : (item.uploadStatus === 'uploading' ? 'mb-2' : '')}`}>
                <div className={`${globalStatus === 'idle' ? 'w-9 h-9' : 'w-8 h-8'} rounded-xl bg-surface-elevated flex items-center justify-center shrink-0 border border-border/50`}>
                  {item.mimeGroup === 'audio' ? <Music className="w-4 h-4 text-accent" /> : item.mimeGroup === 'image' ? <ImageIcon className="w-4 h-4 text-success" /> : <FileIcon className="w-4 h-4 text-text-secondary" />}
                </div>

                <div className="flex-1 min-w-0">
                  <p className={`${globalStatus === 'idle' ? 'text-base' : 'text-xs'} font-semibold text-text-primary truncate`} title={item.file.name}>{item.file.name}</p>
                  
                  {globalStatus === 'idle' && (
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
                  )}
                </div>

                {/* Status icon */}
                <div className="shrink-0 flex items-center gap-2">
                  {item.uploadStatus === 'done' && globalStatus === 'idle' && <span className="text-xs text-success font-medium mr-2">¡Completado!</span>}
                  {item.uploadStatus === 'done' && <CheckCircle2 className={`${globalStatus === 'idle' ? 'w-5 h-5' : 'w-4 h-4'} text-success`} />}
                  {item.uploadStatus === 'error' && <AlertTriangle className={`${globalStatus === 'idle' ? 'w-5 h-5' : 'w-4 h-4'} text-danger`} />}
                  {item.uploadStatus === 'uploading' && (
                    <button onClick={() => cancelItem(item.id)} className="p-1 rounded-full hover:bg-surface-elevated text-text-secondary hover:text-danger transition-colors" title="Cancelar este archivo"><XCircle className={`${globalStatus === 'idle' ? 'w-5 h-5' : 'w-4 h-4'}`} /></button>
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

              {/* Controls - only show when pending and idle */}
              {item.uploadStatus === 'pending' && globalStatus === 'idle' && (
                <div className="grid grid-cols-2 gap-3 mt-2">
                  {/* Select Artist */}
                  <div>
                    <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5">Artista Destino</label>
                    <div className="relative">
                      <select value={item.artistId} onChange={e => updateItem(item.id, { artistId: e.target.value })} className="w-full bg-surface-elevated border border-border/60 rounded-lg pl-3 pr-10 py-2 text-sm focus:ring-1 focus:ring-accent outline-none text-text-primary transition-all hover:border-border appearance-none cursor-pointer">
                        {sortedArtists.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary pointer-events-none" />
                    </div>
                  </div>

                  {/* Select Project (only if it's a mix/master/stem that requires a project) */}
                  <div className={(item.subType === 'bounce' || preselectedFolderId) ? "opacity-50 pointer-events-none" : ""}>
                    <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5">Proyecto asociado</label>
                    <div className="relative">
                      <select value={item.projectId} onChange={e => updateItem(item.id, { projectId: e.target.value })} className="w-full bg-surface-elevated border border-border/60 rounded-lg pl-3 pr-10 py-2 text-sm focus:ring-1 focus:ring-accent outline-none text-text-primary transition-all hover:border-border appearance-none cursor-pointer">
                        {item.subType === 'bounce' ? (
                           <option value="">Carpeta General (Artista)</option>
                        ) : (
                          projectList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)
                        )}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary pointer-events-none" />
                    </div>
                  </div>

                  {item.mimeGroup === 'audio' && (
                    <div>
                      <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5">Tipo de Archivo</label>
                      <div className="relative">
                        <select value={item.subType} onChange={e => updateItem(item.id, { subType: e.target.value as any })} className="w-full bg-surface-elevated border border-border/60 rounded-lg pl-3 pr-10 py-2 text-sm focus:ring-1 focus:ring-accent outline-none text-text-primary transition-all hover:border-border appearance-none cursor-pointer">
                          <option value="bounce">🎵 Bounce (Demo)</option>
                          <option value="mix">🎛️ Mix</option>
                          <option value="master">💿 Master (Final)</option>
                          <option value="stem">🎸 Stem</option>
                          <option value="none">📁 Otro Audio</option>
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary pointer-events-none" />
                      </div>
                    </div>
                  )}

                  {/* Generated name preview */}
                  <div className="col-span-2 flex flex-col">
                    <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5">Nombre final en Drive</label>
                    <input 
                      type="text" 
                      value={item.customName} 
                      onChange={e => updateItem(item.id, { customName: e.target.value })}
                      className="w-full bg-surface border border-border/60 rounded-lg px-3 py-2 text-sm text-text-primary focus:ring-1 focus:ring-accent outline-none"
                    />
                  </div>

                  {/* Notify Artist Toggle */}
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="checkbox"
                      id={`notify-${item.id}`}
                      checked={!!item.notifyArtist}
                      onChange={e => updateItem(item.id, { notifyArtist: e.target.checked })}
                      className="w-4 h-4 rounded border-border/60 text-accent focus:ring-accent bg-surface-elevated"
                    />
                    <label htmlFor={`notify-${item.id}`} className="text-sm text-text-secondary cursor-pointer hover:text-text-primary transition-colors">
                      Avisar al artista por email al finalizar
                    </label>
                  </div>
                </div>
              )}
            </div>
          )})}
        </div>

        {/* Footer */}
        {globalStatus === 'idle' && (
          <div className="px-5 py-4 border-t border-border shrink-0 flex flex-col gap-3 bg-surface/80 backdrop-blur-xl">
            {artistsReceivingEmails.length > 0 && (
              <div className="text-xs text-text-secondary w-full bg-accent/10 px-3 py-2 rounded-lg border border-accent/20 truncate">
                <span className="mr-1">📧</span> Notificando: {artistsReceivingEmails.map(a => a?.name).join(', ')}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 w-full">
              <Button variant="outline" size="sm" onClick={() => { abortControllersRef.current.forEach(c => c.abort()); onClose(); }} disabled={isProcessing}>Cancelar</Button>
              <Button onClick={handleUpload} size="sm" disabled={isProcessing} className="px-5 bg-accent hover:bg-accent-light text-white shadow-lg shadow-accent/20">
                {isProcessing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Subiendo...</> : <><UploadCloud className="w-4 h-4 mr-2" />Subir {items.length}</>}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modal, document.body);
}
