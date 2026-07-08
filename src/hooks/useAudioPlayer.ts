import { useState, useEffect, useRef, useCallback } from 'react';

interface UseAudioPlayerProps {
  currentTrackUrl: string | null;
  nextTrackUrl?: string | null;
  preloadUrls?: string[]; // Kept for backward compatibility, but ignored for efficiency
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
  const nextAudioRef = useRef<HTMLAudioElement | null>(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      [audioRef.current, nextAudioRef.current].forEach(audio => {
        if (audio) {
          audio.pause();
          audio.removeAttribute('src');
          audio.load();
        }
      });
      audioRef.current = null;
      nextAudioRef.current = null;
    };
  }, []);

  // Preload NEXT track efficiently
  useEffect(() => {
    if (!nextTrackUrl) return;

    // Si la siguiente url ya es la que se está reproduciendo, no hacer nada
    if (currentTrackUrl === nextTrackUrl) return;

    // Si ya tenemos un preload para esta URL, no hacer nada
    if (nextAudioRef.current && nextAudioRef.current.src.endsWith(nextTrackUrl)) return;

    // Limpiar preload anterior si existe
    if (nextAudioRef.current) {
      nextAudioRef.current.pause();
      nextAudioRef.current.removeAttribute('src');
      nextAudioRef.current.load();
    }

    // Crear nuevo preload
    const preloadAudio = new Audio(nextTrackUrl);
    preloadAudio.preload = 'auto'; // El navegador gestionará 1 solo stream en background perfectamente
    preloadAudio.volume = 0; // Muteado por si acaso
    
    nextAudioRef.current = preloadAudio;
  }, [nextTrackUrl, currentTrackUrl]);

  // Main playback logic
  useEffect(() => {
    if (!currentTrackUrl) return;

    setIsBuffering(true);
    setProgress(0);
    setCurrentTime(0);

    let audio: HTMLAudioElement;

    // ¿El track que queremos reproducir ya estaba pre-cargado en el nextAudioRef?
    if (nextAudioRef.current && nextAudioRef.current.src.endsWith(currentTrackUrl)) {
      // Magia: Intercambiamos el buffer pre-cargado como nuestro track principal
      audio = nextAudioRef.current;
      nextAudioRef.current = null;
      
      // Limpiamos el track principal anterior
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
        audioRef.current.load();
      }
      
      audioRef.current = audio;
    } else {
      // No estaba pre-cargado, instanciamos uno nuevo
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
        audioRef.current.load();
      }
      audio = new Audio(currentTrackUrl);
      audio.preload = 'auto';
      audioRef.current = audio;
    }

    audio.volume = isMuted ? 0 : volume;

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
