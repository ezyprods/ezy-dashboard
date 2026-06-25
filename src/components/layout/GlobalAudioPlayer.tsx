'use client';

import React, { useState } from 'react';
import { useAudio } from '@/lib/contexts/AudioContext';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, X, Music, Loader2, Download, Share2, Scissors } from 'lucide-react';
import { ShareModal } from '@/components/artists/ShareModal';
import { MiniDAWModal } from '@/components/projects/MiniDAWModal';

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function GlobalAudioPlayer() {
  const { currentTrack, isPlaying, duration, currentTime, togglePlay, seek, volume, setVolume, closePlayer, isLoading } = useAudio();
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isMiniDAWOpen, setIsMiniDAWOpen] = useState(false);

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
    <>
      <div className="fixed bottom-0 left-0 right-0 bg-surface-elevated/95 backdrop-blur-xl border-t border-border z-50 flex flex-col md:flex-row items-stretch md:items-center p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] md:py-0 md:px-6 h-auto md:h-24 animate-slide-up shadow-2xl gap-2 md:gap-0">
      
      {/* Top half on mobile / Left column on desktop */}
      <div className="flex items-center justify-between md:w-1/4 md:min-w-[200px] overflow-hidden gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 md:w-14 md:h-14 bg-surface rounded-md flex items-center justify-center overflow-hidden shrink-0 border border-border">
            {currentTrack.coverArt ? (
              <img src={currentTrack.coverArt} alt={currentTrack.name} className="w-full h-full object-cover" />
            ) : (
              <Music className="w-5 h-5 text-text-secondary" />
            )}
          </div>
          <div className="overflow-hidden">
            <p className="text-xs md:text-sm font-bold text-text-primary truncate" title={currentTrack.name}>{currentTrack.name}</p>
            {currentTrack.pathSegments && currentTrack.pathSegments.length > 0 ? (
              <p className="text-[10px] md:text-xs text-text-secondary truncate flex items-center gap-1">
                {currentTrack.pathSegments.map((seg, i) => (
                  <React.Fragment key={i}>
                    {seg.onClick ? (
                      <button onClick={seg.onClick} className="hover:text-text-primary hover:underline transition-colors text-left truncate">{seg.name}</button>
                    ) : seg.url ? (
                      <a href={seg.url} className="hover:text-text-primary hover:underline transition-colors">{seg.name}</a>
                    ) : (
                      <span>{seg.name}</span>
                    )}
                    {i < currentTrack.pathSegments!.length - 1 && <span>/</span>}
                  </React.Fragment>
                ))}
              </p>
            ) : currentTrack.artistName ? (
              <p className="text-[10px] md:text-xs text-text-secondary truncate">{currentTrack.artistName}</p>
            ) : null}
          </div>
        </div>
        
        {/* Mobile controls */}
        <div className="flex items-center gap-2 md:hidden">
          <div className="flex items-center gap-1 mr-1">
            <button onClick={() => setIsMiniDAWOpen(true)} className="text-text-secondary hover:text-accent-light p-1.5" title="Abrir en Mini-DAW">
              <Scissors className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setIsShareModalOpen(true)} className="text-text-secondary hover:text-accent p-1.5" title="Compartir">
              <Share2 className="w-3.5 h-3.5" />
            </button>
            <a href={`/api/files/${currentTrack.id}?download=true`} download={currentTrack.name} className="text-text-secondary hover:text-text-primary p-1.5" title="Descargar">
              <Download className="w-3.5 h-3.5" />
            </a>
          </div>
          <button 
            onClick={togglePlay}
            disabled={isLoading}
            className="w-11 h-11 rounded-full bg-text-primary text-surface-elevated flex items-center justify-center disabled:opacity-70 touch-target"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin text-surface-elevated" /> : isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
          </button>
          <button onClick={closePlayer} className="text-text-secondary hover:text-error p-2 min-h-[44px] min-w-[44px] flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Center: Progress & Skip Controls */}
      <div className="flex-1 flex flex-col items-center justify-center max-w-2xl md:px-4">
        {/* Skip controls: Desktop only */}
        <div className="hidden md:flex items-center gap-6 mb-2">
          <button className="text-text-secondary hover:text-text-primary transition-colors">
            <SkipBack className="w-5 h-5" />
          </button>
          
          <button 
            onClick={togglePlay}
            disabled={isLoading}
            className="w-10 h-10 rounded-full bg-text-primary text-surface-elevated flex items-center justify-center hover:scale-105 transition-transform disabled:opacity-70 disabled:hover:scale-100"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin text-surface-elevated" /> : isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-1" />}
          </button>

          <button className="text-text-secondary hover:text-text-primary transition-colors">
            <SkipForward className="w-5 h-5" />
          </button>
        </div>

        {/* Progress slider: Width fits all screens */}
        <div className="flex items-center gap-2 w-full">
          <span className="text-[9px] font-medium text-text-secondary w-8 text-right font-mono">
            {formatTime(currentTime)}
          </span>
          
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="flex-1 h-3 md:h-1 bg-surface rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 md:[&::-webkit-slider-thumb]:w-2.5 md:[&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:bg-text-primary [&::-webkit-slider-thumb]:rounded-full cursor-pointer accent-accent"
          />
          
          <span className="text-[9px] font-medium text-text-secondary w-8 font-mono">
            {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* Right side: volume and close (desktop only) */}
      <div className="hidden md:flex w-1/4 min-w-[200px] items-center justify-end gap-4">
        <div className="flex items-center gap-3 border-r border-border/50 pr-4">
          <button onClick={() => setIsMiniDAWOpen(true)} className="text-text-secondary hover:text-accent-light transition-colors" title="Abrir en Mini-DAW">
            <Scissors className="w-4 h-4" />
          </button>
          <button onClick={() => setIsShareModalOpen(true)} className="text-text-secondary hover:text-accent transition-colors" title="Compartir">
            <Share2 className="w-4 h-4" />
          </button>
          <a href={`/api/files/${currentTrack.id}?download=true`} download={currentTrack.name} className="text-text-secondary hover:text-text-primary transition-colors" title="Descargar">
            <Download className="w-4 h-4" />
          </a>
        </div>
        
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
      
      {/* Modals */}
      {isShareModalOpen && (
        <ShareModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          fileId={currentTrack.id}
          fileName={currentTrack.name}
        />
      )}
      
      {isMiniDAWOpen && (
        <MiniDAWModal
          fileId={currentTrack.id}
          fileName={currentTrack.name}
          onClose={() => setIsMiniDAWOpen(false)}
        />
      )}
    </>
  );
}
