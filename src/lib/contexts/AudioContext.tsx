'use client';

import React, { createContext, useContext, useState, useRef, useEffect, useMemo } from 'react';

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

interface AudioTimeState {
  currentTime: number;
  duration: number;
}

// Playback controls / state that changes rarely (once per track, not per tick).
// Kept separate from AudioTimeContext so that components which only need
// "what's playing" (lists, sidebars, context menus) don't re-render on every
// `timeupdate` event (~4x/sec) while a track is playing.
interface AudioControlsContextType {
  currentTrack: AudioTrack | null;
  isPlaying: boolean;
  playTrack: (track: AudioTrack) => void;
  togglePlay: () => void;
  seek: (time: number) => void;
  volume: number;
  setVolume: (v: number) => void;
  closePlayer: () => void;
  isLoading: boolean;
}

interface AudioContextType extends AudioControlsContextType, AudioTimeState {}

const AudioControlsContext = createContext<AudioControlsContextType | undefined>(undefined);
const AudioTimeContext = createContext<AudioTimeState>({ currentTime: 0, duration: 0 });

const noopControls: AudioControlsContextType = {
  currentTrack: null,
  isPlaying: false,
  playTrack: () => {},
  togglePlay: () => {},
  seek: () => {},
  volume: 1,
  setVolume: () => {},
  closePlayer: () => {},
  isLoading: false,
};

// Isolated from AudioProvider's own state: its re-renders (once per timeupdate
// tick) never bubble up into AudioControlsContext's value, so consumers of
// useAudioControls()/the non-time part of useAudio() are unaffected.
function AudioTimeBridge({
  audioRef,
  trackId,
  children,
}: {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  trackId: string | null;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<AudioTimeState>({ currentTime: 0, duration: 0 });

  // Reset immediately when the track changes, instead of waiting for the
  // next timeupdate/loadedmetadata event (avoids a flash of stale time/duration).
  useEffect(() => {
    setState({ currentTime: 0, duration: 0 });
  }, [trackId]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTimeUpdate = () => setState(s => (s.currentTime === el.currentTime ? s : { ...s, currentTime: el.currentTime }));
    const onLoadedMetadata = () => setState(s => ({ ...s, duration: isFinite(el.duration) ? el.duration : 0 }));
    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('loadedmetadata', onLoadedMetadata);
    return () => {
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.removeEventListener('loadedmetadata', onLoadedMetadata);
    };
  }, [audioRef]);

  return <AudioTimeContext.Provider value={state}>{children}</AudioTimeContext.Provider>;
}

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<AudioTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
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
      // Give an instant UI update instead of waiting for the browser's next
      // (throttled) native timeupdate event.
      audioRef.current.dispatchEvent(new Event('timeupdate'));
    }
  };

  const closePlayer = () => setCurrentTrack(null);

  const controlsValue = useMemo<AudioControlsContextType>(() => ({
    currentTrack,
    isPlaying,
    playTrack,
    togglePlay,
    seek,
    volume,
    setVolume,
    closePlayer,
    isLoading,
  }), [currentTrack, isPlaying, volume, isLoading]);

  return (
    <AudioControlsContext.Provider value={controlsValue}>
      <AudioTimeBridge audioRef={audioRef} trackId={currentTrack?.id ?? null}>
        {children}
      </AudioTimeBridge>
      {/* Real, mounted audio element handles all events cleanly */}
      <audio
        ref={audioRef}
        preload="none"
        onLoadedMetadata={() => setIsLoading(false)}
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
    </AudioControlsContext.Provider>
  );
}

/** Playback controls + state, WITHOUT currentTime/duration — does not re-render on every tick. */
export function useAudioControls(): AudioControlsContextType {
  const context = useContext(AudioControlsContext);
  return context ?? noopControls;
}

/** currentTime/duration only — for scrubbers/time displays. Re-renders every tick while playing. */
export function useAudioTime(): AudioTimeState {
  return useContext(AudioTimeContext);
}

/**
 * @deprecated Prefer `useAudioControls()` for playback controls (no per-tick
 * re-renders) and `useAudioTime()` for currentTime/duration. Kept for
 * backwards compatibility with existing call sites during the migration.
 */
export function useAudio(): AudioContextType {
  const controls = useAudioControls();
  const time = useAudioTime();
  return useMemo(() => ({ ...controls, ...time }), [controls, time]);
}
