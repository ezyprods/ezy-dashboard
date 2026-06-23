import { useState, useEffect, useRef, useCallback } from 'react';

interface UseAudioPlayerProps {
  currentTrackUrl: string | null;
  nextTrackUrl: string | null; // URL of the track to preload
  onTrackEnd: () => void;
  volume?: number;
  isMuted?: boolean;
}

export function useAudioPlayer({ 
  currentTrackUrl, 
  nextTrackUrl, 
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
  const preloadAudioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize or update the main audio element when the track URL changes
  useEffect(() => {
    if (!currentTrackUrl) return;

    setIsBuffering(true);
    setProgress(0);
    setCurrentTime(0);

    // Stop and clean up previous audio if it exists
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
    }

    // Did we already preload this exact URL?
    if (preloadAudioRef.current && preloadAudioRef.current.src.includes(currentTrackUrl)) {
      // Promote preloaded audio to main audio
      audioRef.current = preloadAudioRef.current;
      preloadAudioRef.current = null;
    } else {
      // Create new audio instance
      audioRef.current = new Audio(currentTrackUrl);
    }

    const audio = audioRef.current;
    audio.volume = isMuted ? 0 : volume;
    audio.preload = 'auto'; // Force browser to buffer

    // Event Listeners
    const handleTimeUpdate = () => {
      if (!audio.duration) return;
      setCurrentTime(audio.currentTime);
      setProgress((audio.currentTime / audio.duration) * 100);
    };

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
    };

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

    // If it was already playing, auto-play the new track
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
  }, [currentTrackUrl]); // Only re-run when the track URL actually changes!

  // Background preloading effect for the NEXT track
  useEffect(() => {
    if (!nextTrackUrl) {
      if (preloadAudioRef.current) {
        preloadAudioRef.current.removeAttribute('src');
        preloadAudioRef.current.load();
        preloadAudioRef.current = null;
      }
      return;
    }

    // Don't preload if it's already the current track (e.g. queue length 1)
    if (currentTrackUrl === nextTrackUrl) return;

    // Check if we already preloaded this track
    if (preloadAudioRef.current && preloadAudioRef.current.src.includes(nextTrackUrl)) return;

    // Create a hidden audio element to start buffering the next track
    const preloadAudio = new Audio(nextTrackUrl);
    preloadAudio.preload = 'auto';
    preloadAudio.volume = 0; // Mute just in case
    preloadAudioRef.current = preloadAudio;

  }, [nextTrackUrl, currentTrackUrl]);

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
  }, [isPlaying]);

  // Handle Volume changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Exposed Controls
  const togglePlay = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  const play = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

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
