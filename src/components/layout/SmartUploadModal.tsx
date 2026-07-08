'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Music, Image as ImageIcon, File as FileIcon, UploadCloud, X, AlertTriangle, CheckCircle2, Activity, XCircle, ChevronDown, ExternalLink as ExternalLinkIcon, User } from 'lucide-react';
import { detectAudioFeatures } from '@/lib/utils/audio';
import { Button } from '@/components/ui/Button';
import { customConfirm, customPrompt, customAlert } from '@/lib/dialog';
import { cn, formatPhoneNumber, getWhatsAppUrl } from '@/lib/utils';
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
  notifyEmail?: boolean;
  notifyWhatsApp?: boolean;
  // Background Upload
  tempId?: string;
  tempUploadStatus?: 'idle' | 'uploading' | 'success' | 'error';
  abortController?: AbortController;
}

interface SmartUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialFiles: File[];
  preselectedArtistId?: string;
  preselectedFolderId?: string; // If user drops inside DriveExplorer in a specific folder
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
    return `${cleanName} [${dateStr}]${ext}`;
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
  const { activeArtists: artists, isLoading: isArtistsLoading } = useArtists();
  const router = useRouter();
  const [items, setItems] = useState<SmartUploadFile[]>([]);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  const pendingItemsCount = items.filter(i => i.uploadStatus === 'pending').length;
  const isConfiguring = pendingItemsCount > 0;
  
  // Track globally if we've completed the overall queue to auto-close
  const allDone = items.length > 0 && items.every(i => i.uploadStatus === 'done' || i.uploadStatus === 'error' || i.uploadStatus === 'cancelled');

  // Local caching state to avoid infinite loops and multi-fetching
  const [artistFoldersCache, setArtistFoldersCache] = useState<Record<string, any[]>>({});
  const [projectFoldersCache, setProjectFoldersCache] = useState<Record<string, any[]>>({});
  const [artistMatricesCache, setArtistMatricesCache] = useState<Record<string, any[]>>({});
  const [sortedArtists, setSortedArtists] = useState<any[]>([]);
  const [isHovered, setIsHovered] = useState(false);

  // Sort artists by recent interaction or update
  useEffect(() => {
    const sorted = [...artists].sort((a, b) => {
      const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      let accessedA = timeA;
      let accessedB = timeB;
      
      if (typeof window !== 'undefined') {
        const storedA = localStorage.getItem(`accessed_${a.id}`);
        const storedB = localStorage.getItem(`accessed_${b.id}`);
        if (storedA) accessedA = Math.max(accessedA, parseInt(storedA, 10));
        if (storedB) accessedB = Math.max(accessedB, parseInt(storedB, 10));
      }
      return accessedB - accessedA;
    });
    setSortedArtists(sorted);
  }, [artists]);

  // ─── Safe Folder Fetching Methods ───────────────────────────────────────────
  const fetchArtistFolders = async (artistId: string) => {
    if (!artistId) return [];
    if (artistFoldersCache[artistId]) return artistFoldersCache[artistId];
    try {
      const res = await fetch(`/api/files?folderId=${artistId}`);
      if (res.ok) {
        const data = await res.json();
        const folders = (data.items || []).filter((item: any) => item.mimeType === 'application/vnd.google-apps.folder');
        setArtistFoldersCache(prev => ({ ...prev, [artistId]: folders }));
        return folders;
      }
    } catch {}
    return [];
  };

  const fetchProjectFolders = async (projectId: string) => {
    if (!projectId) return [];
    if (projectFoldersCache[projectId]) return projectFoldersCache[projectId];
    try {
      const res = await fetch(`/api/files?folderId=${projectId}`);
      if (res.ok) {
        const data = await res.json();
        const folders = (data.items || []).filter((item: any) => item.mimeType === 'application/vnd.google-apps.folder');
        setProjectFoldersCache(prev => ({ ...prev, [projectId]: folders }));
        return folders;
      }
    } catch {}
    return [];
  };

  const fetchMatrices = async (aId: string) => {
    if (artistMatricesCache[aId]) return artistMatricesCache[aId];
    try {
      const res = await fetch(`/api/artists/${aId}/matrices`);
      if (res.ok) {
        const data = await res.json();
        const matrices = data.matrices || [];
        setArtistMatricesCache(prev => ({ ...prev, [aId]: matrices }));
        return matrices;
      }
    } catch {}
    return [];
  };

  // ─── Initialization ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      setItems([]);
      abortControllersRef.current.clear();
      return;
    }

    if (initialFiles.length === 0 || isArtistsLoading) return;

    const inlineSortedArtists = [...artists].sort((a, b) => {
      const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      let accessedA = timeA;
      let accessedB = timeB;
      
      if (typeof window !== 'undefined') {
        const storedA = localStorage.getItem(`accessed_${a.id}`);
        const storedB = localStorage.getItem(`accessed_${b.id}`);
        if (storedA) accessedA = Math.max(accessedA, parseInt(storedA, 10));
        if (storedB) accessedB = Math.max(accessedB, parseInt(storedB, 10));
      }
      return accessedB - accessedA;
    });

    // Filter out files that are already in the list
    const newFiles = initialFiles.filter(f => !items.some(item => item.file.name === f.name && item.file.size === f.size && item.file.lastModified === f.lastModified));

    if (newFiles.length === 0) return;

    // We keep the old files in the list so the user sees what was already uploaded

    const newInitialized = newFiles.map((f, i) => {
      let mimeGroup: SmartUploadFile['mimeGroup'] = 'other';
      if (f.type.startsWith('audio/')) mimeGroup = 'audio';
      else if (f.type.startsWith('image/')) mimeGroup = 'image';
      else if (f.type.startsWith('video/')) mimeGroup = 'video';

      let subType: 'bounce' | 'master' | 'mix' | 'stem' | 'cover' | 'promo' | 'none' = 'none';
      if (mimeGroup === 'audio') {
        const nl = f.name?.toLowerCase() || '';
        if (nl.includes('master')) subType = 'master';
        else if (nl.includes('bounce') || nl.includes('demo')) subType = 'bounce';
        else if (nl.includes('stem')) subType = 'stem';
        else subType = 'bounce';
      }

      // Initial artist detection
      let detectedArtistId = '';
      let detectedArtistName = '';
      if (preselectedArtistId) {
        detectedArtistId = preselectedArtistId;
        detectedArtistName = artists.find(a => a.id === preselectedArtistId)?.name || '';
      } else {
        const normalizedFile = f.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_-]/g, ' ');
        const squashedFile = normalizedFile.replace(/\s+/g, '');
        
        // Pass 1: Exact substring match (handles regular spacing and underscores mapped to spaces)
        let exactMatch = inlineSortedArtists.find(a => {
           const normArtist = a.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_-]/g, ' ');
           return normalizedFile.includes(normArtist);
        });

        // Pass 2: Squashed match (handles missing spaces in filename e.g. "Amory_Odio" vs "AmoryOdio")
        // Only if artist name is > 3 chars to avoid false positives with short names like 'SAO' in 'pesao'
        if (!exactMatch) {
          exactMatch = inlineSortedArtists.find(a => {
             const squashedArtist = a.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_\-\s]+/g, '');
             if (squashedArtist.length <= 3) return false;
             return squashedFile.includes(squashedArtist);
          });
        }

        if (exactMatch) {
          detectedArtistId = exactMatch.id;
          detectedArtistName = exactMatch.name;
        } else {
          // Pass 3: Fuzzy match (increased threshold to 0.6 to avoid false positives)
          const bestArtistMatch = findBestMatch(normalizedFile, inlineSortedArtists, (a: any) => a?.name?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_-]/g, ' ') || '', 0.6);
          if (bestArtistMatch) {
            detectedArtistId = bestArtistMatch.id;
            detectedArtistName = bestArtistMatch.name;
          } else if (inlineSortedArtists.length > 0) {
            detectedArtistId = inlineSortedArtists[0].id;
            detectedArtistName = inlineSortedArtists[0].name;
          } else if (artists.length > 0) {
            detectedArtistId = artists[0].id;
            detectedArtistName = artists[0].name;
          }
        }
      }

      return {
        file: f,
        id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // ensure unique IDs
        mimeGroup,
        subType,
        artistId: detectedArtistId,
        projectId: preselectedFolderId || '', // Use preselected folder if available
        customName: generateName(f.name, subType, detectedArtistName),
        isAnalyzing: mimeGroup === 'audio',
        uploadStatus: 'pending' as const,
        uploadProgress: 0,
        notifyArtist: false,
        notifyEmail: true,
        notifyWhatsApp: false,
        tempUploadStatus: 'idle' as const,
        abortController: new AbortController(),
      };
    });

    // Start background uploads immediately
    newInitialized.forEach(item => {
      item.tempUploadStatus = 'uploading';
      const formData = new FormData();
      formData.append('file', item.file);
      
      fetch('/api/files/upload/temp', {
        method: 'POST',
        body: formData,
        signal: item.abortController?.signal
      }).then(res => res.json()).then(data => {
        if (data.fileId) {
          setItems(prev => prev.map(p => p.id === item.id ? { ...p, tempUploadStatus: 'success', tempId: data.fileId } : p));
        } else {
          setItems(prev => prev.map(p => p.id === item.id ? { ...p, tempUploadStatus: 'error' } : p));
        }
      }).catch(err => {
        if (err.name !== 'AbortError') {
          setItems(prev => prev.map(p => p.id === item.id ? { ...p, tempUploadStatus: 'error' } : p));
        }
      });
    });

    setItems(prev => [...prev, ...newInitialized]);

    // Asynchronous resolution step (runs once independently per new file)
    newInitialized.forEach(async (item) => {
      // Audio BPM/Key
      if (item.mimeGroup === 'audio') {
        detectAudioFeatures(item.file).then(({ bpm, key }) => {
          setItems(prev => prev.map(p => p.id === item.id ? { ...p, bpm, key, isAnalyzing: false } : p));
        });
      }

      // Auto-detect project if applicable
      if (item.artistId && !preselectedFolderId) {
        fetchMatrices(item.artistId); // Pre-fetch matrices for this artist
        
        const folders = await fetchArtistFolders(item.artistId);
        const ignoreList = ['01_Legal_y_Contratos', '02_Diseño_y_Media', '03_Lanzamientos_y_Proyectos', '02_Bounces_y_Grabaciones'];
        const projects = folders.filter((f: any) => f?.name && !ignoreList.includes(f.name));
        
        if (projects.length > 0) {
          const bestProjectMatch = findBestMatch(item.file.name, projects, (p: any) => p?.name || '', 0.4);
          const guessedProjectId = bestProjectMatch ? bestProjectMatch.id : projects[0].id;
          setItems(prev => prev.map(p => p.id === item.id ? { ...p, projectId: guessedProjectId } : p));
        }
      }
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialFiles, preselectedArtistId, preselectedFolderId, isArtistsLoading, artists]); // Depend on artists so it runs when they load

  // ─── UI Interactions ──────────────────────────────────────────────────────────
  const updateItem = async (id: string, updates: Partial<SmartUploadFile>) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, ...updates };

      if (updates.subType !== undefined || updates.artistId !== undefined) {
        const artistName = artists.find(a => a.id === updated.artistId)?.name;
        updated.customName = generateName(updated.file.name, updated.subType, artistName);
      }

      if (updates.artistId !== undefined && updates.artistId !== item.artistId && !preselectedFolderId) {
        updated.projectId = '';
      }

      return updated;
    }));

    // If artist changed, auto-fetch their projects and guess again
    if (updates.artistId !== undefined) {
       fetchMatrices(updates.artistId); // Pre-fetch matrices for the new artist

       const folders = await fetchArtistFolders(updates.artistId);
       const ignoreList = ['01_Legal_y_Contratos', '02_Diseño_y_Media', '03_Lanzamientos_y_Proyectos', '02_Bounces_y_Grabaciones'];
       const projects = folders.filter((f: any) => f?.name && !ignoreList.includes(f.name));
       if (projects.length > 0) {
         setItems(prev => prev.map(p => {
           if (p.id !== id) return p;
           const bestProjectMatch = findBestMatch(p.file.name, projects, (proj: any) => proj?.name || '', 0.4);
           return { ...p, projectId: bestProjectMatch ? bestProjectMatch.id : projects[0].id };
         }));
       }
    }
  };

  const cancelItem = (id: string) => {
    const item = items.find(i => i.id === id);
    if (item?.abortController) item.abortController.abort();
    const ctrl = abortControllersRef.current.get(id);
    if (ctrl) ctrl.abort();
    updateItem(id, { uploadStatus: 'cancelled', uploadProgress: 0 });
  };

  // ─── Upload Engine ────────────────────────────────────────────────────────────
  const resolveTargetFolderForUpload = async (item: SmartUploadFile): Promise<string> => {
    if (preselectedFolderId) return preselectedFolderId;

    if (item.subType === 'bounce') {
      const aFolders = await fetchArtistFolders(item.artistId);
      const bouncesFolder = aFolders.find((f: any) => f?.name?.toLowerCase()?.includes('bounce') || f?.name === FOLDER_NAME_MAP['Bounces']);
      return bouncesFolder ? bouncesFolder.id : item.artistId;
    }

    if (item.subType === 'master' && item.projectId) return item.projectId;

    if (item.projectId && item.subType !== 'none') {
      const pFolders = await fetchProjectFolders(item.projectId);
      let mappedName = FOLDER_NAME_MAP[item.subType.charAt(0).toUpperCase() + item.subType.slice(1) as keyof typeof FOLDER_NAME_MAP];
      const specificFolder = pFolders.find((f: any) => f?.name?.toLowerCase() === item.subType || f?.name === mappedName);
      return specificFolder ? specificFolder.id : item.projectId;
    }

    return item.artistId || '';
  };

  const preCheckItem = async (item: SmartUploadFile, finalFolderId: string): Promise<string | undefined> => {
    if (item.subType !== 'master') return undefined; // Bounces always create a new file
    if (!finalFolderId || finalFolderId.startsWith('CREATE_FOLDER::')) return undefined;

    try {
      const res = await fetch(`/api/files?folderId=${finalFolderId}`);
      if (!res.ok) return undefined;
      const data = await res.json();
      const existingFiles: any[] = data.items || [];

      // Masters replace the previous file
      if (item.subType === 'master') {
        const itemBaseName = item.customName.toLowerCase().replace(/\.[^.]+$/, '');
        const masters = existingFiles.filter((f: any) => {
          if (!f?.mimeType?.startsWith('audio/')) return false;
          const fBaseName = f.name.toLowerCase().replace(/\.[^.]+$/, '');
          return fBaseName === itemBaseName;
        });
        if (masters.length > 0) {
          return masters[0].id;
        }
      }
    } catch {}
    return undefined;
  };

  const [isHovering, setIsHovering] = useState(false);
  const [visibleCount, setVisibleCount] = useState(20);

  const handleUpload = async () => {
    const itemsToUpload = items.filter(i => i.uploadStatus === 'pending');
    if (itemsToUpload.length === 0) return;

    // Immediately mark them as uploading so they don't get picked up by concurrent calls
    // and so the UI updates to show them in the progress list
    setItems(prev => prev.map(p => itemsToUpload.some(it => it.id === p.id) ? { ...p, uploadStatus: 'uploading', uploadProgress: 0 } : p));

    const newlyCreatedFolders = new Map<string, string>(); // 'folderName::parentId' -> 'newFolderId'

    for (const item of itemsToUpload) {
      if (item.uploadStatus === 'cancelled') continue;
      
      setItems(prev => prev.map(p => p.id === item.id ? { ...p, uploadProgress: 5 } : p));

      try {
        let finalFolderId = await resolveTargetFolderForUpload(item);
        
        if (!finalFolderId) {
          throw new Error('No target folder resolved');
        }

        // Handle Auto Folder Creation
        if (finalFolderId.startsWith('CREATE_FOLDER::')) {
          const parts = finalFolderId.split('::');
          const fName = parts[1];
          const pId = parts[2];
          const cacheKey = `${fName}::${pId}`;
          if (newlyCreatedFolders.has(cacheKey)) {
            finalFolderId = newlyCreatedFolders.get(cacheKey)!;
          } else {
            const res = await fetch('/api/folders', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: fName, parentId: pId })
            });
            if (!res.ok) throw new Error(`Failed to create subfolder: ${fName}`);
            const data = await res.json();
            finalFolderId = data.folderId || data.id; 
            newlyCreatedFolders.set(cacheKey, finalFolderId);
          }
        }

        let fileToProcess = item.file;
        let finalCustomName = item.customName;
        let extension = item.file.name.substring(item.file.name.lastIndexOf('.'));

        // If we can use the background upload
        const canUseBackgroundUpload = item.tempUploadStatus === 'success' && item.tempId && !(item.subType === 'bounce' && extension.toLowerCase() === '.wav');

        if (canUseBackgroundUpload) {
          setItems(prev => prev.map(it => it.id === item.id ? { ...it, uploadProgress: 50 } : it));
          const res = await fetch('/api/files/upload/finalize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              artistId: item.artistId,
              folderType: 'Custom',
              targetFolderId: finalFolderId,
              tempFiles: [{ tempId: item.tempId, originalName: finalCustomName }]
            })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Error finalizando subida');
          
          setItems(prev => prev.map(it => it.id === item.id ? { ...it, uploadStatus: 'done', uploadProgress: 100, resultId: data.files[0].id } : it));
          continue; // Skip the rest of the traditional upload logic
        }

        // WAV to MP3 Conversion for Bounces
        if (item.subType === 'bounce' && extension.toLowerCase() === '.wav') {
          setItems(prev => prev.map(it => it.id === item.id ? { ...it, uploadProgress: 10 } : it));
          
          try {
            const { FFmpeg } = await import('@ffmpeg/ffmpeg');
            const { fetchFile } = await import('@ffmpeg/util');

            const ffmpeg = new FFmpeg();
            
            ffmpeg.on('progress', ({ progress }) => {
              const newPercent = 10 + Math.floor(progress * 20); // 10% to 30% for conversion
              setItems(prev => prev.map(it => it.id === item.id ? { ...it, uploadProgress: newPercent } : it));
            });

            await ffmpeg.load({
              coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
              wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm',
            });

            await ffmpeg.writeFile('input.wav', await fetchFile(item.file));
            await ffmpeg.exec(['-i', 'input.wav', '-b:a', '320k', 'output.mp3']);
            
            const data = await ffmpeg.readFile('output.mp3');
            const mp3Blob = new Blob([data as any], { type: 'audio/mpeg' });
            
            fileToProcess = new File([mp3Blob], item.file.name.replace(/\.wav$/i, '.mp3'), { type: 'audio/mpeg' });
            extension = '.mp3';
            finalCustomName = finalCustomName.replace(/\.wav$/i, '') + '.mp3';
          } catch (ffmpegError) {
            console.error('FFmpeg conversion error:', ffmpegError);
            throw new Error('No se pudo convertir el archivo WAV a MP3. Verifica que el archivo no esté corrupto.');
          }
        }

        const fileToReplaceId = await preCheckItem({ ...item, customName: finalCustomName }, finalFolderId);

        const ctrl = new AbortController();
        abortControllersRef.current.set(item.id, ctrl);

        let finalName = finalCustomName;
        if (!finalName.endsWith(extension)) finalName += extension;
        const renamedFile = new File([fileToProcess], finalName, { type: fileToProcess.type });

        const appProps: any = {};
        if (item.bpm) appProps.bpm = item.bpm.toString();
        if (item.key) appProps.key = item.key;

        const sessionRes = await fetch('/api/files/upload-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
             name: finalName,
             mimeType: renamedFile.type || 'application/octet-stream',
             parentId: finalFolderId,
             fileId: fileToReplaceId,
             appProperties: appProps
          })
        });

        if (!sessionRes.ok) {
           const errData = await sessionRes.json();
           throw new Error(errData.error || 'Failed to create upload session');
        }

        const { uploadUrl } = await sessionRes.json();

        // Real upload via XMLHttpRequest
        const uploadTask = new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', uploadUrl);
          xhr.setRequestHeader('Content-Type', renamedFile.type || 'application/octet-stream');
          
          let lastXhrPercent = -1;
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const p = Math.round((e.loaded / e.total) * 90); // 10% to 100%
              const clamped = Math.max(20, p); // Offset if wav conversion took first 20%
              if (clamped !== lastXhrPercent) {
                lastXhrPercent = clamped;
                setItems(prev => prev.map(it => it.id === item.id ? { ...it, uploadProgress: clamped } : it));
              }
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              let responseData: any = {};
              try { responseData = JSON.parse(xhr.responseText); } catch (e) {}
              
              setItems(prev => prev.map(it => it.id === item.id ? { ...it, uploadStatus: 'done', uploadProgress: 100, resultId: responseData.id || fileToReplaceId } : it));
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

      } catch (err: any) {
        if (err.message !== 'Cancelled by user') {
          setItems(prev => prev.map(p => p.id === item.id ? { ...p, uploadStatus: 'error', uploadError: err.message || 'Error desconocido', uploadProgress: 0 } : p));
        }
      } finally {
        abortControllersRef.current.delete(item.id);
      }
    }
  };

  // Auto-close modal and send batch notifications after completion
  useEffect(() => {
    let timeout: NodeJS.Timeout | null = null;
    if (allDone) {
      
      // Batch notifications
      const successfullyUploadedItems = items.filter(i => i.uploadStatus === 'done' && i.notifyArtist);
      const artistsToNotify = Array.from(new Set(successfullyUploadedItems.map(i => i.artistId)));

      artistsToNotify.forEach(artistId => {
        const artist = artists.find(a => a.id === artistId);
        if (!artist) return;
        
        const artistItems = successfullyUploadedItems.filter(i => i.artistId === artistId);
        
        const shouldEmail = artistItems.some(i => i.notifyEmail);
        const shouldWhatsApp = artistItems.some(i => i.notifyWhatsApp);

        if (!shouldEmail && !shouldWhatsApp) return;

        const fileNames = Array.from(new Set(artistItems.map(i => i.customName.replace(/\.[^.]+$/, ''))));
        const joinedTitles = fileNames.join(', ');
        const portalUrl = `${window.location.origin}/portal/${artist.id}`;

        if (shouldEmail && artist.email) {
          fetch('/api/communications/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              artistEmail: artist.email,
              artistName: artist.name,
              projectName: 'Nuevos archivos subidos',
              message: `He subido nuevas versiones a tu portal: ${joinedTitles}. Revísalas cuando puedas.`,
              portalUrl
            })
          }).catch(console.error);
        }

        if (shouldWhatsApp && artist.phone) {
          const text = `Hola ${artist.name},\n\nHe subido nuevos archivos a tu portal: ${joinedTitles}\n\nPuedes escucharlos directamente en tu portal privado:\n${portalUrl}`;
          window.open(getWhatsAppUrl(artist.phone, text), '_blank');
        }
      });

      if (!isHovered) {
        timeout = setTimeout(() => {
          onClose();
        }, 15000);
      }
    }
    return () => {
      if (timeout) clearTimeout(timeout);
      
      // Cleanup abort controllers and temp files if modal closes while pending
      if (items.some(i => i.uploadStatus === 'pending')) {
        abortControllersRef.current.forEach(ctrl => ctrl.abort());
        items.filter(i => i.uploadStatus === 'pending' && i.tempUploadStatus === 'success' && i.tempId).forEach(item => {
          fetch(`/api/files/upload/temp?id=${item.tempId}`, { method: 'DELETE', keepalive: true }).catch(() => {});
        });
      }
    };
  }, [allDone, isHovered, onClose, items, artists]);

  if (!isOpen || initialFiles.length === 0) return null;
  
  const artistsReceivingEmails = Array.from(new Set(
    items.filter(i => i.notifyArtist)
         .map(i => artists.find(a => a.id === i.artistId))
         .filter(a => a && a.email)
  ));

  const modal = (
    <div 
      className="fixed inset-x-4 bottom-4 md:inset-x-auto md:right-4 z-[500] pointer-events-none flex flex-col items-center md:items-end justify-end"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      
      <div className={isConfiguring
        ? "pointer-events-auto glass w-full sm:w-[500px] max-h-[85vh] rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden shadow-[0_0_40px_rgba(108,92,231,0.15)] animate-in slide-in-from-bottom-4 duration-300"
        : "pointer-events-auto glass w-full sm:w-[380px] max-h-[70vh] rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden shadow-[0_0_40px_rgba(108,92,231,0.15)] transition-all duration-300"}>
        
        {/* Header */}
        {isConfiguring ? (
          <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0 bg-surface/80 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center shadow-inner shrink-0">
                <UploadCloud className="w-5 h-5 text-accent" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-text-primary truncate">Subida Inteligente</h2>
                <p className="text-xs text-text-secondary mt-0.5 truncate">
                  {items.length} archivo{items.length !== 1 ? 's' : ''} detectados
                </p>
              </div>
            </div>
            <button onClick={() => { abortControllersRef.current.forEach(c => c.abort()); onClose(); }} className="p-2 rounded-lg text-text-secondary hover:text-white hover:bg-surface-elevated transition-colors shrink-0">
              <X className="w-5 h-5" />
            </button>
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
        <div 
          className={`flex-1 overflow-y-auto ${isConfiguring ? 'px-4 py-4 space-y-4' : 'px-4 py-3 space-y-2'} bg-background/30 custom-scrollbar`}
          onScroll={(e) => {
            const target = e.currentTarget;
            if (target.scrollHeight - target.scrollTop <= target.clientHeight + 150) {
              if (visibleCount < items.length) {
                setVisibleCount(prev => prev + 20);
              }
            }
          }}
        >
          {items.slice(0, visibleCount).map(item => {
            const currentArtistFolders = artistFoldersCache[item.artistId] || [];
            const projectList = currentArtistFolders.filter((f: any) => f?.name && !['01_Legal_y_Contratos', '02_Diseño_y_Media', '03_Lanzamientos_y_Proyectos', '02_Bounces_y_Grabaciones'].includes(f.name));

            return (
            <div key={item.id} className={`rounded-xl border ${isConfiguring ? 'p-4' : 'p-3'} transition-all duration-300 ${item.uploadStatus === 'done' ? 'border-success/40 bg-success/5' : item.uploadStatus === 'error' ? 'border-danger/40 bg-danger/5' : item.uploadStatus === 'cancelled' ? 'border-border/30 bg-surface/30 opacity-50' : 'border-border bg-surface shadow-sm'}`}>
              <div className={`flex items-center gap-3 ${isConfiguring ? 'mb-3' : (item.uploadStatus === 'uploading' ? 'mb-2' : '')}`}>
                <div className={`${isConfiguring ? 'w-9 h-9' : 'w-8 h-8'} rounded-xl bg-surface-elevated flex items-center justify-center shrink-0 border border-border/50 overflow-hidden relative`}>
                  {item.tempUploadStatus === 'uploading' ? (
                    <div className="absolute inset-0 bg-accent/10 flex flex-col items-center justify-center" title="Subiendo en segundo plano...">
                       <UploadCloud className="w-4 h-4 text-accent animate-pulse" />
                    </div>
                  ) : item.mimeGroup === 'audio' ? <Music className="w-4 h-4 text-accent" /> : item.mimeGroup === 'image' ? <ImageIcon className="w-4 h-4 text-success" /> : <FileIcon className="w-4 h-4 text-text-secondary" />}
                </div>

                <div className="flex-1 min-w-0">
                  <p 
                    className={`${isConfiguring ? 'text-base' : 'text-xs'} font-semibold ${item.uploadStatus === 'done' ? 'text-accent hover:underline cursor-pointer' : 'text-text-primary'} truncate transition-colors`} 
                    title={item.file.name}
                    onClick={() => {
                      if (item.uploadStatus === 'done') {
                         abortControllersRef.current.forEach(c => c.abort()); 
                         onClose();
                         router.push(`/artists/${item.artistId}?tab=files`);
                      }
                    }}
                  >
                    {item.file.name}
                  </p>
                  
                  {isConfiguring && (
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-text-secondary bg-surface-elevated px-2 py-0.5 rounded-md border border-border/50">{(item.file.size / 1024 / 1024).toFixed(1)} MB</span>
                      {item.mimeGroup === 'audio' && (
                        <>
                          {item.isAnalyzing ? (
                            <span className="text-xs text-accent flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Analizando audio...</span>
                          ) : (
                            <>
                              {item.bpm && (() => {
                                const bpmNum = item.bpm;
                                const bpmColor = bpmNum < 80 ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                                 bpmNum < 110 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                 bpmNum < 140 ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                                 'bg-red-500/10 text-red-400 border-red-500/20';
                                return <span className={`text-xs border px-2 py-0.5 rounded-md font-bold font-mono flex items-center gap-1.5 ${bpmColor}`}><Activity className="w-3 h-3" /> {bpmNum} BPM</span>;
                              })()}
                              {item.key && <span className="text-xs bg-violet-500/10 text-violet-400 border border-violet-500/20 px-2 py-0.5 rounded-md font-bold font-mono">{item.key}</span>}
                            </>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Status icon */}
                <div className="shrink-0 flex items-center gap-2">
                  {item.uploadStatus === 'done' && isConfiguring && <span className="text-xs text-success font-medium mr-2">¡Completado!</span>}
                  {item.uploadStatus === 'done' && <CheckCircle2 className={`${isConfiguring ? 'w-5 h-5' : 'w-4 h-4'} text-success`} />}
                  {item.uploadStatus === 'error' && <AlertTriangle className={`${isConfiguring ? 'w-5 h-5' : 'w-4 h-4'} text-danger`} />}
                  {item.uploadStatus === 'uploading' && (
                    <button onClick={() => cancelItem(item.id)} className="p-1 rounded-full hover:bg-surface-elevated text-text-secondary hover:text-danger transition-colors" title="Cancelar este archivo"><XCircle className={`${isConfiguring ? 'w-5 h-5' : 'w-4 h-4'}`} /></button>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              {item.uploadStatus === 'uploading' ? (
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-text-secondary">Subiendo archivo a Drive...</span>
                    <span className="text-xs text-accent font-mono font-bold">{item.uploadProgress || 0}%</span>
                  </div>
                  <div className="w-full h-2 bg-surface-elevated rounded-full overflow-hidden border border-border/50">
                    <div className="h-full bg-gradient-to-r from-accent to-accent-light rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(108,92,231,0.5)]" style={{ width: `${item.uploadProgress || 0}%` }} />
                  </div>
                  <div className="flex justify-end mt-3">
                    <Button 
                      variant="secondary" 
                      size="sm" 
                      className="whitespace-nowrap"
                      onClick={() => {
                        onClose();
                        router.push(`/artists/${item.artistId}`);
                      }}
                    >
                      <User className="w-3.5 h-3.5 mr-1.5" />
                      Abrir Perfil
                    </Button>
                  </div>
                </div>
              ) : item.uploadStatus === 'done' && (
                <div className="flex flex-col gap-2 mt-3 w-full">
                  <div className="flex items-center justify-center gap-2 text-emerald-500 bg-emerald-500/10 px-3 py-2 rounded-lg w-full border border-emerald-500/20">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span className="text-sm font-semibold">Subida completada</span>
                  </div>
                  
                  <div className="flex items-center gap-2 w-full">
                    <Button 
                      variant="secondary" 
                      size="sm" 
                      className="flex-1"
                      onClick={() => {
                        onClose();
                        router.push(`/artists/${item.artistId}`);
                      }}
                    >
                      <User className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                      Ver Perfil
                    </Button>

                    {/* Option to Open Matrix if linked */}
                    {(() => {
                      if (!item.projectId) return null;
                      const linkedMatrix = artistMatricesCache[item.artistId]?.find(m => m.projectId === item.projectId);
                      if (!linkedMatrix) return null;
                      
                      return (
                        <Button 
                          variant="secondary" 
                          size="sm" 
                          className="flex-1"
                          onClick={() => {
                            onClose();
                            router.push(`/artists/${item.artistId}?tab=matrices&matrixId=${linkedMatrix.id}`);
                          }}
                        >
                          <ExternalLinkIcon className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                          Ver Matriz
                        </Button>
                      );
                    })()}
                  </div>
                </div>
              )}

              {item.uploadStatus === 'error' && <p className="text-xs text-danger mb-2 bg-danger/10 p-2 rounded-lg border border-danger/20">{item.uploadError || 'Error desconocido'}</p>}

              {/* Controls */}
              {item.uploadStatus === 'pending' && isConfiguring && (
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div>
                    <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5">Artista Destino</label>
                    <select value={item.artistId} onChange={e => updateItem(item.id, { artistId: e.target.value })} className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors text-text-primary">
                      {sortedArtists.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>

                  <div className={item.subType === 'bounce' ? "opacity-50 pointer-events-none" : ""}>
                    <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5">Proyecto asociado</label>
                    <select 
                      value={item.projectId} 
                      onChange={async e => {
                        if (e.target.value === '__NEW__') {
                          const projName = await customPrompt('Introduce el nombre del nuevo proyecto:', '', 'Nuevo Proyecto');
                          if (!projName || !projName.trim()) {
                            // User cancelled, reset visually to original state by triggering a no-op update
                            updateItem(item.id, {});
                            return;
                          }
                          try {
                            const res = await fetch('/api/folders', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ name: projName.trim(), parentId: item.artistId })
                            });
                            if (!res.ok) throw new Error('Error al crear proyecto');
                            const data = await res.json();
                            const newFolderId = data.folderId || data.id;
                            
                            setArtistFoldersCache(prev => {
                              const existing = prev[item.artistId] || [];
                              return {
                                ...prev,
                                [item.artistId]: [...existing, { id: newFolderId, name: projName.trim(), mimeType: 'application/vnd.google-apps.folder' }]
                              };
                            });
                            
                            updateItem(item.id, { projectId: newFolderId });
                            customAlert('Proyecto creado correctamente');
                          } catch (err) {
                            customAlert('Error al crear el proyecto. Revisa tu conexión.');
                            updateItem(item.id, {});
                          }
                        } else {
                          updateItem(item.id, { projectId: e.target.value });
                        }
                      }} 
                      className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors text-text-primary"
                    >
                      {item.subType === 'bounce' ? (
                         <option value="">Carpeta General (Artista)</option>
                      ) : (
                        <>
                          <option value="">(Selecciona un proyecto)</option>
                          {projectList.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          <option value="__NEW__" className="font-bold text-accent">+ Crear nuevo proyecto...</option>
                        </>
                      )}
                    </select>
                  </div>

                  {item.mimeGroup === 'audio' && (
                    <div>
                      <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5">Tipo de Archivo</label>
                      <select value={item.subType} onChange={e => updateItem(item.id, { subType: e.target.value as any })} className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors text-text-primary">
                        <option value="bounce">🎵 Bounce (Demo)</option>
                        <option value="mix">🎛️ Mix</option>
                        <option value="master">💿 Master (Final)</option>
                        <option value="stem">✂️ Stem / Pista</option>
                        <option value="none">📄 Ninguno (Subir tal cual)</option>
                      </select>
                    </div>
                  )}

                  <div className="col-span-2 flex flex-col">
                    <label className="block text-xs font-bold text-text-secondary uppercase tracking-wider mb-1.5">Nombre final en Drive</label>
                    <input 
                      type="text" 
                      value={item.customName} 
                      onChange={e => updateItem(item.id, { customName: e.target.value })}
                      className="w-full bg-surface border border-border/60 rounded-lg px-3 py-2 text-sm text-text-primary focus:ring-1 focus:ring-accent outline-none"
                    />
                  </div>

                  <div className="flex flex-col gap-2 mt-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`notify-${item.id}`}
                        checked={!!item.notifyArtist}
                        onChange={e => updateItem(item.id, { notifyArtist: e.target.checked, notifyEmail: false, notifyWhatsApp: false })}
                        className="w-4 h-4 rounded border-border/60 text-accent focus:ring-accent bg-surface-elevated"
                      />
                      <label htmlFor={`notify-${item.id}`} className="text-sm font-medium text-text-primary cursor-pointer hover:text-accent transition-colors">
                        Notificar al artista tras subir
                      </label>
                    </div>

                    {item.notifyArtist && (
                      <div className="ml-6 pl-4 border-l-2 border-border/50 flex flex-col gap-3">
                        
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`notify-email-${item.id}`}
                            checked={!!item.notifyEmail}
                            onChange={e => updateItem(item.id, { notifyEmail: e.target.checked })}
                            className="w-3.5 h-3.5 rounded border-border/60 text-blue-500 focus:ring-blue-500 bg-surface-elevated"
                          />
                          <label htmlFor={`notify-email-${item.id}`} className="text-sm text-text-secondary cursor-pointer">
                            Enviar Email
                          </label>
                          {(() => {
                            const currentArtist = artists.find(a => a.id === item.artistId);
                            if (currentArtist && !currentArtist.email) {
                              return (
                                <span 
                                  className="text-xs text-red-400 bg-red-400/10 px-2 py-0.5 rounded cursor-pointer hover:bg-red-400/20"
                                  onClick={async () => {
                                    const newEmail = await customPrompt('El artista no tiene email. Introduce uno nuevo:', '', 'Añadir Email');
                                    if (newEmail && newEmail.trim()) {
                                      try {
                                        await fetch(`/api/artists/${item.artistId}`, {
                                          method: 'PUT',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ email: newEmail.trim() })
                                        });
                                        customAlert('Email guardado correctamente. Recarga la lista o sube otro archivo para que se actualice globalmente, pero para esta sesión ya está guardado en base de datos.');
                                        // Update local state temporarily so it works for the batch
                                        currentArtist.email = newEmail.trim(); 
                                      } catch {}
                                    }
                                  }}
                                >
                                  Sin Email (Añadir)
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`notify-wa-${item.id}`}
                            checked={!!item.notifyWhatsApp}
                            onChange={e => updateItem(item.id, { notifyWhatsApp: e.target.checked })}
                            className="w-3.5 h-3.5 rounded border-border/60 text-green-500 focus:ring-green-500 bg-surface-elevated"
                          />
                          <label htmlFor={`notify-wa-${item.id}`} className="text-sm text-text-secondary cursor-pointer">
                            Aviso WhatsApp
                          </label>
                          {(() => {
                            const currentArtist = artists.find(a => a.id === item.artistId);
                            if (currentArtist && !currentArtist.phone) {
                              return (
                                <span 
                                  className="text-xs text-red-400 bg-red-400/10 px-2 py-0.5 rounded cursor-pointer hover:bg-red-400/20"
                                  onClick={async () => {
                                    const newPhone = await customPrompt('El artista no tiene teléfono. Introduce uno nuevo:', '+34 ', 'Añadir Teléfono');
                                    if (newPhone && newPhone.trim()) {
                                      try {
                                        const finalPhone = formatPhoneNumber(newPhone.trim());
                                        await fetch(`/api/artists/${item.artistId}`, {
                                          method: 'PUT',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ phone: finalPhone })
                                        });
                                        customAlert('Teléfono guardado correctamente.');
                                        currentArtist.phone = finalPhone; 
                                      } catch {}
                                    }
                                  }}
                                >
                                  Sin Teléfono (Añadir)
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )})}
        </div>

        {/* Footer */}
        {isConfiguring && (
          <div className="px-5 py-4 border-t border-border shrink-0 flex flex-col gap-3 bg-surface/80 backdrop-blur-xl">
            {artistsReceivingEmails.length > 0 && (
              <div className="text-xs text-text-secondary w-full bg-accent/10 px-3 py-2 rounded-lg border border-accent/20 truncate">
                <span className="mr-1">📧</span> Notificando: {artistsReceivingEmails.map(a => a?.name).join(', ')}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 w-full">
              <Button variant="outline" size="sm" onClick={() => { abortControllersRef.current.forEach(c => c.abort()); onClose(); }}>Cancelar todo</Button>
              <Button onClick={handleUpload} size="sm" disabled={pendingItemsCount === 0} className="px-5 bg-accent hover:bg-accent-light text-white shadow-lg shadow-accent/20">
                <UploadCloud className="w-4 h-4 mr-2" />
                Subir {pendingItemsCount} nuevo{pendingItemsCount !== 1 ? 's' : ''} archivo{pendingItemsCount !== 1 ? 's' : ''}
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
