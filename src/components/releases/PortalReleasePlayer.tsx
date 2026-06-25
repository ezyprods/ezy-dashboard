'use client';

import { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipForward, SkipBack, Disc, GripVertical, Trash2, Plus, Image as ImageIcon, Loader2 } from 'lucide-react';
import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PortalTrackPickerModal } from './PortalTrackPickerModal';
import { customAlert } from '@/lib/dialog';

// --- Sortable Track Item ---
function SortableTrackItem({ track, index, isPlaying, currentTrackIndex, playTrack, allowArtistEdit, onRemove }: any) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: track.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`w-full flex items-center gap-3 p-2.5 rounded-xl border transition-all text-left group bg-surface ${
        currentTrackIndex === index
          ? 'border-accent/30 bg-accent/8 text-text-primary shadow-sm'
          : 'border-transparent text-text-secondary hover:border-border/60 hover:text-text-primary hover:bg-surface-elevated/30'
      }`}
    >
      {allowArtistEdit && (
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 text-text-secondary/40 hover:text-text-primary transition-colors shrink-0 outline-none">
          <GripVertical className="w-4 h-4" />
        </div>
      )}
      
      <button onClick={() => playTrack(index)} className="flex items-center gap-3 flex-1 min-w-0 outline-none">
        <div className="w-6 text-center shrink-0">
          {currentTrackIndex === index && isPlaying ? (
            <div className="flex items-center justify-center gap-0.5 h-4">
              <div className="w-0.5 bg-accent h-3 animate-[bounce_0.8s_ease-in-out_infinite]" />
              <div className="w-0.5 bg-accent h-4 animate-[bounce_0.8s_ease-in-out_infinite_100ms]" />
              <div className="w-0.5 bg-accent h-2 animate-[bounce_0.8s_ease-in-out_infinite_200ms]" />
            </div>
          ) : (
            <span className={`text-xs font-mono ${currentTrackIndex === index ? 'text-accent' : 'text-text-secondary/60'}`}>
              {index + 1}
            </span>
          )}
        </div>
        <span className={`text-xs font-semibold flex-1 truncate ${currentTrackIndex === index ? 'text-text-primary' : ''}`}>
          {track.title}
        </span>
        {!allowArtistEdit && (
          <Play className="w-3.5 h-3.5 opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
        )}
      </button>

      {allowArtistEdit && (
        <button 
          onClick={(e) => { e.stopPropagation(); onRemove(track.id); }}
          className="p-1.5 text-text-secondary/40 hover:text-red-400 hover:bg-red-400/10 rounded-md transition-all shrink-0 outline-none"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}


export function PortalReleasePlayer({ 
  release, 
  allowArtistEdit, 
  bounces, 
  portalToken, 
  artistId,
  onReleaseUpdate 
}: { 
  release: any; 
  allowArtistEdit?: boolean;
  bounces?: any[];
  portalToken?: string;
  artistId?: string;
  onReleaseUpdate?: (newRelease: any) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);

  const tracks = release?.tracks || [];
  const currentTrack = tracks[currentTrackIndex];

  useEffect(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.play().catch(() => setIsPlaying(false));
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying, currentTrackIndex, release.id]);

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const curr = audioRef.current.currentTime;
      const dur = audioRef.current.duration || 1;
      setProgress((curr / dur) * 100);
      setCurrentTime(curr);
      setDuration(dur);
    }
  };

  const handleTrackEnd = () => {
    if (tracks.length > 0 && currentTrackIndex < tracks.length - 1) {
      setCurrentTrackIndex(prev => prev + 1);
    } else {
      setIsPlaying(false);
      setProgress(0);
      setCurrentTime(0);
    }
  };

  const playTrack = (index: number) => {
    if (currentTrackIndex === index) {
      setIsPlaying(prev => !prev);
    } else {
      setCurrentTrackIndex(index);
      setIsPlaying(true);
      setProgress(0);
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const seekTo = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = pos * duration;
  };

  // --- Auto-Save Logic ---
  const autoSave = async (updatedRelease: any) => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/portal/${artistId}/releases/${updatedRelease.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: portalToken, release: updatedRelease })
      });
      if (!res.ok) throw new Error('Failed to save');
      if (onReleaseUpdate) {
        onReleaseUpdate(updatedRelease);
      }
    } catch (e: any) {
      console.error(e);
      customAlert('Error al auto-guardar los cambios.');
    } finally {
      setIsSaving(false);
    }
  };

  // --- Editing Handlers ---
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = tracks.findIndex((t: any) => t.id === active.id);
      const newIndex = tracks.findIndex((t: any) => t.id === over?.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        const newTracks = arrayMove(tracks, oldIndex, newIndex);
        autoSave({ ...release, tracks: newTracks });
      }
    }
  };

  const handleRemoveTrack = (trackId: string) => {
    const newTracks = tracks.filter((t: any) => t.id !== trackId);
    autoSave({ ...release, tracks: newTracks });
  };

  const handleAddTrack = (fileId: string, fileName: string) => {
    const newTrack = {
      id: crypto.randomUUID(),
      originalFileId: fileId,
      newFileId: fileId,
      title: fileName.replace(/\.[^/.]+$/, '')
    };
    const newTracks = [...tracks, newTrack];
    autoSave({ ...release, tracks: newTracks });
    setIsPickerOpen(false);
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return customAlert('El archivo debe ser una imagen');

    setIsUploadingCover(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('artistId', artistId || '');
    formData.append('type', 'cover');

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      if (!res.ok) throw new Error('Error al subir la imagen');
      const data = await res.json();
      
      const newHistoryEntry = { fileId: data.fileId, uploadedAt: new Date().toISOString() };
      const newHistory = [...(release.coverHistory || []), newHistoryEntry];
      
      autoSave({ 
        ...release, 
        coverArtId: data.fileId,
        coverHistory: newHistory
      });
    } catch (err: any) {
      customAlert(err.message || 'Error al subir la portada');
    } finally {
      setIsUploadingCover(false);
    }
  };

  return (
    <div className="space-y-4">
      {currentTrack && (
        <audio
          ref={audioRef}
          src={`/api/audio/${currentTrack.newFileId}`}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleTrackEnd}
          onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        />
      )}

      {/* Current playing card */}
      <div className="bg-gradient-to-br from-accent/10 to-accent/5 border border-accent/20 rounded-2xl p-5 relative">
        {isSaving && (
          <div className="absolute top-4 right-4 flex items-center gap-1.5 text-xs text-text-secondary bg-surface/50 px-2 py-1 rounded-full border border-border/50 backdrop-blur-sm">
            <Loader2 className="w-3 h-3 animate-spin text-accent" /> Guardando...
          </div>
        )}
        
        <div className="flex items-center gap-4 mb-4">
          <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-surface border border-border flex items-center justify-center shadow-lg shadow-accent/10 shrink-0 group">
            {release.coverArtId ? (
              <img src={`/api/audio/${release.coverArtId}`} alt="Cover" className="w-full h-full object-cover" />
            ) : (
              <Disc className="w-8 h-8 text-accent/40" />
            )}
            
            {allowArtistEdit && (
              <>
                <div className={`absolute inset-0 bg-black/60 flex items-center justify-center transition-opacity ${isUploadingCover ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                  {isUploadingCover ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <ImageIcon className="w-5 h-5 text-white" />}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleCoverUpload}
                  disabled={isUploadingCover}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  title="Cambiar Portada"
                />
              </>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-accent font-bold uppercase tracking-widest mb-1">Escucha Exclusiva</p>
            <h4 className="font-bold text-text-primary truncate">{currentTrack?.title || release.title}</h4>
            <p className="text-xs text-text-secondary mt-0.5">
              Pista {currentTrackIndex + 1} de {tracks.length}
            </p>
          </div>
        </div>

        {/* Progress */}
        <div
          className="h-1.5 bg-surface-elevated rounded-full mb-2 cursor-pointer overflow-hidden relative"
          onClick={seekTo}
        >
          <div
            className="h-full bg-gradient-to-r from-accent to-accent-light rounded-full transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] font-mono text-text-secondary mb-4">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-5">
          <button
            onClick={() => currentTrackIndex > 0 && playTrack(currentTrackIndex - 1)}
            className={`p-2 rounded-full transition-colors ${currentTrackIndex === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-surface-elevated text-text-secondary hover:text-text-primary'}`}
          >
            <SkipBack className="w-5 h-5" />
          </button>
          <button
            onClick={() => setIsPlaying(prev => !prev)}
            className="w-12 h-12 bg-accent hover:bg-accent/90 text-text-primary rounded-full flex items-center justify-center shadow-lg shadow-accent/30 transition-all hover:scale-105 active:scale-95"
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
          </button>
          <button
            onClick={() => currentTrackIndex < tracks.length - 1 && playTrack(currentTrackIndex + 1)}
            className={`p-2 rounded-full transition-colors ${currentTrackIndex === tracks.length - 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-surface-elevated text-text-secondary hover:text-text-primary'}`}
          >
            <SkipForward className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Tracklist Header (if editing) */}
      {allowArtistEdit && (
        <div className="flex justify-end pt-2">
          <button
            onClick={() => setIsPickerOpen(true)}
            className="flex items-center gap-1.5 text-xs font-bold text-accent bg-accent/10 hover:bg-accent/20 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Añadir Canción
          </button>
        </div>
      )}

      {/* Tracklist */}
      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={tracks.map((t: any) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1">
            {tracks.map((track: any, index: number) => (
              <SortableTrackItem
                key={track.id}
                track={track}
                index={index}
                isPlaying={isPlaying}
                currentTrackIndex={currentTrackIndex}
                playTrack={playTrack}
                allowArtistEdit={allowArtistEdit}
                onRemove={handleRemoveTrack}
              />
            ))}
            {tracks.length === 0 && (
              <div className="p-4 text-center text-text-secondary text-sm border border-dashed border-border rounded-xl">
                No hay canciones en este lanzamiento.
              </div>
            )}
          </div>
        </SortableContext>
      </DndContext>

      {/* Picker Modal */}
      {isPickerOpen && (
        <PortalTrackPickerModal
          bounces={bounces || []}
          selectedFileIds={tracks.map((t: any) => t.originalFileId || t.newFileId)}
          onClose={() => setIsPickerOpen(false)}
          onSelect={handleAddTrack}
        />
      )}
    </div>
  );
}
