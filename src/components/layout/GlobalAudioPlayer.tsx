'use client';

import React from 'react';
import { useAudio } from '@/lib/contexts/AudioContext';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, X, Music } from 'lucide-react';

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function GlobalAudioPlayer() {
  const { currentTrack, isPlaying, duration, currentTime, togglePlay, seek, volume, setVolume, closePlayer } = useAudio();

  if (!currentTrack) return null;

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    seek(time);
  };

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(Number(e.target.value));
  };

  const toggleMute = () => {
    setVolume(volume === 0 ? 1 : 0);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 h-24 bg-surface-elevated/95 backdrop-blur-xl border-t border-border z-50 flex items-center px-6 animate-slide-up shadow-2xl">
      
      {/* Track Info */}
      <div className="flex items-center gap-4 w-1/4 min-w-[200px]">
        <div className="w-14 h-14 bg-surface rounded-md flex items-center justify-center overflow-hidden shrink-0 border border-border">
          {currentTrack.coverArt ? (
            <img src={currentTrack.coverArt} alt={currentTrack.name} className="w-full h-full object-cover" />
          ) : (
            <Music className="w-6 h-6 text-text-secondary" />
          )}
        </div>
        <div className="overflow-hidden">
          <p className="text-sm font-bold text-text-primary truncate" title={currentTrack.name}>{currentTrack.name}</p>
          {currentTrack.artistName && (
            <p className="text-xs text-text-secondary truncate">{currentTrack.artistName}</p>
          )}
        </div>
      </div>

      {/* Main Controls */}
      <div className="flex-1 flex flex-col items-center justify-center max-w-2xl px-4">
        <div className="flex items-center gap-6 mb-2">
          <button className="text-text-secondary hover:text-text-primary transition-colors">
            <SkipBack className="w-5 h-5" />
          </button>
          
          <button 
            onClick={togglePlay}
            className="w-10 h-10 rounded-full bg-text-primary text-surface-elevated flex items-center justify-center hover:scale-105 transition-transform"
          >
            {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-1" />}
          </button>

          <button className="text-text-secondary hover:text-text-primary transition-colors">
            <SkipForward className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-3 w-full">
          <span className="text-[10px] font-medium text-text-secondary w-10 text-right font-mono">
            {formatTime(currentTime)}
          </span>
          
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="flex-1 h-1.5 bg-surface rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-text-primary [&::-webkit-slider-thumb]:rounded-full cursor-pointer hover:[&::-webkit-slider-thumb]:scale-125 transition-all accent-accent"
          />
          
          <span className="text-[10px] font-medium text-text-secondary w-10 font-mono">
            {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* Extra Controls */}
      <div className="w-1/4 min-w-[200px] flex items-center justify-end gap-4">
        <div className="flex items-center gap-2 w-32 group">
          <button onClick={toggleMute} className="text-text-secondary hover:text-text-primary">
            {volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={handleVolume}
            className="w-full h-1 bg-surface rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-0 group-hover:[&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:bg-text-primary [&::-webkit-slider-thumb]:rounded-full cursor-pointer transition-all accent-text-secondary"
          />
        </div>
        
        <button onClick={closePlayer} className="text-text-secondary hover:text-error transition-colors p-2" title="Cerrar reproductor">
          <X className="w-5 h-5" />
        </button>
      </div>

    </div>
  );
}
