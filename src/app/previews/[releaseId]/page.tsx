'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, Play, Pause, SkipForward, SkipBack, Disc, Share2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { customAlert, customConfirm, customPrompt } from '@/lib/dialog';


// Un visor público simplificado para los lanzamientos
export default function PublicPreviewPage() {
  const params = useParams();
  const releaseId = params.releaseId as string;
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [release, setRelease] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    fetchRelease();
  }, [releaseId]);

  const fetchRelease = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/releases/${releaseId}`);
      if (!res.ok) throw new Error('Preview no encontrado o privado');
      const data = await res.json();
      
      // Comprobar si es público. Si no lo es, mostrar error (a menos que estemos logueados, pero para simplificar, 
      // confiaremos en que la API devuelva 403 si es privado y no estamos logueados).
      if (!data.release.isPublic) {
        // Podríamos comprobar sesión aquí, pero la API debería bloquearlo si no eres dueño
      }
      
      setRelease(data.release);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const currentTrack = release?.tracks?.[currentTrackIndex];

  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.play().catch(() => setIsPlaying(false));
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, currentTrackIndex]);

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setProgress((audioRef.current.currentTime / audioRef.current.duration) * 100);
    }
  };

  const handleTrackEnd = () => {
    if (release && currentTrackIndex < release.tracks.length - 1) {
      setCurrentTrackIndex(prev => prev + 1);
    } else {
      setIsPlaying(false);
      setProgress(0);
    }
  };

  const playTrack = (index: number) => {
    if (currentTrackIndex === index) {
      setIsPlaying(!isPlaying);
    } else {
      setCurrentTrackIndex(index);
      setIsPlaying(true);
      setProgress(0);
    }
  };

  if (isLoading) return <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>;
  
  if (error || !release) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-4">
        <div className="glass p-8 rounded-2xl text-center max-w-md w-full border-white/10">
          <AlertCircle className="w-12 h-12 text-warning mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Acceso Denegado</h2>
          <p className="text-gray-400">Esta preview es privada o no existe.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white selection:bg-accent/30 flex flex-col md:flex-row">
      {/* Reproductor oculto */}
      {currentTrack && (
        <audio
          ref={audioRef}
          src={`/api/audio/${currentTrack.fileId}`}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleTrackEnd}
          autoPlay={isPlaying}
        />
      )}

      {/* Panel Izquierdo: Portada y Reproductor */}
      <div className="w-full md:w-[450px] lg:w-[550px] p-8 md:p-12 lg:p-16 flex flex-col justify-center items-center relative z-10 border-r border-white/10 bg-[#111]">
        <div className="w-full max-w-sm aspect-square bg-[#1A1A1A] rounded-2xl shadow-2xl mb-8 flex items-center justify-center overflow-hidden relative group">
          {release.coverArtId ? (
            <img src={`/api/audio/${release.coverArtId}`} alt="Cover" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
          ) : (
            <Disc className="w-32 h-32 text-white/10" />
          )}
        </div>

        <div className="w-full max-w-sm text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2 tracking-tight">{release.title}</h1>
          <p className="text-accent font-medium tracking-wide uppercase text-sm">Escucha Exclusiva</p>
        </div>

        {/* Player Controls */}
        <div className="w-full max-w-sm">
          {currentTrack ? (
            <>
              <div className="text-center mb-6">
                <h3 className="font-semibold text-lg truncate">{currentTrack.title}</h3>
                <p className="text-sm text-gray-500 font-mono mt-1">Pista {currentTrackIndex + 1} de {release.tracks.length}</p>
              </div>

              {/* Progress Bar */}
              <div className="h-1.5 w-full bg-white/10 rounded-full mb-8 overflow-hidden cursor-pointer" onClick={(e) => {
                if (audioRef.current) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pos = (e.clientX - rect.left) / rect.width;
                  audioRef.current.currentTime = pos * audioRef.current.duration;
                }
              }}>
                <div className="h-full bg-accent transition-all duration-100 ease-linear" style={{ width: `${progress}%` }} />
              </div>

              <div className="flex items-center justify-center gap-6">
                <button 
                  onClick={() => currentTrackIndex > 0 && playTrack(currentTrackIndex - 1)}
                  className={`p-3 rounded-full hover:bg-white/10 transition-colors ${currentTrackIndex === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}
                >
                  <SkipBack className="w-6 h-6" />
                </button>
                <button 
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="w-16 h-16 flex items-center justify-center bg-white text-black rounded-full hover:scale-105 transition-transform"
                >
                  {isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-1" />}
                </button>
                <button 
                  onClick={() => currentTrackIndex < release.tracks.length - 1 && playTrack(currentTrackIndex + 1)}
                  className={`p-3 rounded-full hover:bg-white/10 transition-colors ${currentTrackIndex === release.tracks.length - 1 ? 'opacity-30 cursor-not-allowed' : ''}`}
                >
                  <SkipForward className="w-6 h-6" />
                </button>
              </div>
            </>
          ) : (
            <div className="text-center text-gray-500">No hay canciones disponibles</div>
          )}
        </div>
      </div>

      {/* Panel Derecho: Tracklist */}
      <div className="flex-1 p-8 md:p-12 lg:p-16 overflow-y-auto">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-semibold text-gray-300 uppercase tracking-widest text-sm">Tracklist</h2>
            <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white" onClick={() => {
              navigator.clipboard.writeText(window.location.href);
              customAlert('Enlace copiado');
            }}>
              <Share2 className="w-4 h-4 mr-2" /> Compartir
            </Button>
          </div>

          <div className="space-y-2">
            {release.tracks.map((track: any, index: number) => (
              <div 
                key={track.id}
                onClick={() => playTrack(index)}
                className={`flex items-center p-4 rounded-xl cursor-pointer transition-all group ${
                  currentTrackIndex === index 
                    ? 'bg-white/10 border border-white/20 shadow-lg' 
                    : 'hover:bg-white/5 border border-transparent'
                }`}
              >
                <div className="w-8 text-center text-gray-500 font-mono text-sm group-hover:text-white transition-colors">
                  {currentTrackIndex === index && isPlaying ? (
                    <div className="flex items-center justify-center gap-1 h-4">
                      <div className="w-1 bg-accent h-3 animate-[bounce_1s_infinite]" />
                      <div className="w-1 bg-accent h-4 animate-[bounce_1s_infinite_100ms]" />
                      <div className="w-1 bg-accent h-2 animate-[bounce_1s_infinite_200ms]" />
                    </div>
                  ) : (
                    index + 1
                  )}
                </div>
                <div className="flex-1 px-4">
                  <h4 className={`font-medium ${currentTrackIndex === index ? 'text-white' : 'text-gray-300 group-hover:text-white transition-colors'}`}>
                    {track.title}
                  </h4>
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <Play className="w-4 h-4 text-gray-400" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
