'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Music, Image as ImageIcon, File, UploadCloud, X, AlertTriangle, CheckCircle2, Activity, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { customConfirm } from '@/lib/dialog';
import { createPortal } from 'react-dom';

export interface SmartUploadFile {
  file: File;
  id: string;
  mimeGroup: 'audio' | 'image' | 'video' | 'other';
  subType: 'bounce' | 'master' | 'mix' | 'stem' | 'cover' | 'promo' | 'none';
  folderId: string;
  customName: string;
  // Audio analysis
  bpm?: number | null;
  key?: string | null;
  isAnalyzing?: boolean;
  // Upload state
  uploadStatus?: 'pending' | 'uploading' | 'done' | 'error' | 'cancelled';
  uploadProgress?: number;
  uploadError?: string;
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

    // --- BPM via energy peak detection ---
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
      // Normalize to 60–180 range
      let normalized = rawBpm;
      while (normalized > 180) normalized /= 2;
      while (normalized < 60) normalized *= 2;
      bpm = Math.round(normalized);
    }

    // --- Key detection via frequency analysis (simplified chromagram) ---
    // Take a 10-second sample from the middle of the track
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const start = Math.floor(channelData.length * 0.3);
    const sampleLen = Math.min(sampleRate * 10, channelData.length - start);
    const sample = channelData.slice(start, start + sampleLen);

    const chromagram = new Array(12).fill(0);
    for (let n = 0; n < 12; n++) {
      const freq = 261.63 * Math.pow(2, n / 12); // C4 and up
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
  } else if (subType === 'master') {
    return `[MASTER] ${cleanName}${ext}`;
  } else if (subType === 'mix') {
    return `[MIX] ${cleanName}${ext}`;
  } else if (subType === 'stem') {
    return `[STEM] ${cleanName}${ext}`;
  }

  return original;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function SmartUploadModal({
  files,
  defaultFolderId,
  folders,
  artistName,
  artistEmail,
  artistId,
  onUpload,
  onCancel,
}: {
  files: File[];
  defaultFolderId: string;
  folders: { id: string; name: string }[];
  artistName?: string;
  artistEmail?: string;
  artistId?: string;
  onUpload: () => void;
  onCancel: () => void;
}) {
  const [items, setItems] = useState<SmartUploadFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [globalStatus, setGlobalStatus] = useState<'idle' | 'uploading' | 'done'>('idle');
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  // Initialize items and trigger audio analysis
  useEffect(() => {
    const initial = files.map((f, i) => {
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

      return {
        file: f,
        id: `file-${i}`,
        mimeGroup,
        subType,
        folderId: defaultFolderId,
        customName: generateName(f.name, subType, artistName),
        bpm: undefined,
        key: undefined,
        isAnalyzing: mimeGroup === 'audio',
        uploadStatus: 'pending' as const,
        uploadProgress: 0,
      };
    });
    setItems(initial);

    // Analyze audio files in the background
    initial.forEach(item => {
      if (item.mimeGroup === 'audio') {
        detectAudioFeatures(item.file).then(({ bpm, key }) => {
          setItems(prev => prev.map(p => p.id === item.id
            ? { ...p, bpm, key, isAnalyzing: false }
            : p
          ));
        });
      }
    });
  }, [files, defaultFolderId, artistName]);

  const updateItem = (id: string, updates: Partial<SmartUploadFile>) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, ...updates };
      if (updates.subType !== undefined) {
        updated.customName = generateName(item.file.name, updated.subType, artistName);
      }
      return updated;
    }));
  };

  const cancelItem = (id: string) => {
    const ctrl = abortControllersRef.current.get(id);
    if (ctrl) ctrl.abort();
    updateItem(id, { uploadStatus: 'cancelled', uploadProgress: 0 });
  };

  // ─── Smart Pre-check for existing files ─────────────────────────────────────
  const preCheckItem = async (item: SmartUploadFile): Promise<string | undefined> => {
    if (item.subType !== 'master' && item.subType !== 'bounce') return undefined;

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
            `Hemos detectado ${bounces.length} versión(es) anterior(es) de este Bounce ("${cleanBase}").\n\nLos bounces se acumulan como historial automáticamente.\n\nPresiona Aceptar si prefieres REEMPLAZAR la versión más reciente.`
          );
          if (confirm) {
            const sorted = bounces.sort((a: any, b: any) =>
              new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime()
            );
            return sorted[0].id;
          }
        }
      }
    } catch (e) {
      console.error('Pre-check error', e);
    }
    return undefined;
  };

  // ─── Upload with per-file progress ──────────────────────────────────────────
  const uploadItemWithProgress = async (
    item: SmartUploadFile,
    overwriteId?: string
  ): Promise<boolean> => {
    const ctrl = new AbortController();
    abortControllersRef.current.set(item.id, ctrl);

    updateItem(item.id, { uploadStatus: 'uploading', uploadProgress: 5 });

    const renamedBlob = item.file.slice(0, item.file.size, item.file.type);
    const renamedFile = new File([renamedBlob], item.customName);
    const formData = new FormData();
    formData.append('file', renamedFile);
    formData.append('parentId', item.folderId);
    if (overwriteId) {
      formData.append('overwrite', 'true');
      formData.append('targetFileId', overwriteId);
      formData.append('skipSimilarity', 'true');
    }

    try {
      // XMLHttpRequest for real progress tracking
      const result = await new Promise<boolean>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 90) + 5;
            updateItem(item.id, { uploadProgress: pct });
          }
        });
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(true);
          } else {
            try {
              const errData = JSON.parse(xhr.responseText);
              reject(new Error(errData?.error || 'Error al subir'));
            } catch {
              reject(new Error('Error al subir'));
            }
          }
        });
        xhr.addEventListener('error', () => reject(new Error('Error de red')));
        xhr.addEventListener('abort', () => reject(new Error('cancelled')));

        ctrl.signal.addEventListener('abort', () => xhr.abort());

        xhr.open('POST', '/api/files');
        xhr.send(formData);
      });

      if (result) {
        updateItem(item.id, { uploadStatus: 'done', uploadProgress: 100 });

        // Auto-email notification for Masters
        if (item.subType === 'master' && artistEmail && artistId) {
          const songName = item.file.name
            .replace(/\.[^.]+$/, '')
            .replace(/^\[.*?\]\s*/, '')
            .replace(/^(Master|Bounce|Mix|Stem)_/i, '')
            .trim();
          const isUpdate = !!overwriteId;
          const portalUrl = `${window.location.origin}/portal/${artistId}`;

          fetch('/api/communications/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              artistEmail,
              artistName: artistName || 'Artista',
              projectName: songName,
              message: isUpdate
                ? `El Master Final de "${songName}" ha sido actualizado con una nueva versión. Puedes escucharlo ahora desde tu portal.`
                : `El Master Final de "${songName}" ha sido subido. Ya está disponible en tu portal de cliente.`,
              portalUrl,
            }),
          }).catch(console.error);
        }
      }
      return true;
    } catch (err: any) {
      if (err.message === 'cancelled') {
        updateItem(item.id, { uploadStatus: 'cancelled', uploadProgress: 0 });
      } else {
        updateItem(item.id, { uploadStatus: 'error', uploadError: err.message });
      }
      return false;
    }
  };

  // ─── Main Upload Handler ─────────────────────────────────────────────────────
  const handleUpload = async () => {
    setIsProcessing(true);
    setGlobalStatus('uploading');

    const pendingItems = items.filter(i => i.uploadStatus === 'pending');

    for (const item of pendingItems) {
      // Run smart pre-check (master/bounce detection)
      const overwriteId = await preCheckItem(item);
      await uploadItemWithProgress(item, overwriteId);
    }

    setIsProcessing(false);
    setGlobalStatus('done');
    // Notify parent to refresh file list
    onUpload();
  };

  const allDone = items.every(i => ['done', 'error', 'cancelled'].includes(i.uploadStatus || ''));
  const hasAnyDone = items.some(i => i.uploadStatus === 'done');

  if (items.length === 0) return null;

  const modal = (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div
        className="glass w-full max-w-2xl max-h-[85vh] rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden"
        style={{ minWidth: '540px' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center">
              <UploadCloud className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h2 className="text-base font-bold text-text-primary">Subida Inteligente</h2>
              <p className="text-xs text-text-secondary mt-0.5">
                {items.length} archivo{items.length !== 1 ? 's' : ''} · El sistema detecta tipo, BPM y tonalidad
              </p>
            </div>
          </div>
          {!isProcessing && (
            <button
              onClick={() => { abortControllersRef.current.forEach(c => c.abort()); onCancel(); }}
              className="p-1.5 rounded-lg text-text-secondary hover:text-white hover:bg-surface-elevated transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Files list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {items.map(item => (
            <div
              key={item.id}
              className={`rounded-xl border p-4 transition-all ${
                item.uploadStatus === 'done'
                  ? 'border-success/40 bg-success/5'
                  : item.uploadStatus === 'error'
                  ? 'border-danger/40 bg-danger/5'
                  : item.uploadStatus === 'cancelled'
                  ? 'border-border/30 bg-surface/30 opacity-50'
                  : 'border-border bg-surface'
              }`}
            >
              {/* File row */}
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-surface-elevated flex items-center justify-center shrink-0">
                  {item.mimeGroup === 'audio' ? (
                    <Music className="w-4 h-4 text-accent" />
                  ) : item.mimeGroup === 'image' ? (
                    <ImageIcon className="w-4 h-4 text-success" />
                  ) : (
                    <File className="w-4 h-4 text-text-secondary" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-primary truncate" title={item.file.name}>
                    {item.file.name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs text-text-secondary">
                      {(item.file.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                    {item.mimeGroup === 'audio' && (
                      <>
                        {item.isAnalyzing ? (
                          <span className="text-xs text-accent flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" /> Analizando...
                          </span>
                        ) : (
                          <>
                            {item.bpm && (
                              <span className="text-xs bg-accent/10 text-accent px-1.5 py-0.5 rounded-md font-mono flex items-center gap-1">
                                <Activity className="w-3 h-3" />
                                {item.bpm} BPM
                              </span>
                            )}
                            {item.key && (
                              <span className="text-xs bg-purple-500/10 text-purple-300 px-1.5 py-0.5 rounded-md font-mono">
                                {item.key}
                              </span>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Status icon */}
                <div className="shrink-0">
                  {item.uploadStatus === 'done' && <CheckCircle2 className="w-5 h-5 text-success" />}
                  {item.uploadStatus === 'error' && <AlertTriangle className="w-5 h-5 text-danger" />}
                  {item.uploadStatus === 'uploading' && (
                    <button
                      onClick={() => cancelItem(item.id)}
                      className="p-1 rounded-full hover:bg-surface-elevated text-text-secondary hover:text-danger transition-colors"
                      title="Cancelar este archivo"
                    >
                      <XCircle className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              {item.uploadStatus === 'uploading' && (
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-text-secondary">Subiendo...</span>
                    <span className="text-xs text-accent font-mono">{item.uploadProgress || 0}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-surface-elevated rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all duration-300"
                      style={{ width: `${item.uploadProgress || 0}%` }}
                    />
                  </div>
                </div>
              )}

              {item.uploadStatus === 'error' && (
                <p className="text-xs text-danger mb-2">{item.uploadError || 'Error desconocido'}</p>
              )}

              {/* Controls - only show when pending */}
              {item.uploadStatus === 'pending' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {item.mimeGroup === 'audio' && (
                    <div>
                      <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1">
                        Tipo
                      </label>
                      <select
                        value={item.subType}
                        onChange={e => updateItem(item.id, { subType: e.target.value as any })}
                        className="w-full bg-surface-elevated border border-border/60 rounded-lg px-2 py-1.5 text-sm focus:ring-1 focus:ring-accent outline-none text-text-primary"
                      >
                        <option value="bounce">🎵 Bounce (Demo)</option>
                        <option value="mix">🎛️ Mix</option>
                        <option value="master">💿 Master (Final)</option>
                        <option value="stem">🎸 Stem</option>
                        <option value="none">📁 Otro Audio</option>
                      </select>
                    </div>
                  )}

                  <div className={item.mimeGroup === 'audio' ? 'md:col-span-2' : 'md:col-span-3'}>
                    <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1">
                      Carpeta Destino
                    </label>
                    <select
                      value={item.folderId}
                      onChange={e => updateItem(item.id, { folderId: e.target.value })}
                      className="w-full bg-surface-elevated border border-border/60 rounded-lg px-2 py-1.5 text-sm focus:ring-1 focus:ring-accent outline-none text-text-primary"
                    >
                      {folders.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Generated name preview */}
                  <div className="md:col-span-3">
                    <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1">
                      Nombre final en Drive
                    </label>
                    <div className="flex items-center gap-2 bg-surface-elevated border border-border/40 rounded-lg px-3 py-1.5">
                      <span className="text-xs text-text-primary font-mono truncate">{item.customName}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border shrink-0 flex items-center justify-between gap-3">
          <div className="text-xs text-text-secondary">
            {globalStatus === 'uploading' && (
              <span className="flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
                Subiendo archivos...
              </span>
            )}
            {globalStatus === 'done' && (
              <span className="flex items-center gap-1.5 text-success">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {hasAnyDone ? 'Subida completada' : 'Proceso finalizado'}
              </span>
            )}
            {globalStatus === 'idle' && artistEmail && (
              <span className="flex items-center gap-1 text-accent/70">
                <span>📧</span> Se notificará a {artistName} por Masters
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {allDone ? (
              <Button onClick={onCancel} variant="default">
                Cerrar
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => { abortControllersRef.current.forEach(c => c.abort()); onCancel(); }}
                  disabled={isProcessing}
                >
                  Cancelar todo
                </Button>
                <Button onClick={handleUpload} disabled={isProcessing}>
                  {isProcessing ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Subiendo...</>
                  ) : (
                    <><UploadCloud className="w-4 h-4 mr-2" />Subir {items.length} archivo{items.length !== 1 ? 's' : ''}</>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // Render via portal to always be centered on screen regardless of parent layout
  if (typeof document === 'undefined') return null;
  return createPortal(modal, document.body);
}
