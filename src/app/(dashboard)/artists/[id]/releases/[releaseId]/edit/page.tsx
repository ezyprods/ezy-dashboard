'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Loader2, Play, Pause, SkipForward, SkipBack,
  Disc, Share2, AlertCircle, Music, Volume2, VolumeX, Volume1,
  Shuffle, Repeat, Repeat1, Clock, ArrowLeft, Save, Plus,
  Shield, ShieldOff, Copy, CheckCircle2, GripVertical, Trash2, Edit3, Image as ImageIcon
} from 'lucide-react';
import type { Release, ReleaseTrack } from '@/types';
import { TrackPickerModal } from '@/components/releases/TrackPickerModal';
import { customAlert, customConfirm } from '@/lib/dialog';

export default function ReleaseEditorPage() {
  const params = useParams();
  const router = useRouter();
  const artistId = params?.id as string;
  const releaseId = params?.releaseId as string;
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [release, setRelease] = useState<Release | null>(null);
  const [artistName, setArtistName] = useState<string>('Unknown Artist');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // Playback State
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off');
  const [shuffledIndices, setShuffledIndices] = useState<number[]>([]);
  const [history, setHistory] = useState<number[]>([]);

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
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch {
      customAlert('Error al guardar');
    } finally {
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
    setIsSaving(true);
    try {
      const res = await fetch(`/api/releases/${releaseId}/tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalFileId: fileId, title: fileName.replace(/\.[^/.]+$/, '') })
      });
      if (!res.ok) throw new Error('Error copying track');
      const data = await res.json();
      setRelease(prev => {
        if (!prev) return prev;
        const newTracks = [...prev.tracks, data];
        setShuffledIndices(Array.from({ length: newTracks.length }, (_, i) => i));
        return { ...prev, tracks: newTracks };
      });
    } catch {
      customAlert('Error añadiendo la canción. Asegúrate de tener permisos.');
    } finally {
      setIsSaving(false);
      setIsPickerOpen(false);
    }
  };

  const updateTrackTitle = (trackId: string, newTitle: string) => {
    setRelease(prev => {
      if (!prev) return prev;
      return { ...prev, tracks: prev.tracks.map(t => t.id === trackId ? { ...t, title: newTitle } : t) };
    });
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

      // Adjust currently playing index if it shifted
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

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('parentId', artistId);
    try {
      setIsSaving(true);
      const res = await fetch('/api/files/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Error subiendo imagen');
      const data = await res.json();
      setRelease(prev => prev ? { ...prev, coverArtId: data.fileId } : null);
    } catch {
      customAlert('Error al subir la portada');
    } finally {
      setIsSaving(false);
    }
  };

  // Playback logic
  const currentTrack = release?.tracks?.[currentTrackIndex];

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

      navigator.mediaSession.setActionHandler('play', () => setIsPlaying(true));
      navigator.mediaSession.setActionHandler('pause', () => setIsPlaying(false));
      navigator.mediaSession.setActionHandler('previoustrack', handlePrev);
      navigator.mediaSession.setActionHandler('nexttrack', handleNext);
    }
  }, [currentTrackIndex, release, artistName, currentTrack]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => setIsPlaying(false));
      }
    } else {
      audio.pause();
    }
  }, [isPlaying, currentTrackIndex]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

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

  const handleNext = () => {
    if (!release?.tracks) return;
    if (repeatMode === 'one' && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play();
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
        if (audioRef.current) audioRef.current.currentTime = 0;
      }
    }
  };

  const handlePrev = () => {
    if (!release?.tracks) return;
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
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
      if (audioRef.current) audioRef.current.currentTime = 0;
    }
  };

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const dur = audio.duration || 1;
    setProgress((audio.currentTime / dur) * 100);
    setCurrentTime(audio.currentTime);
  };

  const playTrack = (index: number) => {
    if (currentTrackIndex === index) {
      setIsPlaying(prev => !prev);
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

  const seekTo = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pos * duration;
  };

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
          onClose={() => setIsPickerOpen(false)}
          onSelect={handleAddTrack}
        />
      )}

      {/* Hidden audio */}
      {currentTrack && (
        <audio
          ref={audioRef}
          src={`/api/audio/${currentTrack.newFileId}`}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleNext}
          onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
          autoPlay={isPlaying}
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
        
        <div className="flex items-center gap-3">
          <button
            onClick={handleCopyLink}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-colors ${
              linkCopied ? 'bg-[#1db954]/20 text-[#1db954]' : 'bg-black/50 hover:bg-black/80 text-white'
            }`}
          >
            {linkCopied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {linkCopied ? 'Copiado' : 'Copiar URL'}
          </button>
          
          <button
            onClick={handleTogglePublic}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-colors ${
              release.isPublic ? 'bg-[#1db954]/20 text-[#1db954] hover:bg-[#1db954]/30' : 'bg-black/50 hover:bg-black/80 text-[#b3b3b3] hover:text-white'
            }`}
          >
            {release.isPublic ? <Shield className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />}
            {release.isPublic ? 'Pública' : 'Privada'}
          </button>
          
          <button 
            onClick={handleSave} 
            disabled={isSaving}
            className={`flex items-center gap-2 px-6 py-2 rounded-full text-xs font-bold transition-all ${
              saveSuccess ? 'bg-[#1db954] text-black scale-105' : 'bg-white text-black hover:scale-105'
            }`}
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : saveSuccess ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saveSuccess ? 'Guardado' : 'Guardar Cambios'}
          </button>
        </div>
      </div>

      {/* Main View Area */}
      <div className="flex-1 overflow-y-auto pb-24 relative hide-scrollbar">
        {/* Dynamic Background Gradient */}
        <div className="absolute top-0 left-0 right-0 h-[400px] pointer-events-none opacity-40 z-0 overflow-hidden">
          {coverUrl && (
            <div 
              className="absolute inset-0 bg-cover bg-center blur-[80px] transform scale-110" 
              style={{ backgroundImage: `url(${coverUrl})` }} 
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#121212]" />
        </div>

        {/* Header Content */}
        <div className="relative z-10 px-8 pt-28 pb-8 flex items-end gap-6">
          <div className="w-52 h-52 shadow-[0_4px_60px_rgba(0,0,0,0.5)] shrink-0 bg-[#282828] flex items-center justify-center relative group cursor-pointer overflow-hidden">
            {coverUrl ? (
              <img src={coverUrl} alt="Cover" className="w-full h-full object-cover group-hover:brightness-50 transition-all" />
            ) : (
              <Music className="w-20 h-20 text-[#b3b3b3] group-hover:opacity-20 transition-all" />
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <ImageIcon className="w-8 h-8 text-white mb-2" />
              <span className="text-xs font-bold">Cambiar foto</span>
            </div>
            <input
              type="file"
              accept="image/*"
              className="absolute inset-0 opacity-0 cursor-pointer"
              onChange={handleCoverUpload}
            />
          </div>
          <div className="flex flex-col gap-2 flex-1">
            <span className="text-sm font-bold tracking-wider uppercase text-white/80">Editor de Álbum</span>
            
            {/* Editable Title */}
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

        {/* Action Bar */}
        <div className="relative z-10 px-8 py-4 flex items-center gap-6 bg-gradient-to-b from-[#121212]/0 to-[#121212]">
          <button 
            onClick={() => {
              if (currentTrackIndex === 0 && !isPlaying && release.tracks.length > 0) playTrack(0);
              else setIsPlaying(!isPlaying);
            }}
            disabled={release.tracks.length === 0}
            className="w-14 h-14 bg-[#1ed760] text-black rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 ml-1 fill-current" />}
          </button>
        </div>

        {/* Tracklist Area */}
        <div className="relative z-10 px-8 pb-12">
          <div className="grid grid-cols-[30px_16px_1fr_40px] md:grid-cols-[30px_16px_1fr_auto_40px] gap-4 px-4 py-2 border-b border-[#282828] text-[#b3b3b3] text-sm font-medium mb-4">
            <div className="text-center"></div>
            <div className="text-center">#</div>
            <div>Título (Editable)</div>
            <div className="hidden md:block">Acción</div>
            <div className="flex justify-end pr-8"><Clock className="w-4 h-4" /></div>
          </div>

          <div className="flex flex-col gap-1">
            {release.tracks.map((track, index) => {
              const isTrackPlaying = currentTrackIndex === index;
              return (
                <div 
                  key={track.id}
                  draggable
                  onDragStart={e => {
                    e.dataTransfer.setData('text/plain', index.toString());
                    e.dataTransfer.effectAllowed = 'move';
                    (e.currentTarget as HTMLElement).style.opacity = '0.5';
                  }}
                  onDragEnd={e => {
                    (e.currentTarget as HTMLElement).style.opacity = '1';
                    document.querySelectorAll('.drag-over-track').forEach(el => el.classList.remove('bg-white/10', 'border-t-2', 'border-[#1db954]'));
                  }}
                  onDragOver={e => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    e.currentTarget.classList.add('bg-white/10', 'border-t-2', 'border-[#1db954]');
                  }}
                  onDragLeave={e => {
                    e.currentTarget.classList.remove('bg-white/10', 'border-t-2', 'border-[#1db954]');
                  }}
                  onDrop={e => {
                    e.preventDefault();
                    e.currentTarget.classList.remove('bg-white/10', 'border-t-2', 'border-[#1db954]');
                    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
                    if (!isNaN(fromIndex) && fromIndex !== index) {
                      reorderTracks(fromIndex, index);
                    }
                  }}
                  className={`group grid grid-cols-[30px_16px_1fr_40px] md:grid-cols-[30px_16px_1fr_auto_40px] gap-4 px-4 py-2 rounded-md transition-colors items-center hover:bg-white/10 ${isTrackPlaying ? 'bg-white/5' : ''}`}
                >
                  {/* Drag Handle */}
                  <div className="text-[#b3b3b3] cursor-grab active:cursor-grabbing opacity-50 hover:opacity-100 flex justify-center">
                    <GripVertical className="w-4 h-4" />
                  </div>

                  {/* Play / Index */}
                  <div 
                    className="text-center text-sm flex items-center justify-center cursor-pointer"
                    onClick={() => playTrack(index)}
                  >
                    {isTrackPlaying && isPlaying ? (
                      <img src="https://open.spotifycdn.com/cdn/images/equaliser-animated-green.f93a2fd4.gif" alt="playing" className="w-3.5 h-3.5" />
                    ) : isTrackPlaying && !isPlaying ? (
                      <span className="text-[#1db954] font-bold">{index + 1}</span>
                    ) : (
                      <>
                        <span className="group-hover:hidden text-[#b3b3b3]">{index + 1}</span>
                        <Play className="w-3 h-3 hidden group-hover:block fill-current text-white" />
                      </>
                    )}
                  </div>

                  {/* Editable Title */}
                  <div className="flex flex-col justify-center overflow-hidden">
                    <input
                      type="text"
                      value={track.title}
                      onChange={e => updateTrackTitle(track.id, e.target.value)}
                      className={`text-base font-medium bg-transparent focus:outline-none focus:ring-1 focus:ring-[#1db954] rounded px-1 -ml-1 transition-colors ${isTrackPlaying ? 'text-[#1db954]' : 'text-white'}`}
                    />
                  </div>

                  {/* Actions */}
                  <div className="hidden md:flex text-sm items-center">
                    <button 
                      onClick={() => removeTrack(track.id, index)}
                      className="text-[#b3b3b3] hover:text-[#e22134] transition-colors p-2 rounded-full hover:bg-white/5 opacity-0 group-hover:opacity-100"
                      title="Eliminar canción"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Duration */}
                  <div className="text-sm flex justify-end items-center pr-4 text-[#b3b3b3]">
                    {isTrackPlaying ? formatTime(duration) : '--:--'}
                  </div>
                </div>
              );
            })}
          </div>

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
      <div className="h-[90px] bg-[#181818] border-t border-[#282828] flex items-center justify-between px-4 z-50 shrink-0">
        
        {/* Left: Now Playing Info */}
        <div className="flex items-center gap-3 w-[30%] min-w-[180px]">
          {currentTrack ? (
            <>
              <div className="w-14 h-14 bg-[#282828] shrink-0 rounded flex items-center justify-center overflow-hidden relative group">
                {coverUrl ? <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" /> : <Music className="w-6 h-6 text-[#b3b3b3]" />}
              </div>
              <div className="flex flex-col justify-center min-w-0">
                <span className="text-sm text-white font-medium hover:underline cursor-pointer truncate">
                  {currentTrack.title}
                </span>
                <span className="text-xs text-[#b3b3b3] hover:underline cursor-pointer hover:text-white transition-colors truncate">
                  {artistName}
                </span>
              </div>
            </>
          ) : (
            <div className="w-14 h-14 bg-[#282828] rounded" />
          )}
        </div>

        {/* Center: Player Controls */}
        <div className="flex flex-col items-center max-w-[45%] w-full">
          <div className="flex items-center gap-4 md:gap-6 mb-1.5">
            <button onClick={toggleShuffle} className={`p-1 transition-colors ${isShuffle ? 'text-[#1db954]' : 'text-[#b3b3b3] hover:text-white'}`}>
              <Shuffle className="w-4 h-4" />
            </button>
            <button onClick={handlePrev} className="p-1 text-[#b3b3b3] hover:text-white transition-colors">
              <SkipBack className="w-5 h-5 fill-current" />
            </button>
            <button 
              onClick={() => {
                if (!currentTrack && release?.tracks?.length > 0) playTrack(0);
                else setIsPlaying(!isPlaying);
              }}
              className="w-8 h-8 flex items-center justify-center bg-white text-black rounded-full hover:scale-105 active:scale-95 transition-transform"
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 ml-0.5 fill-current" />}
            </button>
            <button onClick={handleNext} className="p-1 text-[#b3b3b3] hover:text-white transition-colors">
              <SkipForward className="w-5 h-5 fill-current" />
            </button>
            <button 
              onClick={toggleRepeat} 
              className={`p-1 transition-colors relative ${repeatMode !== 'off' ? 'text-[#1db954]' : 'text-[#b3b3b3] hover:text-white'}`}
            >
              {repeatMode === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
              {repeatMode !== 'off' && <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#1db954]" />}
            </button>
          </div>
          <div className="flex items-center gap-2 w-full max-w-[600px]">
            <span className="text-xs text-[#a7a7a7] min-w-[40px] text-right tabular-nums">{formatTime(currentTime)}</span>
            <div 
              className="flex-1 h-1 bg-[#4d4d4d] rounded-full flex items-center cursor-pointer group"
              onClick={seekTo}
            >
              <div 
                className="h-full bg-white group-hover:bg-[#1db954] rounded-full transition-colors relative"
                style={{ width: `${progress}%` }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
            <span className="text-xs text-[#a7a7a7] min-w-[40px] tabular-nums">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Right: Volume & Extra Controls */}
        <div className="flex items-center justify-end gap-3 w-[30%] min-w-[180px]">
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
              className="w-full h-1 bg-[#4d4d4d] rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:bg-[#1db954] cursor-pointer"
            />
          </div>
        </div>

      </div>
    </div>
  );
}
