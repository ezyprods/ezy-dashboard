'use client';

import React, { createContext, useContext, useState, useRef, useEffect } from 'react';

export interface AudioTrack {
  id: string;
  name: string;
  url: string;
  artistName?: string;
  coverArt?: string;
  pathSegments?: { name: string; url?: string; onClick?: () => void }[];
  bpm?: string | number;
  musicalKey?: string;
}

interface AudioContextType {
  currentTrack: AudioTrack | null;
  isPlaying: boolean;
  duration: number;
  currentTime: number;
  playTrack: (track: AudioTrack) => void;
  togglePlay: () => void;
  seek: (time: number) => void;
  volume: number;
  setVolume: (v: number) => void;
  closePlayer: () => void;
  isLoading: boolean;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<AudioTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Sync volume safely
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // If track is cleared, pause audio
  useEffect(() => {
    if (!currentTrack && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      setIsPlaying(false);
    }
  }, [currentTrack]);

  const playTrack = (track: AudioTrack) => {
    if (!audioRef.current) return;

    if (currentTrack?.id === track.id) {
      // Toggle if same track
      if (audioRef.current.paused) {
        audioRef.current.play().catch(e => console.error('Audio resume error:', e));
        setIsPlaying(true);
      } else {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    } else {
      // New track: load and play synchronously
      setCurrentTrack(track);
      setIsLoading(true);
      audioRef.current.src = track.url;
      audioRef.current.load();
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(e => {
        console.error('Audio play error:', e);
        // If auto-play blocked, still set state so UI reflects it tried
        setIsPlaying(true);
      });
    }
  };

  const togglePlay = () => {
    if (!audioRef.current || !currentTrack) return;
    if (audioRef.current.paused) {
      audioRef.current.play().catch(e => console.error('Audio resume error:', e));
      setIsPlaying(true);
    } else {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const seek = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const closePlayer = () => setCurrentTrack(null);

  return (
    <AudioContext.Provider value={{
      currentTrack,
      isPlaying,
      duration,
      currentTime,
      playTrack,
      togglePlay,
      seek,
      volume,
      setVolume,
      closePlayer,
      isLoading
    }}>
      {children}
      {/* Real, mounted audio element handles all events cleanly */}
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onCanPlay={() => setIsLoading(false)}
        onWaiting={() => setIsLoading(true)}
        style={{ display: 'none' }}
      />
    </AudioContext.Provider>
  );
}

export function useAudio() {
  const context = useContext(AudioContext);
  if (context === undefined) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
}
