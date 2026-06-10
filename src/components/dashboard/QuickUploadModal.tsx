'use client';

import { useState, useCallback, useRef } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';
import { Loader2, UploadCloud, CheckCircle2, AlertCircle, X, Music } from 'lucide-react';
import type { Artist } from '@/types';

const FOLDER_OPTIONS = ['Bounces', 'Mix', 'Master', 'Sessions', 'Other'] as const;
type FolderType = typeof FOLDER_OPTIONS[number];

type Step = 1 | 2 | 3;

interface UploadState {
  status: 'idle' | 'uploading' | 'success' | 'error';
  progress: number; // 0–100
  message: string;
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
  const [files, setFiles] = useState<File[]>([]);
  const [uploadState, setUploadState] = useState<UploadState>({
    status: 'idle',
    progress: 0,
    message: '',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep(1);
    setSelectedArtistId('');
    setSelectedFolder('');
    setFiles([]);
    setUploadState({ status: 'idle', progress: 0, message: '' });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = useCallback(async () => {
    if (!selectedArtistId || !selectedFolder || files.length === 0) return;

    setUploadState({ status: 'uploading', progress: 10, message: 'Preparando subida...' });

    const formData = new FormData();
    formData.append('artistId', selectedArtistId);
    formData.append('folderType', selectedFolder);
    files.forEach((f) => formData.append('file', f));

    setUploadState({ status: 'uploading', progress: 30, message: `Subiendo ${files.length} archivo${files.length > 1 ? 's' : ''} a Drive...` });

    try {
      const res = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al subir los archivos');
      }

      setUploadState({
        status: 'success',
        progress: 100,
        message: `${data.files.length} archivo${data.files.length > 1 ? 's' : ''} subido${data.files.length > 1 ? 's' : ''} correctamente a ${selectedFolder}.`,
      });
    } catch (err: any) {
      setUploadState({
        status: 'error',
        progress: 0,
        message: err.message || 'Error desconocido al subir.',
      });
    }
  }, [selectedArtistId, selectedFolder, files]);

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
                {artists.map((a) => (
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
              {files.length > 0 && (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {files.map((file, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-surface border border-border"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Music className="w-4 h-4 text-accent shrink-0" />
                        <span className="text-sm text-text-primary truncate">{file.name}</span>
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
                  disabled={files.length === 0 || uploadState.status === 'uploading'}
                  className="gap-2"
                >
                  {uploadState.status === 'uploading' ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Subiendo...</>
                  ) : (
                    <><UploadCloud className="w-4 h-4" /> Subir {files.length > 0 ? `${files.length} archivo${files.length > 1 ? 's' : ''}` : ''}</>
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
