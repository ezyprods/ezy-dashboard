'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Loader2, Play, Pause, SkipForward, SkipBack,
  Disc, Share2, AlertCircle, Music, Volume2, VolumeX, Volume1,
  Shuffle, Repeat, Repeat1, Clock, ArrowLeft, Save, Plus,
  Shield, ShieldOff, Copy, CheckCircle2, GripVertical, Trash2, Edit3, Image as ImageIcon
} from 'lucide-react';
import { useAudioPlayer } from '@/hooks/useAudioPlayer';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Release, ReleaseTrack } from '@/types';
import { TrackPickerModal } from '@/components/releases/TrackPickerModal';
import { customAlert, customConfirm } from '@/lib/dialog';

export default function ReleaseEditorPage() {
  const params = useParams();
  const router = useRouter();
  const artistId = params?.id as string;
  const releaseId = params?.releaseId as string;

  const [release, setRelease] = useState<Release | null>(null);
  const [artistName, setArtistName] = useState<string>('Unknown Artist');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isDraggingCover, setIsDraggingCover] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [conversionState, setConversionState] = useState({ active: false, progress: 0, trackTitle: '' });
  const ffmpegRef = useRef<any>(null);

  // Playback State
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off');
  const [shuffledIndices, setShuffledIndices] = useState<number[]>([]);
  const [history, setHistory] = useState<number[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = (release?.tracks || []).findIndex(t => t.id === active.id) ?? -1;
      const newIndex = (release?.tracks || []).findIndex(t => t.id === over?.id) ?? -1;
      if (oldIndex !== -1 && newIndex !== -1) {
        reorderTracks(oldIndex, newIndex);
      }
    }
  };

  useEffect(() => {
    fetchRelease();
  }, [releaseId]);

  const fetchRelease = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/releases/${releaseId}`);
      if (!res.ok) throw new Error('Error al cargar el lanzamiento');
      const data = await res.json();
      setRelease(data.release);
      if (data.artistName) setArtistName(data.artistName);

      if (data.release?.tracks?.length > 0) {
        setShuffledIndices(Array.from({ length: data.release.tracks.length }, (_, i) => i));
      }
    } catch {
      customAlert('Error al cargar el lanzamiento');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!release) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/releases/${releaseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(release)
      });
      if (!res.ok) throw new Error('Error saving');
      setSaveSuccess(true);
      setTimeout(() => {
        router.push(`/artists/${artistId}/previews`);
      }, 400);
    } catch {
      customAlert('Error al guardar');
      setIsSaving(false);
    }
  };

  const handleTogglePublic = async () => {
    if (!release) return;
    const newVal = !release.isPublic;
    setRelease(prev => prev ? { ...prev, isPublic: newVal } : null);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/previews/${releaseId}`);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const handleAddTrack = async (fileId: string, fileName: string) => {
    const newTrackId = Math.random().toString(36).substring(2, 15);
    const newTrack = {
      id: newTrackId,
      originalFileId: fileId,
      originalFileName: fileName,
      title: fileName.replace(/\.[^/.]+$/, ''),
      newFileId: fileId,
    };
    
    setRelease(prev => {
      if (!prev) return prev;
      const newTracks = [...prev.tracks, newTrack];
      setShuffledIndices(Array.from({ length: newTracks.length }, (_, i) => i));
      return { ...prev, tracks: newTracks };
    });
  };

  const updateTrackTitle = (trackId: string, newTitle: string) => {
    setRelease(prev => {
      if (!prev) return prev;
      return { ...prev, tracks: prev.tracks.map(t => t.id === trackId ? { ...t, title: newTitle } : t) };
    });
  };

  const optimizeTracksToMp3 = async () => {
    try {
      const tracksToConvert = release?.tracks.filter(t => !t.previewFileId && (!t.originalFileName || t.originalFileName.toLowerCase().endsWith('.wav'))) || [];
      if (tracksToConvert.length === 0) {
        customAlert('Todas las pistas ya están optimizadas');
        return;
      }

      setConversionState({ active: true, progress: 0, trackTitle: 'Iniciando motor FFmpeg...' });
      
      const { FFmpeg } = await import('@ffmpeg/ffmpeg');
      const { fetchFile } = await import('@ffmpeg/util');

      if (!ffmpegRef.current) {
        const ffmpeg = new FFmpeg();
        ffmpeg.on('progress', ({ progress }) => {
          setConversionState(prev => ({ ...prev, progress: Math.max(0, Math.min(100, Math.round(progress * 100))) }));
        });
        await ffmpeg.load({
          coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
          wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm',
        });
        ffmpegRef.current = ffmpeg;
      }

      const ffmpeg = ffmpegRef.current;
      let newTracks = [...(release?.tracks || [])];

      for (const track of tracksToConvert) {
        setConversionState({ active: true, progress: 0, trackTitle: `Descargando: ${track.title}` });
        
        const response = await fetch(`/api/audio/${track.originalFileId}`);
        if (!response.ok) throw new Error('No se pudo descargar ' + track.title);
        const blob = await response.blob();
        
        setConversionState({ active: true, progress: 0, trackTitle: `Optimizando: ${track.title}` });
        
        await ffmpeg.writeFile('input.wav', await fetchFile(blob));
        await ffmpeg.exec(['-i', 'input.wav', '-b:a', '320k', 'output.mp3']);
        
        const data = await ffmpeg.readFile('output.mp3');
        const mp3Blob = new Blob([data], { type: 'audio/mpeg' });
        
        setConversionState({ active: true, progress: 100, trackTitle: `Guardando: ${track.title}` });
        const formData = new FormData();
        const safeTitle = track.title.replace(/[^a-z0-9]/gi, '_');
        formData.append('file', mp3Blob, `Preview_${safeTitle}.mp3`);
        formData.append('parentId', releaseId);
        formData.append('skipSimilarity', 'true');
        
        const uploadRes = await fetch('/api/files', { method: 'POST', body: formData });
        if (!uploadRes.ok) throw new Error('Error subiendo MP3 de ' + track.title);
        const uploadData = await uploadRes.json();
        const mp3FileId = uploadData.file?.id || uploadData.id;
        
        newTracks = newTracks.map(t => t.id === track.id ? { ...t, previewFileId: mp3FileId } : t);
        setRelease(prev => prev ? { ...prev, tracks: newTracks } : null);
        
        await fetch(`/api/releases/${releaseId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tracks: newTracks }),
        });
      }
      
      customAlert('Optimización completada. El reproductor cargará ultrarrápido.');
    } catch (err: any) {
      console.error(err);
      customAlert('Error en la optimización: ' + (err.message || 'Desconocido'));
    } finally {
      setConversionState({ active: false, progress: 0, trackTitle: '' });
    }
  };

  const removeTrack = async (trackId: string, index: number) => {
    if (!await customConfirm('¿Eliminar esta canción del lanzamiento?')) return;
    setRelease(prev => {
      if (!prev) return prev;
      const newTracks = prev.tracks.filter(t => t.id !== trackId);
      setShuffledIndices(Array.from({ length: newTracks.length }, (_, i) => i));
      if (currentTrackIndex === index) {
        setIsPlaying(false);
        setCurrentTrackIndex(0);
      } else if (currentTrackIndex > index) {
        setCurrentTrackIndex(currentTrackIndex - 1);
      }
      return { ...prev, tracks: newTracks };
    });
  };

  const reorderTracks = (fromIndex: number, toIndex: number) => {
    setRelease(prev => {
      if (!prev) return prev;
      const newTracks = [...prev.tracks];
      const [moved] = newTracks.splice(fromIndex, 1);
      newTracks.splice(toIndex, 0, moved);

      if (currentTrackIndex === fromIndex) {
        setCurrentTrackIndex(toIndex);
      } else if (currentTrackIndex > fromIndex && currentTrackIndex <= toIndex) {
        setCurrentTrackIndex(currentTrackIndex - 1);
      } else if (currentTrackIndex < fromIndex && currentTrackIndex >= toIndex) {
        setCurrentTrackIndex(currentTrackIndex + 1);
      }

      setShuffledIndices(Array.from({ length: newTracks.length }, (_, i) => i));
      return { ...prev, tracks: newTracks };
    });
  };

  const processAndUploadCover = async (file: File) => {
    try {
      setIsSaving(true);
      const croppedFile = await cropImageToSquare(file);
      const ext = croppedFile.type === 'image/png' ? 'png' : 'jpg';
      const version = (release?.coverHistory?.length || 0) + 1;
      const cleanTitle = (release?.title || 'Preview').replace(/[^a-z0-9]/gi, '_');
      const newFileName = `Portada - ${cleanTitle} - v${version}.${ext}`;
      
      const formData = new FormData();
      formData.append('file', croppedFile, newFileName);
      formData.append('parentId', release?.id || releaseId);
      formData.append('skipSimilarity', 'true');
      
      const res = await fetch('/api/files', { method: 'POST', body: formData });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Error subiendo imagen');
      }
      const data = await res.json();
      
      const fileId = data.file?.id || data.id || data.fileId;
      if (!fileId) throw new Error('No se recibió ID del archivo');

      const newEntry = { fileId, uploadedAt: new Date().toISOString() };
      
      setRelease(prev => {
        if (!prev) return null;
        const newHistory = [...(prev.coverHistory || []), newEntry];
        return { 
          ...prev, 
          coverArtId: fileId,
          coverHistory: newHistory 
        };
      });
    } catch (err: any) {
      console.error(err);
      customAlert('Error al subir la portada: ' + (err.message || 'Desconocido'));
    } finally {
      setIsSaving(false);
      setIsDraggingCover(false);
    }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processAndUploadCover(file);
  };

  const handleCoverDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingCover(true);
  };

  const handleCoverDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingCover(false);
  };

  const handleCoverDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingCover(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('image/')) {
      if (file) customAlert('Por favor, arrastra una imagen válida');
      return;
    }
    await processAndUploadCover(file);
  };

  const handleSelectHistoricalCover = (fileId: string) => {
    setRelease(prev => prev ? { ...prev, coverArtId: fileId } : null);
  };

  const currentTrack = release?.tracks?.[currentTrackIndex];

  const currentIndexInQueue = shuffledIndices.indexOf(currentTrackIndex);
  let nextTrackIndex = -1;
  if (currentIndexInQueue >= 0 && currentIndexInQueue < shuffledIndices.length - 1) {
    nextTrackIndex = shuffledIndices[currentIndexInQueue + 1];
  } else if (repeatMode === 'all' && shuffledIndices.length > 0) {
    nextTrackIndex = shuffledIndices[0];
  } else if (repeatMode === 'one' && currentTrack) {
    nextTrackIndex = currentTrackIndex;
  }
  const nextTrack = nextTrackIndex !== -1 ? release?.tracks?.[nextTrackIndex] : null;

  const currentTrackUrl = currentTrack ? `/api/audio/${currentTrack.previewFileId || currentTrack.newFileId}` : null;
  const nextTrackUrl = nextTrack ? `/api/audio/${nextTrack.previewFileId || nextTrack.newFileId}` : null;

  const {
    isPlaying,
    isBuffering,
    progress,
    currentTime,
    duration,
    togglePlay,
    play,
    pause,
    seekTo,
    setIsPlaying
  } = useAudioPlayer({
    currentTrackUrl,
    nextTrackUrl,
    onTrackEnd: () => handleNext(true),
    volume,
    isMuted
  });

  useEffect(() => {
    if ('mediaSession' in navigator && currentTrack && release) {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: currentTrack.title || 'Unknown Track',
        artist: artistName,
        album: release.title || 'Unknown Album',
        artwork: release.coverArtId ? [
          { src: `/api/audio/${release.coverArtId}`, sizes: '512x512', type: 'image/jpeg' }
        ] : []
      });

      navigator.mediaSession.setActionHandler('play', play);
      navigator.mediaSession.setActionHandler('pause', pause);
      navigator.mediaSession.setActionHandler('previoustrack', handlePrev);
      navigator.mediaSession.setActionHandler('nexttrack', () => handleNext(false));
    }
  }, [currentTrackIndex, release, artistName, currentTrack, play, pause]);

  const toggleShuffle = () => {
    setIsShuffle(prev => {
      const nextShuffle = !prev;
      if (!release?.tracks) return nextShuffle;

      if (nextShuffle) {
        let indices = Array.from({ length: release.tracks.length }, (_, i) => i).filter(i => i !== currentTrackIndex);
        for (let i = indices.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        setShuffledIndices([currentTrackIndex, ...indices]);
      } else {
        setShuffledIndices(Array.from({ length: release.tracks.length }, (_, i) => i));
      }
      return nextShuffle;
    });
  };

  const toggleRepeat = () => {
    setRepeatMode(prev => {
      if (prev === 'off') return 'all';
      if (prev === 'all') return 'one';
      return 'off';
    });
  };

  const handleNext = (autoAdvance = false) => {
    if (!release?.tracks) return;
    if (repeatMode === 'one' && autoAdvance) {
      seekTo(0);
      play();
      return;
    }

    setHistory(prev => [...prev, currentTrackIndex]);
    const currentIndexInQueue = shuffledIndices.indexOf(currentTrackIndex);
    if (currentIndexInQueue < shuffledIndices.length - 1) {
      setCurrentTrackIndex(shuffledIndices[currentIndexInQueue + 1]);
      setIsPlaying(true);
    } else {
      if (repeatMode === 'all') {
        setCurrentTrackIndex(shuffledIndices[0]);
        setIsPlaying(true);
      } else {
        setIsPlaying(false);
        seekTo(0);
      }
    }
  };

  const handlePrev = () => {
    if (!release?.tracks) return;
    if (currentTime > 3) {
      seekTo(0);
      return;
    }
    if (history.length > 0) {
      const prevTrack = history[history.length - 1];
      setHistory(prev => prev.slice(0, -1));
      setCurrentTrackIndex(prevTrack);
      setIsPlaying(true);
      return;
    }
    const currentIndexInQueue = shuffledIndices.indexOf(currentTrackIndex);
    if (currentIndexInQueue > 0) {
      setCurrentTrackIndex(shuffledIndices[currentIndexInQueue - 1]);
      setIsPlaying(true);
    } else {
      seekTo(0);
    }
  };

  const playTrack = (index: number) => {
    if (currentTrackIndex === index) {
      togglePlay();
    } else {
      setHistory(prev => [...prev, currentTrackIndex]);
      setCurrentTrackIndex(index);
      setIsPlaying(true);
      if (isShuffle) {
        let remaining = shuffledIndices.filter(i => i !== index);
        setShuffledIndices([index, ...remaining]);
      }
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          if (release?.tracks && release.tracks.length > 0) {
            togglePlay();
          }
          break;
        case 'KeyM':
          e.preventDefault();
          setIsMuted(prev => !prev);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [release?.tracks]);

  const formatTime = (sec: number) => {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#121212] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-[#1db954] animate-spin" />
      </div>
    );
  }

  if (!release) {
    return (
      <div className="min-h-screen bg-[#121212] flex flex-col items-center justify-center p-4">
        <AlertCircle className="w-16 h-16 text-[#e22134] mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Preview no encontrado</h2>
      </div>
    );
  }

  const coverUrl = release.coverArtId ? `/api/audio/${release.coverArtId}` : '';

  return (
    <div className="flex flex-col h-screen bg-[#121212] text-white overflow-hidden selection:bg-[#1db954]/30 font-sans">
      
      {isPickerOpen && (
        <TrackPickerModal
          artistId={artistId}
          selectedFileIds={release.tracks?.map(t => t.originalFileId) || []}
          onClose={() => setIsPickerOpen(false)}
          onSelect={handleAddTrack}
        />
      )}

      {/* Floating Admin Header */}
      <div className="absolute top-0 left-0 right-0 h-16 z-50 px-6 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent">
        <button 
          onClick={() => router.push(`/artists/${artistId}/previews`)}
          className="w-10 h-10 rounded-full bg-black/50 hover:bg-black/80 flex items-center justify-center transition-colors text-white"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        
        <div className="flex items-center gap-2 md:gap-3">
          <button
            onClick={handleCopyLink}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-colors ${
              linkCopied ? 'bg-[#1db954]/20 text-[#1db954]' : 'bg-black/50 hover:bg-black/80 text-white'
            }`}
          >
            {linkCopied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span className="hidden md:inline">{linkCopied ? 'Copiado' : 'Copiar URL'}</span>
          </button>
          
          <button
            onClick={handleTogglePublic}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-colors ${
              release.isPublic ? 'bg-[#1db954]/20 text-[#1db954] hover:bg-[#1db954]/30' : 'bg-black/50 hover:bg-black/80 text-[#b3b3b3] hover:text-white'
            }`}
          >
            {release.isPublic ? <Shield className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />}
            <span className="hidden md:inline">{release.isPublic ? 'Pública' : 'Privada'}</span>
          </button>
          
          <button 
            onClick={handleSave} 
            disabled={isSaving}
            className={`flex items-center gap-2 px-6 py-2 rounded-full text-xs font-bold transition-all ${
              saveSuccess ? 'bg-[#1db954] text-black scale-105' : 'bg-white text-black hover:scale-105'
            }`}
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : saveSuccess ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            <span className="hidden md:inline">{saveSuccess ? 'Guardado' : 'Guardar Cambios'}</span>
          </button>
        </div>
      </div>

      {/* Main View Area */}
      <div className="flex-1 overflow-y-auto pb-24 relative hide-scrollbar">
        <div className="absolute top-0 left-0 right-0 h-[400px] pointer-events-none opacity-40 z-0 overflow-hidden">
          {coverUrl && (
            <div 
              className="absolute inset-0 bg-cover bg-center blur-[80px] transform scale-110" 
              style={{ backgroundImage: `url(${coverUrl})` }} 
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#121212]" />
        </div>

        <div className="relative z-10 px-8 pt-28 pb-8 flex items-end gap-6">
          <div className="flex flex-col gap-3">
            <div 
              className={`w-52 h-52 shadow-[0_4px_60px_rgba(0,0,0,0.5)] shrink-0 bg-[#282828] flex items-center justify-center relative group cursor-pointer overflow-hidden rounded-md transition-all ${
                isDraggingCover ? 'border-2 border-dashed border-[#1db954] scale-105 brightness-110' : ''
              }`}
              onDragOver={handleCoverDragOver}
              onDragLeave={handleCoverDragLeave}
              onDrop={handleCoverDrop}
            >
              {coverUrl ? (
                <img src={coverUrl} alt="Cover" className="w-full h-full object-cover group-hover:brightness-50 transition-all" />
              ) : (
                <Music className="w-20 h-20 text-[#b3b3b3] group-hover:opacity-20 transition-all" />
              )}
              <div className={`absolute inset-0 flex flex-col items-center justify-center transition-opacity ${isDraggingCover ? 'opacity-100 bg-[#1db954]/20 backdrop-blur-sm' : 'opacity-0 group-hover:opacity-100'}`}>
                <ImageIcon className={`w-8 h-8 text-white mb-2 ${isDraggingCover ? 'animate-bounce text-[#1db954]' : ''}`} />
                <span className="text-white text-sm font-bold bg-black/60 px-3 py-1 rounded-full backdrop-blur-md border border-white/20">
                  {isDraggingCover ? 'Soltar aquí' : coverUrl ? 'Cambiar Portada' : 'Subir Portada'}
                </span>
              </div>
              <input 
                type="file" 
                accept="image/*" 
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={handleCoverUpload}
              />
            </div>
            
            {release.coverHistory && release.coverHistory.length > 1 && (
              <div className="flex gap-2 mt-1 max-w-[208px] overflow-x-auto hide-scrollbar pb-1">
                {release.coverHistory.map((entry, idx) => (
                  <button 
                    key={entry.fileId} 
                    onClick={() => handleSelectHistoricalCover(entry.fileId)}
                    className={`w-10 h-10 shrink-0 rounded overflow-hidden transition-all hover:scale-110 relative ${
                      release.coverArtId === entry.fileId 
                        ? 'border-2 border-[#1db954] shadow-[0_0_10px_rgba(29,185,84,0.3)]' 
                        : 'border border-white/10 opacity-50 hover:opacity-100'
                    }`}
                    title={`Versión ${idx + 1} - ${new Date(entry.uploadedAt).toLocaleDateString()}`}
                  >
                    <img src={`/api/audio/${entry.fileId}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 flex-1 min-w-0">
            <span className="text-sm font-bold tracking-wider uppercase text-white/80">Editor de Álbum</span>
            
            <input
              type="text"
              value={release.title}
              onChange={e => setRelease({ ...release, title: e.target.value })}
              className="w-full bg-transparent text-5xl md:text-7xl font-black tracking-tighter mb-2 focus:outline-none focus:ring-2 focus:ring-[#1db954]/50 rounded-lg px-2 -ml-2 transition-all hover:bg-white/5"
              style={{ textShadow: '0 2px 10px rgba(0,0,0,0.2)' }}
              placeholder="Nombre del Álbum"
            />
            
            <div className="flex items-center gap-2 text-sm text-[#fff] font-medium px-2">
              <span>{artistName}</span>
              <span className="w-1 h-1 rounded-full bg-white mx-1" />
              <span>{release.tracks?.length || 0} canciones</span>
              <span className="w-1 h-1 rounded-full bg-white mx-1" />
              <span className="text-[#1db954] font-bold">Modo Edición</span>
            </div>
          </div>
        </div>

        <div className="relative z-10 px-8 py-4 flex items-center gap-6 bg-gradient-to-b from-[#121212]/0 to-[#121212]">
          <button 
            onClick={togglePlay}
            disabled={(release.tracks || []).length === 0}
            className="w-14 h-14 bg-[#1ed760] text-black rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isBuffering ? <Loader2 className="w-6 h-6 animate-spin text-black" /> : isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 ml-1 fill-current" />}
          </button>
          
          {release?.tracks?.some(t => !t.previewFileId && (!t.originalFileName || t.originalFileName.toLowerCase().endsWith('.wav'))) && (
            <button
              onClick={optimizeTracksToMp3}
              disabled={conversionState.active}
              className="flex items-center gap-2 px-4 py-2 bg-[#282828] border border-[#3e3e3e] rounded-full text-sm font-semibold hover:bg-[#3e3e3e] hover:text-white transition-all disabled:opacity-50"
            >
              {conversionState.active ? <Loader2 className="w-4 h-4 animate-spin text-[#1db954]" /> : <Music className="w-4 h-4 text-[#1db954]" />}
              {conversionState.active ? 'Optimizando...' : 'Generar MP3s Ultrarrápidos'}
            </button>
          )}
        </div>
        
        {conversionState.active && (
          <div className="px-8 pb-4">
            <div className="bg-[#181818] rounded-xl p-4 border border-[#282828] flex flex-col gap-2">
              <div className="flex justify-between text-sm">
                <span className="font-bold text-[#1db954]">{conversionState.trackTitle}</span>
                <span className="text-white">{conversionState.progress}%</span>
              </div>
              <div className="w-full h-2 bg-[#282828] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-[#1db954] transition-all duration-300 ease-out" 
                  style={{ width: `${conversionState.progress}%` }}
                />
              </div>
            </div>
          </div>
        )}

        <div className="relative z-10 px-8 pb-12">
          <div className="grid grid-cols-[30px_16px_1fr_40px] md:grid-cols-[30px_16px_1fr_auto_40px] gap-4 px-4 py-2 border-b border-[#282828] text-[#b3b3b3] text-sm font-medium mb-4">
            <div className="text-center"></div>
            <div className="text-center">#</div>
            <div>Título (Editable)</div>
            <div className="hidden md:block">Acción</div>
            <div className="flex justify-end pr-8"><Clock className="w-4 h-4" /></div>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={(release.tracks || []).map(t => t.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-1">
                {(release.tracks || []).map((track, index) => {
                  const isTrackPlaying = currentTrackIndex === index;
                  return (
                    <SortableTrackItem
                      key={track.id}
                      track={track}
                      index={index}
                      isTrackPlaying={isTrackPlaying}
                      isPlaying={isPlaying}
                      isBuffering={isBuffering}
                      playTrack={playTrack}
                      updateTrackTitle={updateTrackTitle}
                      removeTrack={removeTrack}
                      formatTime={formatTime}
                      duration={duration}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>

          <div className="mt-6 px-4">
            <button 
              onClick={() => setIsPickerOpen(true)}
              className="flex items-center gap-2 text-[#b3b3b3] hover:text-white font-bold text-sm transition-colors group"
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center border border-[#b3b3b3] group-hover:border-white transition-colors">
                <Plus className="w-5 h-5" />
              </div>
              Añadir canción al disco
            </button>
          </div>
        </div>
      </div>

      {/* Fixed Bottom Player Bar */}
      <div className="h-[90px] bg-[#181818] border-t border-[#282828] flex items-center justify-between px-2 md:px-4 z-50 shrink-0 gap-2 md:gap-0">
        <div className="flex items-center gap-2 md:gap-3 w-[35%] md:w-[30%] md:min-w-[180px] overflow-hidden">
          {currentTrack ? (
            <>
              <div className="w-10 h-10 md:w-14 md:h-14 bg-[#282828] shrink-0 rounded flex items-center justify-center overflow-hidden relative group">
                {coverUrl ? <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" /> : <Music className="w-6 h-6 text-[#b3b3b3]" />}
              </div>
              <div className="flex flex-col justify-center min-w-0">
                <span className="text-sm text-white font-medium truncate">{currentTrack.title}</span>
                <span className="text-xs text-[#b3b3b3] truncate">{artistName}</span>
              </div>
            </>
          ) : (
            <div className="w-14 h-14 bg-[#282828] rounded" />
          )}
        </div>

        <div className="flex flex-col items-center flex-1 max-w-[60%] md:max-w-[45%]">
          <div className="flex items-center gap-4 md:gap-6 mb-1.5">
            <button onClick={toggleShuffle} className={`p-1 transition-colors ${isShuffle ? 'text-[#1db954]' : 'text-[#b3b3b3] hover:text-white'}`}>
              <Shuffle className="w-4 h-4" />
            </button>
            <button onClick={handlePrev} className="p-1 text-[#b3b3b3] hover:text-white transition-colors">
              <SkipBack className="w-5 h-5 fill-current" />
            </button>
            <button 
              onClick={togglePlay}
              className="w-8 h-8 flex items-center justify-center bg-white text-black rounded-full hover:scale-105 active:scale-95 transition-transform"
            >
              {isBuffering ? <Loader2 className="w-4 h-4 animate-spin text-black" /> : isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 ml-0.5 fill-current" />}
            </button>
            <button onClick={() => handleNext(false)} className="p-1 text-[#b3b3b3] hover:text-white transition-colors">
              <SkipForward className="w-5 h-5 fill-current" />
            </button>
            <button 
              onClick={toggleRepeat} 
              className={`p-1 transition-colors relative ${repeatMode !== 'off' ? 'text-[#1db954]' : 'text-[#b3b3b3] hover:text-white'}`}
            >
              {repeatMode === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
            </button>
          </div>
          <div className="flex items-center gap-2 w-full max-w-[600px]">
            <span className="text-xs text-[#a7a7a7] min-w-[40px] text-right tabular-nums">{formatTime(currentTime)}</span>
            <div 
              className="flex-1 h-1 flex items-center cursor-pointer group relative py-3 -my-3"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                seekTo((x / rect.width) * duration);
              }}
            >
              <div className="w-full h-1 bg-[#4d4d4d] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-white rounded-full group-hover:bg-[#1db954] transition-all duration-100 ease-linear"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            <span className="text-xs text-[#a7a7a7] min-w-[40px] tabular-nums">{formatTime(duration)}</span>
          </div>
        </div>

        <div className="hidden md:flex items-center justify-end gap-3 w-[30%] min-w-[180px]">
          <div className="flex items-center gap-2 w-24">
            <button 
              onClick={() => setIsMuted(!isMuted)} 
              className="text-[#b3b3b3] hover:text-white transition-colors p-1"
            >
              {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : volume < 0.5 ? <Volume1 className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isMuted ? 0 : volume}
              onChange={e => { setVolume(parseFloat(e.target.value)); setIsMuted(false); }}
              className="w-full h-1 bg-[#4d4d4d] rounded-full appearance-none cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SortableTrackItem({ track, index, isTrackPlaying, isPlaying, isBuffering, playTrack, updateTrackTitle, removeTrack, formatTime, duration }: any) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: track.id });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
  };

  return (
    <div 
      ref={setNodeRef}
      style={style}
      onDoubleClick={() => playTrack(index)}
      className={`group grid grid-cols-[30px_16px_1fr_40px] md:grid-cols-[30px_16px_1fr_auto_40px] gap-4 px-4 py-2 rounded-md items-center hover:bg-white/10 select-none ${isTrackPlaying ? 'bg-white/5' : ''} ${isDragging ? 'opacity-50 bg-white/20' : ''}`}
    >
      <div {...attributes} {...listeners} className="text-[#b3b3b3] cursor-grab active:cursor-grabbing opacity-50 hover:opacity-100 flex justify-center outline-none">
        <GripVertical className="w-4 h-4" />
      </div>

      <div 
        className="text-center text-sm flex items-center justify-center cursor-pointer w-6 h-6 relative mx-auto"
        onClick={(e) => {
          e.stopPropagation();
          playTrack(index);
        }}
      >
        {isTrackPlaying && isBuffering ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#1db954]" />
        ) : isTrackPlaying && isPlaying ? (
          <>
            <img src="https://open.spotifycdn.com/cdn/images/equaliser-animated-green.f93a2fd4.gif" alt="playing" className="w-3.5 h-3.5 group-hover:hidden" />
            <Pause className="w-4 h-4 hidden group-hover:block fill-current text-white" />
          </>
        ) : (
          <>
            <span className="group-hover:hidden text-[#b3b3b3]">{index + 1}</span>
            <Play className="w-4 h-4 hidden group-hover:block fill-current text-white ml-1" />
          </>
        )}
      </div>

      <div className="flex flex-col justify-center overflow-hidden" onDoubleClick={(e) => e.stopPropagation()}>
        <input
          type="text"
          value={track.title}
          onChange={e => updateTrackTitle(track.id, e.target.value)}
          className={`text-base font-medium bg-transparent focus:outline-none focus:ring-1 focus:ring-[#1db954] rounded px-1 -ml-1 transition-colors ${isTrackPlaying ? 'text-[#1db954]' : 'text-white'}`}
        />
      </div>

      <div className="hidden md:flex text-sm items-center">
        <button 
          onClick={() => removeTrack(track.id, index)}
          className="text-[#b3b3b3] hover:text-[#e22134] transition-colors p-2 rounded-full hover:bg-white/5 opacity-0 group-hover:opacity-100"
          title="Eliminar canción"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="text-sm flex justify-end items-center pr-4 text-[#b3b3b3]">
        {isTrackPlaying ? formatTime(duration) : '--:--'}
      </div>
    </div>
  );
}

const cropImageToSquare = (file: File): Promise<File> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = Math.min(img.width, img.height);
        const targetSize = Math.min(size, 1500); // Max 1500px resolution
        
        canvas.width = targetSize;
        canvas.height = targetSize;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(file);
        
        const offsetX = (img.width - size) / 2;
        const offsetY = (img.height - size) / 2;
        
        ctx.drawImage(img, offsetX, offsetY, size, size, 0, 0, targetSize, targetSize);
        
        canvas.toBlob((blob) => {
          if (!blob) return resolve(file);
          // Return the blob directly, we'll set the filename in FormData
          // Some environments fail with new File()
          resolve(blob as unknown as File);
        }, 'image/jpeg', 0.9);
      };
      img.onerror = () => resolve(file);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
};
