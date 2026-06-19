'use client';

import React, { createContext, useContext, useState, useRef, useEffect } from 'react';

export interface AudioTrack {
  id: string;
  name: string;
  url: string;
  artistName?: string;
  coverArt?: string;
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
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<AudioTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    const audio = audioRef.current;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  // Sync volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Handle play/pause state changes — only handles PAUSE here.
  // PLAY is triggered by the canplay event inside playTrack() to avoid race conditions.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    if (!isPlaying) {
      audio.pause();
    } else if (audio.readyState >= 3) {
      // Only auto-play if data is already loaded (e.g. toggling pause/resume)
      audio.play().catch(e => console.error('Audio resume error:', e));
    }
  }, [isPlaying]);

  const playTrack = async (track: AudioTrack) => {
    if (!audioRef.current) return;
    
    // If it's the same track, just toggle play
    if (currentTrack?.id === track.id) {
      setIsPlaying(prev => !prev);
      return;
    }

    // Stop current track cleanly
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    // New track — always route through the secure API proxy to get the direct Drive streaming URL
    try {
      const res = await fetch(`/api/audio/${track.id}/resolve`);
      if (!res.ok) throw new Error('Failed to resolve audio URL');
      const data = await res.json();
      
      setCurrentTrack(track);
      audioRef.current.src = data.url;
      audioRef.current.load();

      // Wait for enough data before playing to avoid empty-play bug
      const onCanPlay = () => {
        audioRef.current?.removeEventListener('canplay', onCanPlay);
        audioRef.current?.play().catch(e => console.error('Audio play error:', e));
        setIsPlaying(true);
      };
      audioRef.current.addEventListener('canplay', onCanPlay, { once: true });

      // Fallback: if canplay never fires within 8s, try playing anyway
      setTimeout(() => {
        audioRef.current?.removeEventListener('canplay', onCanPlay);
      }, 8000);
    } catch (e) {
      console.error('Audio resolve error:', e);
    }
  };

  const togglePlay = () => {
    if (currentTrack) {
      setIsPlaying(!isPlaying);
    }
  };

  const seek = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const closePlayer = () => {
    setIsPlaying(false);
    setCurrentTrack(null);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
  };

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
      closePlayer
    }}>
      {children}
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
