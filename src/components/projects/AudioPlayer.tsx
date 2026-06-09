'use client';

import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface AudioPlayerProps {
  fileId: string;
  fileName: string;
}

export function AudioPlayer({ fileId, fileName }: AudioPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#4f46e5', // Accent color
      progressColor: '#818cf8', // Lighter accent
      cursorColor: '#c7d2fe',
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 60,
      normalize: true,
    });

    wavesurferRef.current = ws;

    // Usar nuestra API de proxy para cargar el audio de forma segura
    ws.load(`/api/audio/${fileId}`);

    ws.on('ready', () => setIsReady(true));
    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));

    return () => {
      ws.destroy();
    };
  }, [fileId]);

  const togglePlay = () => {
    if (wavesurferRef.current) wavesurferRef.current.playPause();
  };

  const toggleMute = () => {
    if (wavesurferRef.current) {
      const newMuted = !isMuted;
      wavesurferRef.current.setVolume(newMuted ? 0 : 1);
      setIsMuted(newMuted);
    }
  };

  return (
    <div className="glass p-4 rounded-xl border border-border flex items-center gap-4 animate-fade-in">
      <Button 
        variant="secondary" 
        size="icon" 
        className="w-12 h-12 rounded-full shrink-0 bg-accent/10 text-accent hover:bg-accent/20 border-accent/20"
        onClick={togglePlay} 
        disabled={!isReady}
      >
        {!isReady ? (
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        ) : isPlaying ? (
          <Pause className="w-5 h-5 fill-current" />
        ) : (
          <Play className="w-5 h-5 fill-current ml-1" />
        )}
      </Button>

      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-end mb-2">
          <p className="text-sm font-semibold text-text-primary truncate">{fileName}</p>
        </div>
        <div ref={containerRef} className="w-full" />
      </div>

      <Button variant="ghost" size="icon" onClick={toggleMute} className="text-text-secondary">
        {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
      </Button>
    </div>
  );
}
