'use client';

import React, { createContext, useContext, useState, useRef, useEffect } from 'react';

export interface AudioTrack {
  id: string;
  name: string;
  url: string;
  artistName?: string;
  coverArt?: string;
  pathSegments?: { name: string; url?: string; onClick?: () => void }[];
  bpm?: string | number | null;
  musicalKey?: string | null;
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
      // New track: update src and play
      setCurrentTrack(track);
      setIsLoading(true);
      setCurrentTime(0);
      setDuration(0);
      
      let finalUrl = track.url;
      // Guarantee reliable streaming endpoint
      if (!finalUrl || (finalUrl.includes('drive.google.com') || finalUrl.includes('googleusercontent.com')) && track.id) {
        finalUrl = `/api/audio/${track.id}`;
      } else if (track.id && !finalUrl.startsWith('/api/audio/')) {
        finalUrl = `/api/audio/${track.id}`;
      }
      
      audioRef.current.src = finalUrl;
      audioRef.current.load();
      
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          setIsPlaying(true);
          setIsLoading(false);
        }).catch(e => {
          console.warn('Audio play block/interrupt:', e);
          setIsPlaying(false);
          setIsLoading(false);
        });
      }

      // Automatically fetch extra info (artist, path) if missing
      if (!track.pathSegments && track.id) {
        fetch(`/api/audio/${track.id}/info`)
          .then(res => res.json())
          .then(data => {
            if (data.pathSegments) {
              setCurrentTrack(prev => prev && prev.id === track.id ? { 
                ...prev, 
                pathSegments: data.pathSegments,
                artistName: data.artistName || prev.artistName
              } : prev);
            }
          })
          .catch(err => console.error("Failed to load track info:", err));
      }
    }
  };

  const togglePlay = () => {
    if (!audioRef.current || !currentTrack) return;
    if (audioRef.current.paused) {
      setIsLoading(true);
      audioRef.current.play()
        .then(() => {
          setIsPlaying(true);
          setIsLoading(false);
        })
        .catch(e => {
          console.error('Audio resume error:', e);
          setIsLoading(false);
          setIsPlaying(false);
        });
    } else {
      audioRef.current.pause();
      setIsPlaying(false);
      setIsLoading(false);
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
        onLoadedMetadata={(e) => {
          setDuration(e.currentTarget.duration);
          setIsLoading(false);
        }}
        onLoadedData={() => setIsLoading(false)}
        onEnded={() => {
          setIsPlaying(false);
          setIsLoading(false);
        }}
        onPlay={() => setIsPlaying(true)}
        onPlaying={() => {
          setIsPlaying(true);
          setIsLoading(false);
        }}
        onPause={() => {
          setIsPlaying(false);
          setIsLoading(false);
        }}
        onCanPlay={() => setIsLoading(false)}
        onCanPlayThrough={() => setIsLoading(false)}
        onWaiting={() => setIsLoading(true)}
        onError={(e) => {
          if (currentTrack && audioRef.current?.src) {
            console.error('HTMLAudioElement error:', e);
          }
          setIsLoading(false);
          setIsPlaying(false);
        }}
        style={{ display: 'none' }}
      />
    </AudioContext.Provider>
  );
}

export function useAudio() {
  const context = useContext(AudioContext);
  if (!context) {
    return {
      currentTrack: null,
      isPlaying: false,
      duration: 0,
      currentTime: 0,
      playTrack: () => {},
      togglePlay: () => {},
      seek: () => {},
      volume: 1,
      setVolume: () => {},
      closePlayer: () => {},
      isLoading: false,
    };
  }
  return context;
}
