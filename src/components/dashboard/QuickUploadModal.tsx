'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';
import { Loader2, UploadCloud, CheckCircle2, AlertCircle, X, Clock } from 'lucide-react';

import type { Artist } from '@/types';
import { findBestMatch, getNormalizedBaseName } from '@/lib/utils';
import { FOLDER_NAME_MAP } from '@/lib/constants';

const FOLDER_OPTIONS = ['Bounces', 'Mix', 'Master', 'Sessions', 'Other'] as const;
type FolderType = typeof FOLDER_OPTIONS[number];

type Step = 1 | 2 | 3;

interface UploadState {
  status: 'idle' | 'uploading' | 'success' | 'error';
  progress: number;
  message: string;
}

interface SelectedFileItem {
  file: File;
  id: string;
}

interface QuickUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  artists: Artist[];
}

export function QuickUploadModal({ isOpen, onClose, artists }: QuickUploadModalProps) {
  const [step, setStep] = useState<Step>(1);
  const [selectedArtistId, setSelectedArtistId] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<FolderType | ''>('');
  
  const [selectedFiles, setSelectedFiles] = useState<SelectedFileItem[]>([]);
  const [scheduleDelete, setScheduleDelete] = useState(false);
  const [expiresInMs, setExpiresInMs] = useState<number>(24 * 60 * 60 * 1000);

  const [uploadState, setUploadState] = useState<UploadState>({
    status: 'idle',
    progress: 0,
    message: '',
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  // Sort artists by updatedAt descending
  const sortedArtists = [...artists].sort((a, b) => {
    const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return timeB - timeA;
  });

  // Default to the most recently updated artist when opening
  useEffect(() => {
    if (isOpen && !selectedArtistId && sortedArtists.length > 0) {
      setSelectedArtistId(sortedArtists[0].id);
    }
  }, [isOpen, selectedArtistId, sortedArtists]);

  const reset = () => {
    setStep(1);
    setSelectedArtistId('');
    setSelectedFolder('');
    setScheduleDelete(false);
    setExpiresInMs(24 * 60 * 60 * 1000);
    setSelectedFiles([]);
    setUploadState({ status: 'idle', progress: 0, message: '' });
    abortControllersRef.current.forEach(c => c.abort());
    abortControllersRef.current.clear();
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (sortedArtists.length > 0) {
      setSelectedArtistId(sortedArtists[0].id);
    }
  };

  const handleClose = () => {
    abortControllersRef.current.forEach(c => c.abort());
    reset();
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files).map(f => ({
        file: f,
        id: `qf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      }));
      
      setSelectedFiles(prev => [...prev, ...newFiles]);

      const fileName = newFiles[0].file.name;
      const normalizedName = getNormalizedBaseName(fileName).toLowerCase();
      
      const exactMatch = sortedArtists.find(a => normalizedName.includes(a.name.toLowerCase()));
      if (exactMatch) {
        setSelectedArtistId(exactMatch.id);
      } else {
        const bestMatch = findBestMatch(fileName, sortedArtists, a => a.name, 0.5);
        if (bestMatch) {
          setSelectedArtistId(bestMatch.id);
        }
      }
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const resolveTargetFolder = async (artistId: string, folderType: FolderType): Promise<string> => {
    try {
      const res = await fetch(`/api/files?folderId=${artistId}`);
      if (!res.ok) return artistId;
      const data = await res.json();
      const subfolders: any[] = (data.items || []).filter((i: any) => i.mimeType === 'application/vnd.google-apps.folder');

      const mappedName = FOLDER_NAME_MAP[folderType] || folderType;

      if (folderType === 'Bounces') {
        const match = subfolders.find((f) => f.name?.toLowerCase().includes('bounce') || f.name === mappedName);
        if (match) return match.id;
        return artistId;
      }

      const directMatch = subfolders.find((f) => f.name === folderType || f.name === mappedName || f.name?.toLowerCase().includes(folderType.toLowerCase()));
      if (directMatch) return directMatch.id;

      for (const sub of subfolders) {
        if (!['01_Legal_y_Contratos', '02_Diseño_y_Media', '03_Lanzamientos_y_Proyectos', '02_Bounces_y_Grabaciones'].includes(sub.name)) {
          const pRes = await fetch(`/api/files?folderId=${sub.id}`);
          if (pRes.ok) {
            const pData = await pRes.json();
            const pFolders: any[] = (pData.items || []).filter((i: any) => i.mimeType === 'application/vnd.google-apps.folder');
            const pMatch = pFolders.find((f) => f.name === folderType || f.name === mappedName || f.name?.toLowerCase().includes(folderType.toLowerCase()));
            if (pMatch) return pMatch.id;
          }
        }
      }
    } catch {}
    return artistId;
  };

  const handleUpload = useCallback(async () => {
    if (!selectedArtistId || !selectedFolder || selectedFiles.length === 0) return;

    setUploadState({ status: 'uploading', progress: 5, message: 'Preparando subida a Drive...' });

    const expirationTimestamp = scheduleDelete && expiresInMs ? Date.now() + expiresInMs : null;

    try {
      const targetFolderId = await resolveTargetFolder(selectedArtistId, selectedFolder);

      let completedCount = 0;
      for (let i = 0; i < selectedFiles.length; i++) {
        const { file, id } = selectedFiles[i];
        
        const appProps: any = {};
        if (scheduleDelete && expiresInMs) {
          appProps.expiresAt = (Date.now() + expiresInMs).toString();
        }

        const sessionRes = await fetch('/api/files/upload-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
             name: file.name,
             mimeType: file.type || 'application/octet-stream',
             parentId: targetFolderId,
             appProperties: appProps
          })
        });

        if (!sessionRes.ok) {
          const errData = await sessionRes.json().catch(() => ({}));
          throw new Error(errData.error || `Error al preparar subida para ${file.name}`);
        }

        const { uploadUrl } = await sessionRes.json();

        const ctrl = new AbortController();
        abortControllersRef.current.set(id, ctrl);

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', uploadUrl);
          xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
          
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && e.total > 0) {
              const filePercent = (e.loaded / e.total);
              const overallPercent = Math.min(99, Math.round(((i + filePercent) / selectedFiles.length) * 100));
              setUploadState({
                status: 'uploading',
                progress: overallPercent,
                message: `Subiendo ${i + 1} de ${selectedFiles.length}: ${file.name} (${Math.round(filePercent * 100)}%)...`
              });
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              let responseData: any = {};
              try { responseData = JSON.parse(xhr.responseText); } catch {}
              const uploadedResultId = responseData.id;
              if (scheduleDelete && expiresInMs && uploadedResultId) {
                fetch(`/api/files/${uploadedResultId}/expiration`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ expiresInMs })
                }).catch(console.error);
              }
              completedCount++;
              resolve();
            } else {
              reject(new Error(xhr.responseText || `Error al subir ${file.name}`));
            }
          };

          xhr.onerror = () => reject(new Error('Error de conexión con Google Drive'));
          xhr.onabort = () => reject(new Error('Subida cancelada'));
          
          ctrl.signal.addEventListener('abort', () => xhr.abort());
          xhr.send(file);
        });
      }

      window.dispatchEvent(new CustomEvent('recentfiles:refresh'));

      setUploadState({
        status: 'success',
        progress: 100,
        message: `${completedCount} archivo${completedCount > 1 ? 's' : ''} subido${completedCount > 1 ? 's' : ''} correctamente en ${selectedFolder}.`,
      });
    } catch (err: any) {
      setUploadState({
        status: 'error',
        progress: 0,
        message: err.message || 'Error desconocido al subir archivos.',
      });
    }
  }, [selectedArtistId, selectedFolder, selectedFiles, scheduleDelete, expiresInMs]);


  const selectedArtist = artists.find((a) => a.id === selectedArtistId);

  const stepTitles = {
    1: 'Subida Rápida — Selecciona Artista',
    2: 'Subida Rápida — Selecciona Carpeta',
    3: 'Subida Rápida — Selecciona Archivos',
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={stepTitles[step]}
      description={
        step === 1
          ? 'Elige el artista cuya carpeta de Drive recibirá los archivos.'
          : step === 2
          ? `Artista: ${selectedArtist?.name}. ¿A qué carpeta quieres subir?`
          : `Artista: ${selectedArtist?.name} · Carpeta: ${selectedFolder}`
      }
      className="max-w-md"
    >
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {([1, 2, 3] as Step[]).map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border transition-colors ${
                s < step
                  ? 'bg-success border-success text-white'
                  : s === step
                  ? 'bg-accent border-accent text-white'
                  : 'bg-surface border-border text-text-secondary'
              }`}
            >
              {s < step ? '✓' : s}
            </div>
            {s < 3 && (
              <div className={`h-px w-8 transition-colors ${s < step ? 'bg-success' : 'bg-border'}`} />
            )}
          </div>
        ))}
      </div>

      {/* STEP 1: Select Artist */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="artist-select">Artista</Label>
            {artists.length === 0 ? (
              <p className="text-sm text-text-secondary py-4 text-center border border-dashed border-border rounded-lg">
                No hay artistas. Crea uno primero.
              </p>
            ) : (
              <select
                id="artist-select"
                value={selectedArtistId}
                onChange={(e) => setSelectedArtistId(e.target.value)}
                className="w-full h-10 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="">— Selecciona un artista —</option>
                {sortedArtists.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={() => setStep(2)}
              disabled={!selectedArtistId}
            >
              Siguiente →
            </Button>
          </div>
        </div>
      )}

      {/* STEP 2: Select Folder */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {FOLDER_OPTIONS.map((folder) => (
              <button
                key={folder}
                onClick={() => setSelectedFolder(folder)}
                className={`p-4 rounded-xl border text-left transition-all duration-200 ${
                  selectedFolder === folder
                    ? 'border-accent/60 bg-accent/10 text-accent-light'
                    : 'border-border bg-surface hover:border-accent/30 text-text-primary'
                }`}
              >
                <div className="font-medium text-sm">{folder}</div>
                <div className="text-xs text-text-secondary mt-0.5">
                  {folder === 'Bounces' && 'Mezclas de trabajo'}
                  {folder === 'Mix' && 'Mezcla final'}
                  {folder === 'Master' && 'Master final'}
                  {folder === 'Sessions' && 'Sesiones de estudio'}
                  {folder === 'Other' && 'Otros archivos'}
                </div>
              </button>
            ))}
          </div>

          <div className="flex justify-between pt-2">
            <Button variant="ghost" onClick={() => setStep(1)}>
              ← Atrás
            </Button>
            <Button onClick={() => setStep(3)} disabled={!selectedFolder}>
              Siguiente →
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3: Select & Upload Files */}
      {step === 3 && (
        <div className="space-y-4">
          {uploadState.status === 'success' ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="w-12 h-12 text-success" />
              <p className="text-text-primary font-medium">{uploadState.message}</p>
              <div className="flex gap-3 mt-2">
                <Button variant="ghost" onClick={handleClose}>Cerrar</Button>
                <Button onClick={reset}>Subir más archivos</Button>
              </div>
            </div>
          ) : uploadState.status === 'error' ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <AlertCircle className="w-10 h-10 text-error" />
              <p className="text-error text-sm">{uploadState.message}</p>
              <Button
                variant="outline"
                onClick={() => setUploadState({ status: 'idle', progress: 0, message: '' })}
              >
                Reintentar
              </Button>
            </div>
          ) : (
            <>
              {/* Drop zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-accent/50 hover:bg-accent/5 transition-all"
              >
                <UploadCloud className="w-8 h-8 text-text-secondary mx-auto mb-2" />
                <p className="text-sm text-text-secondary">
                  Haz click para seleccionar archivos de audio
                </p>
                <p className="text-xs text-text-secondary mt-1 opacity-60">
                  MP3, WAV, FLAC, AAC, OGG — múltiples archivos permitidos
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  multiple
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              {/* File list */}
              {selectedFiles.length > 0 && (
                <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                  {selectedFiles.map((item, i) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-surface border border-border"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm text-text-primary truncate">{item.file.name}</span>
                        <span className="text-xs text-text-secondary">({(item.file.size / 1024 / 1024).toFixed(1)} MB)</span>
                      </div>
                      <button
                        onClick={() => removeFile(i)}
                        disabled={uploadState.status === 'uploading'}
                        className="text-text-secondary hover:text-error shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Scheduled deletion option */}
              {selectedFiles.length > 0 && (

                <div className="p-3 bg-surface rounded-xl border border-border/60 space-y-2 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs font-semibold text-text-primary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={scheduleDelete}
                        onChange={(e) => setScheduleDelete(e.target.checked)}
                        className="w-4 h-4 rounded text-accent focus:ring-accent bg-surface-elevated cursor-pointer"
                      />
                      <Clock className="w-3.5 h-3.5 text-accent" />
                      Eliminado programado (Autodestrucción)
                    </label>
                    {scheduleDelete && (
                      <span className="text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full border border-accent/20">
                        Activo
                      </span>
                    )}
                  </div>

                  {scheduleDelete && (
                    <div className="pt-1.5 border-t border-border/40 space-y-1.5">
                      <p className="text-[11px] text-text-secondary">¿Cuándo deben eliminarse estos archivos?</p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { label: '1 hora', ms: 60 * 60 * 1000 },
                          { label: '6 horas', ms: 6 * 60 * 60 * 1000 },
                          { label: '24 horas', ms: 24 * 60 * 60 * 1000 },
                          { label: '3 días', ms: 3 * 24 * 60 * 60 * 1000 },
                          { label: '7 días', ms: 7 * 24 * 60 * 60 * 1000 },
                          { label: '30 días', ms: 30 * 24 * 60 * 60 * 1000 },
                        ].map((opt) => (
                          <button
                            key={opt.label}
                            type="button"
                            onClick={() => setExpiresInMs(opt.ms)}
                            className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all text-center ${
                              expiresInMs === opt.ms
                                ? 'bg-accent text-white border-accent shadow-sm'
                                : 'bg-surface-elevated border-border/60 text-text-secondary hover:border-accent/40 hover:text-text-primary'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}


              {/* Upload progress bar */}
              {uploadState.status === 'uploading' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-text-secondary">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {uploadState.message}
                  </div>
                  <div className="h-1.5 rounded-full bg-border overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all duration-500"
                      style={{ width: `${uploadState.progress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-between pt-2">
                <Button
                  variant="ghost"
                  onClick={() => setStep(2)}
                  disabled={uploadState.status === 'uploading'}
                >
                  ← Atrás
                </Button>
                <Button
                  onClick={handleUpload}
                  disabled={selectedFiles.length === 0 || uploadState.status === 'uploading'}
                  className="gap-2"
                >
                  {uploadState.status === 'uploading' ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Subiendo a Drive...</>
                  ) : (
                    <><CheckCircle2 className="w-4 h-4" /> Subir a {selectedFolder || 'Drive'}</>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
