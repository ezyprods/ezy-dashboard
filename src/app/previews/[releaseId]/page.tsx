'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  Loader2, Play, Pause, SkipForward, SkipBack,
  Disc, Share2, AlertCircle, Music, Volume2, VolumeX
} from 'lucide-react';

export default function PublicPreviewPage() {
  const params = useParams();
  const releaseId = params.releaseId as string;
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [release, setRelease] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

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
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const currentTrack = release?.tracks?.[currentTrackIndex];

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.play().catch(() => setIsPlaying(false));
    } else {
      audio.pause();
    }
  }, [isPlaying, currentTrackIndex]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const dur = audio.duration || 1;
    setProgress((audio.currentTime / dur) * 100);
    setCurrentTime(audio.currentTime);
    setDuration(audio.duration || 0);
  };

  const handleTrackEnd = () => {
    if (release && currentTrackIndex < release.tracks.length - 1) {
      setCurrentTrackIndex(prev => prev + 1);
      setProgress(0);
      setCurrentTime(0);
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
      setCurrentTime(0);
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
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-[#6c5ce7]/10 border border-[#6c5ce7]/20 flex items-center justify-center mx-auto">
            <Music className="w-8 h-8 text-[#6c5ce7] animate-pulse" />
          </div>
          <p className="text-xs text-[#8888a0] font-medium tracking-widest uppercase">Cargando Preview...</p>
        </div>
      </div>
    );
  }

  if (error || !release) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
        <div className="backdrop-blur-xl bg-white/5 border border-white/10 p-8 rounded-2xl text-center max-w-md w-full">
          <AlertCircle className="w-12 h-12 text-[#fdcb6e] mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Acceso Denegado</h2>
          <p className="text-[#8888a0]">Esta preview es privada o no existe.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white selection:bg-[#6c5ce7]/30">
      {/* Ambient */}
      <div className="fixed inset-0 pointer-events-none">
        {release.coverArtId && (
          <div
            className="absolute inset-0 opacity-10 bg-cover bg-center blur-[120px] scale-110"
            style={{ backgroundImage: `url(/api/audio/${release.coverArtId})` }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0a0a0f]/60 to-[#0a0a0f]" />
      </div>

      {/* Hidden audio */}
      {currentTrack && (
        <audio
          ref={audioRef}
          src={`/api/audio/${currentTrack.newFileId}`}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleTrackEnd}
          onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        />
      )}

      <div className="relative z-10 min-h-screen flex flex-col md:flex-row">
        {/* ── Left panel: Cover + Player ── */}
        <div className="w-full md:w-[420px] lg:w-[500px] flex flex-col justify-center items-center p-8 md:p-12 lg:p-16 border-b md:border-b-0 md:border-r border-white/8">
          {/* Cover */}
          <div className="w-full max-w-xs aspect-square rounded-2xl overflow-hidden shadow-2xl mb-8 relative group">
            {release.coverArtId ? (
              <img
                src={`/api/audio/${release.coverArtId}`}
                alt="Cover"
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
            ) : (
              <div className="w-full h-full bg-[#13131a] border border-white/8 flex items-center justify-center">
                <Disc className="w-24 h-24 text-white/10" />
              </div>
            )}
            {/* Shine overlay */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent to-white/5 pointer-events-none" />
          </div>

          {/* Track info */}
          <div className="w-full max-w-xs text-center mb-6">
            <h1 className="text-2xl md:text-3xl font-bold mb-1 tracking-tight">{release.title}</h1>
            {currentTrack && (
              <div className="mt-2">
                <p className="font-semibold text-white/90">{currentTrack.title}</p>
                <p className="text-xs text-[#8888a0] font-mono mt-1">
                  Pista {currentTrackIndex + 1} de {release.tracks.length}
                </p>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="w-full max-w-xs space-y-4">
            {/* Progress */}
            <div>
              <div
                className="h-1.5 bg-white/10 rounded-full cursor-pointer overflow-hidden group"
                onClick={seekTo}
              >
                <div
                  className="h-full bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] rounded-full transition-all duration-100 group-hover:opacity-90"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between text-xs font-mono text-[#8888a0] mt-1.5">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-center gap-6">
              <button
                onClick={() => currentTrackIndex > 0 && playTrack(currentTrackIndex - 1)}
                className={`p-2.5 rounded-full transition-all ${
                  currentTrackIndex === 0
                    ? 'opacity-25 cursor-not-allowed'
                    : 'hover:bg-white/10 text-[#8888a0] hover:text-white'
                }`}
              >
                <SkipBack className="w-5 h-5" />
              </button>

              <button
                onClick={() => setIsPlaying(prev => !prev)}
                className="w-14 h-14 flex items-center justify-center bg-white text-black rounded-full shadow-xl hover:scale-105 active:scale-95 transition-all"
              >
                {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
              </button>

              <button
                onClick={() => currentTrackIndex < release.tracks.length - 1 && playTrack(currentTrackIndex + 1)}
                className={`p-2.5 rounded-full transition-all ${
                  currentTrackIndex === release.tracks.length - 1
                    ? 'opacity-25 cursor-not-allowed'
                    : 'hover:bg-white/10 text-[#8888a0] hover:text-white'
                }`}
              >
                <SkipForward className="w-5 h-5" />
              </button>
            </div>

            {/* Volume */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsMuted(prev => !prev)}
                className="text-[#8888a0] hover:text-white transition-colors shrink-0"
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={isMuted ? 0 : volume}
                onChange={e => { setVolume(parseFloat(e.target.value)); setIsMuted(false); }}
                className="flex-1 accent-[#6c5ce7] h-1 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* ── Right panel: Tracklist ── */}
        <div className="flex-1 flex flex-col p-8 md:p-10 lg:p-14 overflow-y-auto">
          <div className="max-w-2xl mx-auto w-full">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xs font-bold text-[#8888a0] uppercase tracking-[0.2em]">Tracklist</h2>
              <button
                onClick={handleShare}
                className={`flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-full border transition-all ${
                  shareCopied
                    ? 'bg-[#00b894]/20 text-[#00b894] border-[#00b894]/30'
                    : 'bg-white/5 text-[#8888a0] border-white/10 hover:text-white hover:bg-white/10'
                }`}
              >
                <Share2 className="w-3.5 h-3.5" />
                {shareCopied ? 'Enlace copiado' : 'Compartir'}
              </button>
            </div>

            {/* Tracks */}
            <div className="space-y-1.5">
              {release.tracks.map((track: any, index: number) => (
                <div
                  key={track.id}
                  onClick={() => playTrack(index)}
                  className={`flex items-center gap-4 px-4 py-3.5 rounded-xl cursor-pointer transition-all group ${
                    currentTrackIndex === index
                      ? 'bg-white/10 border border-white/15 shadow-lg'
                      : 'hover:bg-white/5 border border-transparent hover:border-white/8'
                  }`}
                >
                  {/* Track number / equalizer */}
                  <div className="w-7 text-center shrink-0">
                    {currentTrackIndex === index && isPlaying ? (
                      <div className="flex items-end justify-center gap-0.5 h-4">
                        <div className="w-0.5 bg-[#a29bfe] h-3 animate-[bounce_0.7s_ease-in-out_infinite]" />
                        <div className="w-0.5 bg-[#a29bfe] h-4 animate-[bounce_0.7s_ease-in-out_infinite_100ms]" />
                        <div className="w-0.5 bg-[#a29bfe] h-2 animate-[bounce_0.7s_ease-in-out_infinite_200ms]" />
                        <div className="w-0.5 bg-[#a29bfe] h-3.5 animate-[bounce_0.7s_ease-in-out_infinite_50ms]" />
                      </div>
                    ) : (
                      <span className={`text-sm font-mono ${
                        currentTrackIndex === index ? 'text-[#a29bfe] font-bold' : 'text-[#8888a0] group-hover:text-white/60'
                      } transition-colors`}>
                        {index + 1}
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <div className="flex-1 min-w-0">
                    <h4 className={`font-semibold truncate transition-colors ${
                      currentTrackIndex === index ? 'text-white' : 'text-white/80 group-hover:text-white'
                    }`}>
                      {track.title}
                    </h4>
                  </div>

                  {/* Play icon on hover */}
                  <div className={`shrink-0 transition-opacity ${
                    currentTrackIndex === index ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'
                  }`}>
                    {currentTrackIndex === index && isPlaying
                      ? <Pause className="w-4 h-4 text-[#a29bfe]" />
                      : <Play className="w-4 h-4 text-white" />
                    }
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="mt-12 pt-8 border-t border-white/8 text-center">
              <p className="text-xs text-[#8888a0]">
                Pre-escucha exclusiva · <span className="text-[#6c5ce7]">EZY Dashboard</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
