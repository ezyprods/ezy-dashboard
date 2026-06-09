'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, FileAudio, SkipBack, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface AudioPlayerProps {
  fileId: string;
  fileName: string;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function AudioPlayer({ fileId, fileName }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.src = `/api/audio/${fileId}`;
    audioRef.current = audio;

    const onLoadedMetadata = () => {
      setDuration(audio.duration);
      setIsLoaded(true);
    };
    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (audio.duration > 0) setProgress((audio.currentTime / audio.duration) * 100);
    };
    const onEnded = () => setIsPlaying(false);
    const onCanPlay = () => setIsLoaded(true);

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('canplay', onCanPlay);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('canplay', onCanPlay);
      audio.src = '';
    };
  }, [fileId]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play();
      setIsPlaying(true);
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, []);

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
    setIsMuted(!isMuted);
  }, [isMuted]);

  const seek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const bar = progressRef.current;
    if (!audio || !bar) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = pct * audio.duration;
  }, []);

  const skipBack = useCallback(() => {
    if (audioRef.current) audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 5);
  }, []);

  const skipForward = useCallback(() => {
    if (audioRef.current) audioRef.current.currentTime = Math.min(audioRef.current.duration, audioRef.current.currentTime + 5);
  }, []);

  // Strip extension for display
  const displayName = fileName.replace(/\.[^/.]+$/, '');

  return (
    <div className="p-4 rounded-xl border border-border bg-surface-elevated/50 flex items-center gap-4 animate-fade-in group hover:border-accent/30 transition-colors">
      {/* File icon */}
      <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
        <FileAudio className="w-5 h-5 text-accent" />
      </div>

      {/* Play/Pause */}
      <Button
        variant="ghost"
        size="icon"
        className="w-10 h-10 rounded-full shrink-0 bg-accent/10 text-accent hover:bg-accent/20"
        onClick={togglePlay}
      >
        {isPlaying ? (
          <Pause className="w-4 h-4 fill-current" />
        ) : (
          <Play className="w-4 h-4 fill-current ml-0.5" />
        )}
      </Button>

      {/* Track info + progress */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate mb-2">{displayName}</p>

        {/* Progress bar */}
        <div
          ref={progressRef}
          onClick={seek}
          className="w-full h-1.5 bg-border rounded-full cursor-pointer group/bar relative"
        >
          <div
            className="h-full bg-accent rounded-full transition-[width] duration-100 relative"
            style={{ width: `${progress}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-accent shadow-lg opacity-0 group-hover/bar:opacity-100 transition-opacity" />
          </div>
        </div>

        {/* Time */}
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-text-secondary font-mono">{formatTime(currentTime)}</span>
          <span className="text-[10px] text-text-secondary font-mono">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Skip controls */}
      <div className="hidden sm:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={skipBack} className="p-1 text-text-secondary hover:text-text-primary transition-colors">
          <SkipBack className="w-3.5 h-3.5" />
        </button>
        <button onClick={skipForward} className="p-1 text-text-secondary hover:text-text-primary transition-colors">
          <SkipForward className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Volume */}
      <button onClick={toggleMute} className="text-text-secondary hover:text-text-primary transition-colors p-1">
        {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
      </button>
    </div>
  );
}
