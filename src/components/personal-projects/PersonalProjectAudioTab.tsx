'use client';

import React, { useState } from 'react';
import { 
  Music, 
  UploadCloud, 
  Activity, 
  Loader2, 
  Sparkles, 
  Plus, 
  FolderCheck,
  CheckCircle2
} from 'lucide-react';
import { WaveformPlayer } from '@/components/projects/WaveformPlayer';
import { Button } from '@/components/ui/Button';
import { detectAudioFeatures } from '@/lib/utils/audio';
import { customAlert, customConfirm } from '@/lib/dialog';
import type { PersonalProject } from '@/types';

interface PersonalProjectAudioTabProps {
  project: PersonalProject;
  bounces: any[];
  folders: any[];
  onRefresh: () => void;
  onUpdateMetadata: (updates: Partial<PersonalProject>) => Promise<any>;
}

export function PersonalProjectAudioTab({
  project,
  bounces,
  folders,
  onRefresh,
  onUpdateMetadata,
}: PersonalProjectAudioTabProps) {
  const [isAnalyzing, setIsAnalyzing] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Target bounces folder
  const bounceFolder = folders.find(
    f => (f.name || '').toLowerCase().includes('bounce') || (f.name || '').toLowerCase().includes('demo')
  );
  const targetFolderId = bounceFolder ? bounceFolder.id : project.id;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setIsUploading(true);

    try {
      // 1. Analyze BPM/Key locally with Meyda/audio buffer
      let detectedBpm: number | null = null;
      let detectedKey: string | null = null;

      try {
        const feat = await detectAudioFeatures(file);
        detectedBpm = feat.bpm || null;
        detectedKey = feat.key || null;
      } catch (analErr) {
        console.warn('Audio analysis fallback:', analErr);
      }

      // 2. Create upload session in Google Drive
      const appProps: any = {};
      if (detectedBpm) appProps.bpm = detectedBpm.toString();
      if (detectedKey) appProps.key = detectedKey;

      const sessionRes = await fetch('/api/files/upload-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: file.name,
          mimeType: file.type || 'audio/wav',
          parentId: targetFolderId,
          appProperties: appProps,
        }),
      });

      if (!sessionRes.ok) {
        const err = await sessionRes.json().catch(() => ({}));
        throw new Error(err.error || 'Error al iniciar subida a Drive');
      }

      const { uploadUrl } = await sessionRes.json();

      // 3. Upload file
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'audio/wav' },
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error('Error al enviar el archivo a Drive');
      }

      const uploadedData = await uploadRes.json().catch(() => ({}));
      const fileId = uploadedData.id;

      // 4. Update project latestBounce and BPM/Key if not set
      const metadataUpdates: Partial<PersonalProject> = {
        latestBounceFileId: fileId || project.latestBounceFileId,
        latestBounceName: file.name,
      };

      if (detectedBpm && !project.bpm) metadataUpdates.bpm = detectedBpm;
      if (detectedKey && !project.key) metadataUpdates.key = detectedKey;

      await onUpdateMetadata(metadataUpdates);

      window.dispatchEvent(new CustomEvent('recentfiles:refresh'));
      customAlert(`¡Bounce "${file.name}" subido correctamente!${detectedBpm ? ` (Detectado: ${detectedBpm} BPM, ${detectedKey})` : ''}`);
      onRefresh();
    } catch (err: any) {
      console.error(err);
      customAlert(err.message || 'Error durante la subida del audio.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAnalyzeRemoteFile = async (fileItem: any) => {
    setIsAnalyzing(fileItem.id);
    try {
      // OPTIMIZATION: Resolve direct Google Drive URL first to avoid Vercel proxy bandwidth
      let audioFetchUrl = `/api/audio/${fileItem.id}`;
      try {
        const resolveRes = await fetch(`/api/audio/${fileItem.id}/resolve`);
        if (resolveRes.ok) {
          const { url } = await resolveRes.json();
          if (url && !url.includes('ServiceLogin')) audioFetchUrl = url;
        }
      } catch { /* Fall back to proxy */ }

      const res = await fetch(audioFetchUrl);
      if (!res.ok) throw new Error('No se pudo descargar el audio para análisis');
      const blob = await res.blob();
      const file = new File([blob], fileItem.name, { type: blob.type });

      const { bpm, key } = await detectAudioFeatures(file);

      if (bpm || key) {
        const confirmed = await customConfirm(
          `Análisis completado para "${fileItem.name}":\n\nTempo: ${bpm ? bpm + ' BPM' : 'N/D'}\nTonalidad: ${key || 'N/D'}\n\n¿Quieres actualizar los metadatos del proyecto con estos valores?`
        );

        if (confirmed) {
          const updates: Partial<PersonalProject> = {};
          if (bpm) updates.bpm = bpm;
          if (key) updates.key = key;
          await onUpdateMetadata(updates);
          customAlert('¡Metadatos del proyecto actualizados!');
        }
      } else {
        customAlert('No se pudo determinar con precisión el tempo o tonalidad.');
      }
    } catch (err: any) {
      console.error(err);
      customAlert('Error al analizar el archivo de audio.');
    } finally {
      setIsAnalyzing(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header / Upload Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-surface/60 border border-border/60">
        <div>
          <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
            <Music className="w-5 h-5 text-accent" />
            Bounces, Demos & Audios
          </h2>
          <p className="text-xs text-text-secondary mt-0.5">
            {bounces.length} archivo{bounces.length !== 1 ? 's' : ''} de audio detectados en este proyecto
          </p>
        </div>

        <div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="audio/*"
            className="hidden"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="bg-accent hover:bg-accent-light text-white shadow-lg shadow-accent/20"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Subiendo & Analizando...
              </>
            ) : (
              <>
                <UploadCloud className="w-4 h-4 mr-2" />
                Subir Nuevo Bounce
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Audio List */}
      {bounces.length === 0 ? (
        <div className="glass p-12 rounded-2xl border border-dashed border-border/80 flex flex-col items-center justify-center text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-surface-elevated flex items-center justify-center border border-border/50 shadow-inner">
            <Music className="w-8 h-8 text-text-secondary/60" />
          </div>
          <div>
            <h3 className="font-bold text-base text-text-primary">No hay pistas de audio aún</h3>
            <p className="text-xs text-text-secondary mt-1 max-w-sm">
              Sube tu primer demo, exportación o master para escuchar la onda de sonido y autodetectar BPM y tonalidad.
            </p>
          </div>
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="bg-accent hover:bg-accent-light text-white"
          >
            <UploadCloud className="w-4 h-4 mr-2" />
            Subir Primer Bounce
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {bounces.map((file) => {
            const isAnalyzingThis = isAnalyzing === file.id;

            return (
              <div 
                key={file.id} 
                className="glass p-4 sm:p-5 rounded-2xl border border-border/70 hover:border-accent/40 transition-all duration-200 shadow-sm space-y-3"
              >
                {/* Waveform Player */}
                <WaveformPlayer
                  fileId={file.id}
                  fileName={file.name}
                  artistName={project.title}
                  modifiedTime={file.modifiedTime}
                  bpm={file.bpm || project.bpm}
                  trackKey={file.key || project.key}
                  onRefresh={onRefresh}
                />

                {/* Extra actions for this bounce */}
                <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs text-text-secondary">
                  <div className="flex items-center gap-2 flex-wrap">
                    {project.latestBounceFileId === file.id && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                        <CheckCircle2 className="w-3 h-3" />
                        Bounce Principal
                      </span>
                    )}

                    {file.bpm && (
                      <span className="font-mono text-text-primary font-semibold">
                        Tempo: {file.bpm} BPM
                      </span>
                    )}

                    {file.key && (
                      <span className="font-mono text-text-primary font-semibold">
                        Key: {file.key}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleAnalyzeRemoteFile(file)}
                      disabled={isAnalyzingThis}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-light hover:underline transition-colors disabled:opacity-50"
                    >
                      {isAnalyzingThis ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Analizando...
                        </>
                      ) : (
                        <>
                          <Activity className="w-3 h-3" />
                          Autodetectar BPM & Key
                        </>
                      )}
                    </button>

                    {project.latestBounceFileId !== file.id && (
                      <button
                        type="button"
                        onClick={async () => {
                          await onUpdateMetadata({
                            latestBounceFileId: file.id,
                            latestBounceName: file.name,
                          });
                          customAlert(`"${file.name}" marcado como bounce principal del proyecto.`);
                        }}
                        className="text-xs text-text-secondary hover:text-text-primary hover:underline transition-colors"
                      >
                        Fijar como principal
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
