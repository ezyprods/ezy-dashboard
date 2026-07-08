'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';
import { Loader2, UploadCloud, CheckCircle2, AlertCircle, X, Music } from 'lucide-react';
import type { Artist } from '@/types';
import { findBestMatch, getNormalizedBaseName } from '@/lib/utils';

const FOLDER_OPTIONS = ['Bounces', 'Mix', 'Master', 'Sessions', 'Other'] as const;
type FolderType = typeof FOLDER_OPTIONS[number];

type Step = 1 | 2 | 3;

interface UploadState {
  status: 'idle' | 'uploading' | 'success' | 'error';
  progress: number;
  message: string;
}

interface TempUpload {
  originalFile: File;
  tempId?: string;
  status: 'uploading' | 'success' | 'error';
  abortController: AbortController;
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
  
  const [tempUploads, setTempUploads] = useState<TempUpload[]>([]);

  const [uploadState, setUploadState] = useState<UploadState>({
    status: 'idle',
    progress: 0,
    message: '',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const cleanupTempUploads = useCallback((uploadsToClean: TempUpload[]) => {
    uploadsToClean.forEach((upload) => {
      if (upload.status === 'uploading') {
        upload.abortController.abort();
      } else if (upload.status === 'success' && upload.tempId) {
        fetch(`/api/files/upload/temp?id=${upload.tempId}`, { 
          method: 'DELETE',
          keepalive: true // Ensure it runs even if modal is closing / navigating away
        }).catch(console.error);
      }
    });
  }, []);

  // Cleanup on unmount if modal is somehow closed
  useEffect(() => {
    return () => {
      if (tempUploads.length > 0 && uploadState.status !== 'success') {
        cleanupTempUploads(tempUploads);
      }
    };
  }, [tempUploads, cleanupTempUploads, uploadState.status]);

  const reset = () => {
    setStep(1);
    setSelectedArtistId('');
    setSelectedFolder('');
    setTempUploads([]);
    setUploadState({ status: 'idle', progress: 0, message: '' });
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (sortedArtists.length > 0) {
      setSelectedArtistId(sortedArtists[0].id);
    }
  };

  const handleClose = () => {
    if (uploadState.status !== 'success') {
      cleanupTempUploads(tempUploads);
    }
    reset();
    onClose();
  };

  const startTempUpload = async (file: File) => {
    const abortController = new AbortController();
    const tempUpload: TempUpload = {
      originalFile: file,
      status: 'uploading',
      abortController,
    };

    setTempUploads(prev => [...prev, tempUpload]);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/files/upload/temp', {
        method: 'POST',
        body: formData,
        signal: abortController.signal,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setTempUploads(prev => prev.map(u => 
        u.abortController === abortController 
          ? { ...u, status: 'success', tempId: data.fileId }
          : u
      ));
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setTempUploads(prev => prev.map(u => 
          u.abortController === abortController 
            ? { ...u, status: 'error' }
            : u
        ));
      } else {
        setTempUploads(prev => prev.filter(u => u.abortController !== abortController));
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      
      newFiles.forEach(file => startTempUpload(file));

      // Auto-detect artist from first filename if not already manually selected
      // But since we default to the first one, we might overwrite it. 
      // Let's only auto-detect if the user hasn't explicitly chosen one (we assume if it's exactly the first one, maybe they didn't).
      // For safety, we can just do the fuzzy match anyway, as it's a helpful feature.
      const fileName = newFiles[0].name;
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
    setTempUploads((prev) => {
      const uploadToRemove = prev[index];
      if (uploadToRemove) {
        cleanupTempUploads([uploadToRemove]);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleUpload = useCallback(async () => {
    if (!selectedArtistId || !selectedFolder || tempUploads.length === 0) return;

    // Verify all are uploaded successfully
    const allSuccess = tempUploads.every(u => u.status === 'success');
    if (!allSuccess) return;

    setUploadState({ status: 'uploading', progress: 50, message: 'Organizando archivos...' });

    const tempFilesData = tempUploads.map(u => ({
      tempId: u.tempId,
      originalName: u.originalFile.name
    }));

    try {
      const res = await fetch('/api/files/upload/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artistId: selectedArtistId,
          folderType: selectedFolder,
          tempFiles: tempFilesData
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al organizar los archivos');
      }

      setUploadState({
        status: 'success',
        progress: 100,
        message: `${data.files.length} archivo${data.files.length > 1 ? 's' : ''} organizado${data.files.length > 1 ? 's' : ''} correctamente en ${selectedFolder}.`,
      });
    } catch (err: any) {
      setUploadState({
        status: 'error',
        progress: 0,
        message: err.message || 'Error desconocido al finalizar subida.',
      });
    }
  }, [selectedArtistId, selectedFolder, tempUploads]);

  const selectedArtist = artists.find((a) => a.id === selectedArtistId);

  const stepTitles = {
    1: 'Subida Rápida — Selecciona Artista',
    2: 'Subida Rápida — Selecciona Carpeta',
    3: 'Subida Rápida — Selecciona Archivos',
  };

  const isUploadingAny = tempUploads.some(u => u.status === 'uploading');
  const hasErrors = tempUploads.some(u => u.status === 'error');

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
              {tempUploads.length > 0 && (
                <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                  {tempUploads.map((upload, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-surface border border-border"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {upload.status === 'uploading' ? (
                           <Loader2 className="w-4 h-4 text-accent shrink-0 animate-spin" />
                        ) : upload.status === 'error' ? (
                           <AlertCircle className="w-4 h-4 text-error shrink-0" />
                        ) : (
                           <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                        )}
                        <span className="text-sm text-text-primary truncate">{upload.originalFile.name}</span>
                      </div>
                      <button
                        onClick={() => removeFile(i)}
                        className="text-text-secondary hover:text-error shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
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
                  disabled={tempUploads.length === 0 || isUploadingAny || hasErrors || uploadState.status === 'uploading'}
                  className="gap-2"
                >
                  {uploadState.status === 'uploading' ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Organizando...</>
                  ) : isUploadingAny ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Subiendo en 2º plano...</>
                  ) : (
                    <><CheckCircle2 className="w-4 h-4" /> Finalizar y Organizar</>
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
