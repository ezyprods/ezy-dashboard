'use client';

import React, { useState } from 'react';
import { useAudio } from '@/lib/contexts/AudioContext';
import { formatMusicalKey } from '@/lib/utils/audio';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, X, Music, Loader2, Download, Share2, Scissors, User, ExternalLink, MoreVertical } from 'lucide-react';
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isTabletMenuOpen, setIsTabletMenuOpen] = useState(false);

  if (!currentTrack) return null;

  const artistUrl = currentTrack.pathSegments?.find(seg => seg.url?.startsWith('/artists/'))?.url;

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
      <div className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+68px)] md:bottom-0 left-0 right-0 bg-surface-elevated/95 backdrop-blur-xl border-t border-border z-35 md:z-50 animate-slide-up shadow-2xl">
        
        {/* ── Mobile Player (Single Row ~58px) ── */}
        <div className="md:hidden flex flex-col w-full">
          {/* Top scrubber bar */}
          <div className="relative w-full h-1 bg-surface cursor-pointer group">
            <div 
              className="h-full bg-accent transition-all duration-100" 
              style={{ width: `${duration ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0}%` }} 
            />
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              aria-label="Progreso del audio"
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between px-3 h-[58px] gap-2">
            {/* Cover & Title */}
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-10 h-10 bg-surface rounded-lg flex items-center justify-center overflow-hidden shrink-0 border border-border">
                {currentTrack.coverArt ? (
                  <img src={currentTrack.coverArt} alt={currentTrack.name} className="w-full h-full object-cover" />
                ) : (
                  <Music className="w-5 h-5 text-text-secondary" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-bold text-text-primary truncate" title={currentTrack.name}>
                    {currentTrack.name}
                  </p>
                  {(currentTrack.bpm || currentTrack.musicalKey) && (
                    <span className="text-[8px] font-mono px-1 py-0.5 rounded border text-emerald-400 bg-emerald-500/10 border-emerald-500/20 whitespace-nowrap shrink-0">
                      {currentTrack.bpm ? `${currentTrack.bpm} BPM` : formatMusicalKey(currentTrack.musicalKey!)}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-text-secondary truncate">
                  {currentTrack.artistName || (currentTrack.pathSegments && currentTrack.pathSegments.length > 0 ? currentTrack.pathSegments[currentTrack.pathSegments.length - 1]?.name : '')}
                </p>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-1 shrink-0">
              <button 
                onClick={togglePlay}
                disabled={isLoading}
                aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
                className="w-9 h-9 rounded-full bg-text-primary text-surface-elevated flex items-center justify-center disabled:opacity-70 shadow-md active:scale-95 transition-transform"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin text-surface-elevated" /> : isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
              </button>

              <div className="relative">
                <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  aria-label="Más opciones"
                  className="w-8 h-8 rounded-full flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface transition-colors"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {isMobileMenuOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs"
                      onClick={() => setIsMobileMenuOpen(false)}
                    />
                    <div className="absolute bottom-full right-0 mb-2 w-52 bg-surface-elevated border border-border rounded-2xl p-1.5 shadow-2xl z-50 animate-menu-in flex flex-col gap-0.5">
                      {artistUrl && (
                        <a
                          href={artistUrl}
                          onClick={() => setIsMobileMenuOpen(false)}
                          className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface rounded-xl transition-colors"
                        >
                          <User className="w-4 h-4 text-accent" />
                          <span>Perfil de Artista</span>
                        </a>
                      )}
                      <a
                        href={`https://drive.google.com/file/d/${currentTrack.id}/view`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface rounded-xl transition-colors"
                      >
                        <ExternalLink className="w-4 h-4 text-text-secondary" />
                        <span>Abrir en Drive</span>
                      </a>
                      <button
                        onClick={() => {
                          setIsMiniDAWOpen(true);
                          setIsMobileMenuOpen(false);
                        }}
                        className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface rounded-xl transition-colors text-left"
                      >
                        <Scissors className="w-4 h-4 text-accent-light" />
                        <span>Mini-DAW</span>
                      </button>
                      <button
                        onClick={() => {
                          setIsShareModalOpen(true);
                          setIsMobileMenuOpen(false);
                        }}
                        className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface rounded-xl transition-colors text-left"
                      >
                        <Share2 className="w-4 h-4 text-accent" />
                        <span>Compartir</span>
                      </button>
                      <a
                        href={`/api/files/${currentTrack.id}?download=true`}
                        download={currentTrack.name}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface rounded-xl transition-colors"
                      >
                        <Download className="w-4 h-4 text-text-secondary" />
                        <span>Descargar</span>
                      </a>
                    </div>
                  </>
                )}
              </div>

              <button
                onClick={closePlayer}
                aria-label="Cerrar reproductor"
                title="Cerrar reproductor"
                className="w-8 h-8 rounded-full flex items-center justify-center text-text-secondary hover:text-error hover:bg-surface transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Desktop & Tablet Player (h-20 md:h-22 lg:h-24) ── */}
        <div className="hidden md:flex items-center justify-between px-4 lg:px-6 h-20 lg:h-24 w-full">
          {/* Left Column: Track Info */}
          <div className="flex items-center gap-2.5 lg:gap-3 w-auto max-w-[160px] lg:max-w-[240px] xl:w-1/4 shrink-0 overflow-hidden">
            <div className="w-11 h-11 lg:w-14 lg:h-14 bg-surface rounded-md flex items-center justify-center overflow-hidden shrink-0 border border-border">
              {currentTrack.coverArt ? (
                <img src={currentTrack.coverArt} alt={currentTrack.name} className="w-full h-full object-cover" />
              ) : (
                <Music className="w-5 h-5 text-text-secondary" />
              )}
            </div>
            <div className="overflow-hidden min-w-0">
              <div className="flex items-center gap-1.5 lg:gap-2">
                <p className="text-xs lg:text-sm font-bold text-text-primary truncate" title={currentTrack.name}>{currentTrack.name}</p>
                {(currentTrack.bpm || currentTrack.musicalKey) && (
                  <div className="hidden lg:flex items-center gap-1 shrink-0">
                    {currentTrack.bpm && (
                      <span className="text-[9px] font-mono px-1 py-0.5 rounded border text-emerald-400 bg-emerald-500/10 border-emerald-500/20 whitespace-nowrap">
                        {currentTrack.bpm} BPM
                      </span>
                    )}
                    {currentTrack.musicalKey && (
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border text-violet-400 bg-violet-500/10 border-violet-500/20 whitespace-nowrap tracking-wide">
                        {formatMusicalKey(currentTrack.musicalKey)}
                      </span>
                    )}
                  </div>
                )}
              </div>
              {currentTrack.pathSegments && currentTrack.pathSegments.length > 0 ? (
                <p className="text-[11px] lg:text-xs text-text-secondary truncate flex items-center gap-1">
                  {currentTrack.pathSegments.map((seg, i) => (
                    <React.Fragment key={i}>
                      {seg.onClick ? (
                        <button onClick={seg.onClick} className="hover:text-text-primary hover:underline transition-colors text-left truncate">{seg.name}</button>
                      ) : seg.url ? (
                        <a 
                          href={seg.url} 
                          className="hover:text-text-primary hover:underline transition-colors"
                          target={seg.url.includes('drive.google.com') ? '_blank' : undefined}
                          rel={seg.url.includes('drive.google.com') ? 'noopener noreferrer' : undefined}
                        >
                          {seg.name}
                        </a>
                      ) : (
                        <span>{seg.name}</span>
                      )}
                      {i < currentTrack.pathSegments!.length - 1 && <span>/</span>}
                    </React.Fragment>
                  ))}
                </p>
              ) : currentTrack.artistName ? (
                <p className="text-[11px] lg:text-xs text-text-secondary truncate">{currentTrack.artistName}</p>
              ) : null}
            </div>
          </div>

          {/* Center Column: Controls & Scrubber */}
          <div className="flex-1 min-w-0 flex flex-col items-center justify-center max-w-2xl px-2 sm:px-4">
            <div className="flex items-center gap-4 lg:gap-6 mb-1.5 lg:mb-2">
              <button className="text-text-secondary hover:text-text-primary transition-colors">
                <SkipBack className="w-4 h-4 lg:w-5 lg:h-5" />
              </button>
              
              <button 
                onClick={togglePlay}
                disabled={isLoading}
                className="w-9 h-9 lg:w-10 lg:h-10 rounded-full bg-text-primary text-surface-elevated flex items-center justify-center hover:scale-105 transition-transform disabled:opacity-70 disabled:hover:scale-100"
              >
                {isLoading ? <Loader2 className="w-4 h-4 lg:w-5 lg:h-5 animate-spin text-surface-elevated" /> : isPlaying ? <Pause className="w-4 h-4 lg:w-5 lg:h-5 fill-current" /> : <Play className="w-4 h-4 lg:w-5 lg:h-5 fill-current ml-0.5 lg:ml-1" />}
              </button>

              <button className="text-text-secondary hover:text-text-primary transition-colors">
                <SkipForward className="w-4 h-4 lg:w-5 lg:h-5" />
              </button>
            </div>

            <div className="flex items-center gap-2 w-full min-w-0">
              <span className="text-[9px] font-medium text-text-secondary w-7 lg:w-8 text-right font-mono shrink-0">
                {formatTime(currentTime)}
              </span>
              
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                className="flex-1 min-w-[50px] h-1 bg-surface rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:bg-text-primary [&::-webkit-slider-thumb]:rounded-full cursor-pointer accent-accent"
              />
              
              <span className="text-[9px] font-medium text-text-secondary w-7 lg:w-8 font-mono shrink-0">
                {formatTime(duration)}
              </span>
            </div>
          </div>

          {/* Right Column: Actions, Volume & Close */}
          <div className="w-auto shrink-0 flex items-center justify-end gap-2 lg:gap-4">
            {/* Inline Action Icons on Large Screens (xl:flex) */}
            <div className="hidden xl:flex items-center gap-3 border-r border-border/50 pr-4">
              {artistUrl && (
                <a href={artistUrl} className="text-text-secondary hover:text-accent-light transition-colors" title="Abrir Perfil de Artista">
                  <User className="w-4 h-4" />
                </a>
              )}
              <a href={`https://drive.google.com/file/d/${currentTrack.id}/view`} target="_blank" rel="noopener noreferrer" className="text-text-secondary hover:text-accent-light transition-colors" title="Abrir en Drive">
                <ExternalLink className="w-4 h-4" />
              </a>
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

            {/* Tablet Menu Dropdown Button (hidden on mobile and xl) */}
            <div className="relative hidden md:block xl:hidden">
              <button
                onClick={() => setIsTabletMenuOpen(!isTabletMenuOpen)}
                aria-label="Más opciones del audio"
                title="Más opciones"
                className="w-8 h-8 rounded-full flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface transition-colors"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {isTabletMenuOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs"
                    onClick={() => setIsTabletMenuOpen(false)}
                  />
                  <div className="absolute bottom-full right-0 mb-2 w-52 bg-surface-elevated border border-border rounded-2xl p-1.5 shadow-2xl z-50 animate-menu-in flex flex-col gap-0.5">
                    {artistUrl && (
                      <a
                        href={artistUrl}
                        onClick={() => setIsTabletMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface rounded-xl transition-colors"
                      >
                        <User className="w-4 h-4 text-accent" />
                        <span>Perfil de Artista</span>
                      </a>
                    )}
                    <a
                      href={`https://drive.google.com/file/d/${currentTrack.id}/view`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setIsTabletMenuOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface rounded-xl transition-colors"
                    >
                      <ExternalLink className="w-4 h-4 text-text-secondary" />
                      <span>Abrir en Drive</span>
                    </a>
                    <button
                      onClick={() => {
                        setIsMiniDAWOpen(true);
                        setIsTabletMenuOpen(false);
                      }}
                      className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface rounded-xl transition-colors text-left"
                    >
                      <Scissors className="w-4 h-4 text-accent-light" />
                      <span>Mini-DAW</span>
                    </button>
                    <button
                      onClick={() => {
                        setIsShareModalOpen(true);
                        setIsTabletMenuOpen(false);
                      }}
                      className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface rounded-xl transition-colors text-left"
                    >
                      <Share2 className="w-4 h-4 text-accent" />
                      <span>Compartir</span>
                    </button>
                    <a
                      href={`/api/files/${currentTrack.id}?download=true`}
                      download={currentTrack.name}
                      onClick={() => setIsTabletMenuOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface rounded-xl transition-colors"
                    >
                      <Download className="w-4 h-4 text-text-secondary" />
                      <span>Descargar</span>
                    </a>
                  </div>
                </>
              )}
            </div>
            
            {/* Volume Control */}
            <div className="flex items-center gap-1.5 lg:gap-2 w-16 sm:w-20 lg:w-28 group shrink-0">
              <button onClick={toggleMute} className="text-text-secondary hover:text-text-primary shrink-0" title={volume === 0 ? "Reactivar sonido" : "Silenciar"}>
                {volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={handleVolume}
                aria-label="Control de volumen"
                className="w-full min-w-[36px] h-1 bg-surface rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-0 group-hover:[&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:bg-text-primary [&::-webkit-slider-thumb]:rounded-full cursor-pointer transition-all accent-text-secondary"
              />
            </div>
            
            <button onClick={closePlayer} className="text-text-secondary hover:text-error transition-colors p-1.5 lg:p-2 shrink-0" title="Cerrar reproductor">
              <X className="w-5 h-5" />
            </button>
          </div>
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
