'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  Loader2, Play, Pause, SkipForward, SkipBack,
  Disc, Share2, AlertCircle, Music, Volume2, VolumeX, Volume1,
  Shuffle, Repeat, Repeat1, Clock, ChevronDown, MoreHorizontal, Heart
} from 'lucide-react';

export default function PublicPreviewPage() {
  const params = useParams();
  const releaseId = params.releaseId as string;
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [release, setRelease] = useState<any>(null);
  const [artistName, setArtistName] = useState<string>('Unknown Artist');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Playback State
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  // Advanced Playback Modes
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off');
  const [isPlayerExpanded, setIsPlayerExpanded] = useState(false);
  
  // To handle shuffle queue correctly
  const [shuffledIndices, setShuffledIndices] = useState<number[]>([]);
  const [history, setHistory] = useState<number[]>([]);

  useEffect(() => {
    fetchRelease();
  }, [releaseId]);

  const fetchRelease = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/releases/${releaseId}`);
      if (!res.ok) throw new Error('Preview no encontrado o privado');
      const data = await res.json();
      setRelease(data.release);
      if (data.artistName) setArtistName(data.artistName);
      
      // Initialize natural indices
      if (data.release?.tracks?.length > 0) {
        setShuffledIndices(Array.from({ length: data.release.tracks.length }, (_, i) => i));
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const currentTrack = release?.tracks?.[currentTrackIndex];

  // Media Session API
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

  // Audio Playback Effect
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn("Audio play failed:", err);
          setIsPlaying(false);
        });
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

  // Shuffle toggle logic
  const toggleShuffle = () => {
    setIsShuffle(prev => {
      const nextShuffle = !prev;
      if (!release?.tracks) return nextShuffle;

      if (nextShuffle) {
        // Create a shuffled array of indices, but keep the current track at the beginning
        let indices = Array.from({ length: release.tracks.length }, (_, i) => i).filter(i => i !== currentTrackIndex);
        for (let i = indices.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        setShuffledIndices([currentTrackIndex, ...indices]);
      } else {
        // Restore natural order
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
    
    // Repeat one -> just seek to start and play
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
        // Move selected track to front of remaining queue if clicked directly
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

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#121212] flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-white animate-spin" />
      </div>
    );
  }

  if (error || !release) {
    return (
      <div className="min-h-screen bg-[#121212] flex flex-col items-center justify-center p-4">
        <AlertCircle className="w-16 h-16 text-[#e22134] mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Página no disponible</h2>
        <p className="text-[#a7a7a7]">Esta preview es privada o no existe.</p>
      </div>
    );
  }

  const coverUrl = release.coverArtId ? `/api/audio/${release.coverArtId}` : '';

  return (
    <div className="flex flex-col h-screen bg-[#121212] text-white overflow-hidden selection:bg-[#1db954]/30 font-sans">
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

      
      {/* Main View Area */}
      <div className="flex-1 overflow-y-auto pb-[72px] md:pb-24 relative hide-scrollbar">
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
        <div className="relative z-10 px-5 md:px-8 pt-10 md:pt-20 pb-6 flex flex-col md:flex-row items-center md:items-end gap-5 md:gap-6 text-center md:text-left">
          <div className="w-64 h-64 md:w-52 md:h-52 shadow-[0_8px_40px_rgba(0,0,0,0.5)] shrink-0 bg-[#282828] flex items-center justify-center">
            {coverUrl ? (
              <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" />
            ) : (
              <Music className="w-24 h-24 md:w-20 md:h-20 text-[#b3b3b3]" />
            )}
          </div>
          <div className="flex flex-col gap-2 mt-2 md:mt-0 items-center md:items-start">
            <span className="hidden md:block text-sm font-bold tracking-wider uppercase">Álbum</span>
            <h1 className="text-4xl md:text-7xl font-black tracking-tighter mb-2" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.2)' }}>
              {release.title}
            </h1>
            <div className="flex flex-wrap justify-center md:justify-start items-center gap-1.5 md:gap-2 text-sm text-white font-medium">
              <div className="w-6 h-6 rounded-full bg-[#282828] overflow-hidden hidden md:block">
                {coverUrl && <img src={coverUrl} className="w-full h-full object-cover" />}
              </div>
              <span className="font-bold">{artistName}</span>
              <span className="w-1 h-1 rounded-full bg-white/60 mx-0.5" />
              <span className="text-white/80">{new Date(release.createdAt).getFullYear()}</span>
              <span className="w-1 h-1 rounded-full bg-white/60 mx-0.5" />
              <span className="text-white/80">{release.tracks?.length || 0} canciones</span>
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div className="relative z-10 px-5 md:px-8 py-2 md:py-4 flex items-center justify-between md:justify-start gap-4 md:gap-6 bg-gradient-to-b from-[#121212]/0 to-[#121212]">
          <div className="flex items-center gap-4 md:hidden">
             <button className="text-[#b3b3b3] hover:text-white transition-colors">
               <Heart className="w-7 h-7" />
             </button>
             <button onClick={handleShare} className="text-[#b3b3b3] hover:text-white transition-colors">
               <MoreHorizontal className="w-7 h-7" />
             </button>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={toggleShuffle} 
              className={`transition-colors hidden md:block ${isShuffle ? 'text-[#1db954]' : 'text-[#b3b3b3] hover:text-white'}`}
            >
              <Shuffle className="w-7 h-7" />
            </button>
            <button 
              onClick={() => {
                if (currentTrackIndex === 0 && !isPlaying) playTrack(0);
                else setIsPlaying(!isPlaying);
              }}
              className="w-14 h-14 bg-[#1ed760] text-black rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
            >
              {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 ml-1 fill-current" />}
            </button>
          </div>
        </div>

        {/* Tracklist */}
        <div className="relative z-10 px-3 md:px-8 pb-32 md:pb-12">
          {/* Table Header */}
          <div className="hidden md:grid grid-cols-[16px_1fr_40px] md:grid-cols-[16px_1fr_auto_40px] gap-4 px-4 py-2 border-b border-[#282828] text-[#b3b3b3] text-sm font-medium mb-4">
            <div className="text-center">#</div>
            <div>Título</div>
            <div className="hidden md:block">Artista</div>
            <div className="flex justify-end pr-8"><Clock className="w-4 h-4" /></div>
          </div>

          {/* Tracks */}
          <div className="flex flex-col gap-1 md:gap-0">
            {release.tracks.map((track: any, index: number) => {
              const isTrackPlaying = currentTrackIndex === index;
              return (
                <div 
                  key={track.id}
                  onClick={() => playTrack(index)}
                  className={`group grid grid-cols-[1fr_40px] md:grid-cols-[16px_1fr_auto_40px] gap-3 md:gap-4 px-3 md:px-4 py-3 md:py-2.5 rounded-md cursor-pointer hover:bg-white/10 transition-colors items-center ${isTrackPlaying ? 'text-[#1db954]' : 'text-[#b3b3b3]'}`}
                >
                  <div className="hidden md:flex text-center text-sm items-center justify-center">
                    {isTrackPlaying && isPlaying ? (
                      <img src="https://open.spotifycdn.com/cdn/images/equaliser-animated-green.f93a2fd4.gif" alt="playing" className="w-3.5 h-3.5" />
                    ) : isTrackPlaying && !isPlaying ? (
                      <span className="text-[#1db954]">{index + 1}</span>
                    ) : (
                      <>
                        <span className="group-hover:hidden">{index + 1}</span>
                        <Play className="w-3 h-3 hidden group-hover:block fill-current text-white" />
                      </>
                    )}
                  </div>
                  <div className="flex flex-col justify-center overflow-hidden">
                    <span className={`text-base truncate font-medium ${isTrackPlaying ? 'text-[#1db954]' : 'text-white'}`}>
                      {track.title}
                    </span>
                    <span className="text-sm truncate md:hidden">{artistName}</span>
                  </div>
                  <div className="hidden md:flex text-sm items-center hover:text-white transition-colors">
                    {artistName}
                  </div>
                  <div className="text-sm flex justify-end items-center pr-2 md:pr-4">
                    {isTrackPlaying ? formatTime(duration) : '--:--'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Desktop Bottom Player */}
      <div className="hidden md:flex h-[90px] bg-[#181818] border-t border-[#282828] items-center justify-between px-4 z-50 shrink-0">
        
        {/* Left: Now Playing Info */}
        <div className="flex items-center gap-3 w-[30%] min-w-[180px] overflow-hidden">
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
            <div className="w-14 h-14 bg-[#282828] rounded shrink-0" />
          )}
        </div>

        {/* Center: Player Controls */}
        <div className="flex flex-col items-center flex-1 max-w-[45%]">
          <div className="flex items-center gap-6 mb-1.5">
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
              className={`p-1 transition-colors relative ${repeatMode !== 'off' ? 'text-[#1db954]' : 'text-[#b3b3b3] hover:text-white'}`}>
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
          <button 
            onClick={handleShare}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
              shareCopied ? 'bg-[#1db954]/10 text-[#1db954] border-[#1db954]' : 'border-[#b3b3b3] text-[#b3b3b3] hover:text-white hover:border-white'
            }`}
          >
            <Share2 className="w-3.5 h-3.5" />
            {shareCopied ? 'Copiado' : 'Compartir'}
          </button>
          
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

      {/* Mobile Mini Player */}
      <div className="md:hidden fixed bottom-[16px] left-[8px] right-[8px] h-[56px] bg-[#2a2a2a] rounded-md flex items-center justify-between px-2 z-50 shadow-lg" onClick={() => setIsPlayerExpanded(true)}>
        <div className="flex items-center gap-3 overflow-hidden flex-1">
          {currentTrack ? (
            <>
              <div className="w-10 h-10 shrink-0 rounded overflow-hidden bg-[#181818]">
                {coverUrl && <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" />}
              </div>
              <div className="flex flex-col justify-center min-w-0 pr-2">
                <span className="text-sm text-white font-medium truncate">{currentTrack.title}</span>
                <span className="text-xs text-[#b3b3b3] truncate">{artistName}</span>
              </div>
            </>
          ) : (
            <div className="text-sm text-[#b3b3b3] px-2">Selecciona una canción</div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button className="p-2 text-[#b3b3b3]" onClick={(e) => { e.stopPropagation(); }}>
            <Heart className="w-5 h-5" />
          </button>
          <button 
            className="p-2 text-white"
            onClick={(e) => {
              e.stopPropagation();
              if (!currentTrack && release?.tracks?.length > 0) playTrack(0);
              else setIsPlaying(!isPlaying);
            }}
          >
            {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current" />}
          </button>
        </div>
        
        {/* Mobile Mini Scrubber */}
        {currentTrack && (
          <div className="absolute bottom-0 left-2 right-2 h-[2px] bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-white transition-all duration-100" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      {/* Mobile Full Screen Player */}
      {isPlayerExpanded && (
        <div className="md:hidden fixed inset-0 z-[100] bg-gradient-to-b from-[#404040] to-[#121212] flex flex-col pt-12 pb-8 px-6 animate-in slide-in-from-bottom duration-300">
          <div className="flex items-center justify-between mb-8">
            <button onClick={() => setIsPlayerExpanded(false)} className="text-white p-2 -ml-2">
              <ChevronDown className="w-6 h-6" />
            </button>
            <span className="text-[10px] font-bold uppercase tracking-widest text-white">{release?.title}</span>
            <button onClick={handleShare} className="text-white p-2 -mr-2">
              <MoreHorizontal className="w-6 h-6" />
            </button>
          </div>
          
          <div className="w-full aspect-square rounded-lg shadow-2xl overflow-hidden bg-[#181818] mb-8 relative">
            {coverUrl ? (
              <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Music className="w-24 h-24 text-[#b3b3b3]" />
              </div>
            )}
          </div>
          
          <div className="flex items-center justify-between mb-6">
            <div className="flex flex-col overflow-hidden pr-4">
              <h2 className="text-2xl font-bold text-white truncate mb-1">{currentTrack?.title || 'Sin pista'}</h2>
              <p className="text-lg text-[#b3b3b3] truncate">{artistName}</p>
            </div>
            <button className="text-white shrink-0">
              <Heart className="w-7 h-7" />
            </button>
          </div>
          
          {/* Progress */}
          <div className="flex flex-col gap-2 mb-6">
            <div 
              className="h-1 bg-[#4d4d4d] rounded-full flex items-center relative py-2"
              onClick={seekTo}
            >
              <div className="h-1 bg-white rounded-full relative pointer-events-none" style={{ width: `${progress}%` }}>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full" />
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-[#a7a7a7] font-medium tabular-nums">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
          
          {/* Controls */}
          <div className="flex items-center justify-between mb-8 px-2">
            <button onClick={toggleShuffle} className={`p-2 transition-colors -ml-2 ${isShuffle ? 'text-[#1db954]' : 'text-white'}`}>
              <Shuffle className="w-6 h-6" />
            </button>
            <button onClick={handlePrev} className="p-2 text-white">
              <SkipBack className="w-9 h-9 fill-current" />
            </button>
            <button 
              onClick={() => {
                if (!currentTrack && release?.tracks?.length > 0) playTrack(0);
                else setIsPlaying(!isPlaying);
              }}
              className="w-16 h-16 bg-white text-black rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
            >
              {isPlaying ? <Pause className="w-7 h-7 fill-current" /> : <Play className="w-7 h-7 ml-1 fill-current" />}
            </button>
            <button onClick={handleNext} className="p-2 text-white">
              <SkipForward className="w-9 h-9 fill-current" />
            </button>
            <button 
              onClick={toggleRepeat} 
              className={`p-2 transition-colors relative -mr-2 ${repeatMode !== 'off' ? 'text-[#1db954]' : 'text-white'}`}>
              {repeatMode === 'one' ? <Repeat1 className="w-6 h-6" /> : <Repeat className="w-6 h-6" />}
              {repeatMode !== 'off' && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#1db954]" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
