import { useState, useEffect, useRef, useCallback } from 'react';

interface UseAudioPlayerProps {
  currentTrackUrl: string | null;
  nextTrackUrl?: string | null; // Kept for backward compatibility
  preloadUrls?: string[]; // Array of URLs to preload aggressively
  onTrackEnd: () => void;
  volume?: number;
  isMuted?: boolean;
}

export function useAudioPlayer({ 
  currentTrackUrl, 
  nextTrackUrl, 
  preloadUrls = [],
  onTrackEnd, 
  volume = 1, 
  isMuted = false 
}: UseAudioPlayerProps) {
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const preloadCache = useRef<Map<string, HTMLAudioElement>>(new Map());

  // Consolidate preload URLs
  const urlsToPreload = useRef<Set<string>>(new Set());
  useEffect(() => {
    const newPreloadSet = new Set<string>();
    if (nextTrackUrl) newPreloadSet.add(nextTrackUrl);
    preloadUrls.forEach(url => { if (url) newPreloadSet.add(url); });
    urlsToPreload.current = newPreloadSet;

    // Create new audio objects for URLs not yet in cache
    newPreloadSet.forEach(url => {
      if (!preloadCache.current.has(url) && url !== currentTrackUrl) {
        const audio = new Audio(url);
        audio.preload = 'auto';
        audio.volume = 0; // Mute preloads
        preloadCache.current.set(url, audio);
      }
    });

    // Clean up old cached audios that are no longer needed
    for (const [url, audio] of preloadCache.current.entries()) {
      if (!newPreloadSet.has(url) && url !== currentTrackUrl) {
        audio.removeAttribute('src');
        audio.load();
        preloadCache.current.delete(url);
      }
    }
  }, [nextTrackUrl, preloadUrls, currentTrackUrl]);

  // Clean up cache on unmount
  useEffect(() => {
    return () => {
      for (const audio of preloadCache.current.values()) {
        audio.removeAttribute('src');
        audio.load();
      }
      preloadCache.current.clear();
    };
  }, []);

  // Initialize or update the main audio element when the track URL changes
  useEffect(() => {
    if (!currentTrackUrl) return;

    setIsBuffering(true);
    setProgress(0);
    setCurrentTime(0);

    // Stop and clean up previous audio if it exists
    if (audioRef.current) {
      audioRef.current.pause();
      // If we want to reuse it later, we could put it back in the cache, but usually we don't need to unless it's in the preload list
      if (!urlsToPreload.current.has(audioRef.current.src)) {
        audioRef.current.removeAttribute('src');
        audioRef.current.load();
      }
    }

    // Did we already preload this exact URL?
    if (preloadCache.current.has(currentTrackUrl)) {
      audioRef.current = preloadCache.current.get(currentTrackUrl)!;
      preloadCache.current.delete(currentTrackUrl);
    } else {
      audioRef.current = new Audio(currentTrackUrl);
    }

    const audio = audioRef.current;
    audio.volume = isMuted ? 0 : volume;
    audio.preload = 'auto'; 

    const handleTimeUpdate = () => {
      if (!audio.duration) return;
      setCurrentTime(audio.currentTime);
      setProgress((audio.currentTime / audio.duration) * 100);
    };

    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleWaiting = () => setIsBuffering(true);
    const handleCanPlay = () => setIsBuffering(false);
    const handlePlaying = () => setIsBuffering(false);
    const handleEnded = () => {
      setIsPlaying(false);
      onTrackEnd();
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('ended', handleEnded);

    if (isPlaying) {
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(e => {
          console.warn("Audio play blocked:", e);
          setIsPlaying(false);
          setIsBuffering(false);
        });
      }
    }

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [currentTrackUrl]); // Notice we don't depend on isPlaying to avoid remounting, the start logic uses the current state

  // Handle Play/Pause changes from UI
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying && audio.paused) {
      audio.play().catch(e => {
        console.warn("Play interrupted:", e);
        setIsPlaying(false);
      });
    } else if (!isPlaying && !audio.paused) {
      audio.pause();
    }
  }, [isPlaying, currentTrackUrl]);

  // Handle Volume changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  const togglePlay = useCallback(() => setIsPlaying(prev => !prev), []);
  const play = useCallback(() => setIsPlaying(true), []);
  const pause = useCallback(() => setIsPlaying(false), []);

  const seekTo = useCallback((timeOrEvent: number | React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;

    if (typeof timeOrEvent === 'number') {
      audio.currentTime = timeOrEvent;
    } else {
      const rect = timeOrEvent.currentTarget.getBoundingClientRect();
      const pos = (timeOrEvent.clientX - rect.left) / rect.width;
      audio.currentTime = pos * duration;
    }
  }, [duration]);

  return {
    isPlaying,
    isBuffering,
    progress,
    currentTime,
    duration,
    togglePlay,
    play,
    pause,
    seekTo,
    setIsPlaying
  };
}
