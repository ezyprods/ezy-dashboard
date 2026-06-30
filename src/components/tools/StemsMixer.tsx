'use client';

import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Download, Volume2, VolumeX, Mic2, Disc3, Speaker, Music4 } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface StemsMixerProps {
  taskId: string;
  filename: string;
}

const STEMS = [
  { id: 'vocals', name: 'Vocales', icon: Mic2, color: 'text-indigo-500', bg: 'bg-indigo-500', lightBg: 'bg-indigo-50' },
  { id: 'drums', name: 'Batería', icon: Disc3, color: 'text-indigo-500', bg: 'bg-indigo-500', lightBg: 'bg-indigo-50' },
  { id: 'bass', name: 'Bajo', icon: Speaker, color: 'text-indigo-500', bg: 'bg-indigo-500', lightBg: 'bg-indigo-50' },
  { id: 'other', name: 'Otros', icon: Music4, color: 'text-indigo-500', bg: 'bg-indigo-500', lightBg: 'bg-indigo-50' }
] as const;

export function StemsMixer({ taskId, filename }: StemsMixerProps) {
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  
  const [volumes, setVolumes] = useState<Record<string, number>>({
    vocals: 1, drums: 1, bass: 1, other: 1
  });
  const [mutes, setMutes] = useState<Set<string>>(new Set());
  const [solos, setSolos] = useState<Set<string>>(new Set());

  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});
  const progressInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    STEMS.forEach(stem => {
      const audio = new Audio(`/api/tools/stems/stream?taskId=${taskId}&stem=${stem.id}`);
      audio.crossOrigin = 'anonymous';
      audio.addEventListener('loadedmetadata', () => {
        if (stem.id === 'vocals') setDuration(audio.duration);
      });
      audioRefs.current[stem.id] = audio;
    });

    return () => {
      Object.values(audioRefs.current).forEach(audio => {
        audio.pause();
        audio.src = '';
      });
      if (progressInterval.current) clearInterval(progressInterval.current);
    };
  }, [taskId]);

  useEffect(() => {
    const isAnySolo = solos.size > 0;
    STEMS.forEach(stem => {
      const audio = audioRefs.current[stem.id];
      if (!audio) return;
      const isMuted = mutes.has(stem.id) || (isAnySolo && !solos.has(stem.id));
      audio.volume = isMuted ? 0 : volumes[stem.id];
    });
  }, [volumes, mutes, solos]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.target.type !== 'range' && e.target.type !== 'button') return;
      if (e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (e.target instanceof HTMLElement) {
          e.target.blur();
        }
        togglePlay();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [playing, currentTime]);

  const togglePlay = () => {
    if (playing) {
      Object.values(audioRefs.current).forEach(audio => audio.pause());
      setPlaying(false);
      if (progressInterval.current) clearInterval(progressInterval.current);
    } else {
      const targetTime = currentTime;
      Object.values(audioRefs.current).forEach(audio => {
        if (Math.abs(audio.currentTime - targetTime) > 0.1) {
          audio.currentTime = targetTime;
        }
        audio.play().catch(() => {});
      });
      setPlaying(true);
      progressInterval.current = setInterval(() => {
        if (audioRefs.current['vocals']) {
          setCurrentTime(audioRefs.current['vocals'].currentTime);
        }
      }, 100);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    Object.values(audioRefs.current).forEach(audio => {
      audio.currentTime = newTime;
    });
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const toggleMute = (stemId: string) => {
    setMutes(prev => {
      const next = new Set(prev);
      if (next.has(stemId)) next.delete(stemId);
      else next.add(stemId);
      return next;
    });
  };

  const toggleSolo = (stemId: string) => {
    setSolos(prev => {
      const next = new Set(prev);
      if (next.has(stemId)) next.delete(stemId);
      else next.add(stemId);
      return next;
    });
  };

  const handleVolume = (stemId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    setVolumes(prev => ({ ...prev, [stemId]: parseFloat(e.target.value) }));
  };

  const downloadStem = (stemId: string) => {
    window.open(`/api/tools/stems/stream?taskId=${taskId}&stem=${stemId}&download=true`, '_blank');
  };

  return (
    <div className="mt-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white rounded-xl border border-border/50 shadow-sm overflow-hidden">
        
        {/* Encabezado y Reproductor */}
        <div className="px-4 py-3 border-b border-border/50 bg-surface flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="flex-1 min-w-0 w-full">
            <h3 className="font-semibold text-text-primary truncate text-sm sm:text-base" title={filename}>{filename}</h3>
            <p className="text-xs text-text-secondary flex items-center gap-2">
              Mezclador de pistas inteligente
            </p>
          </div>
          
          <div className="flex items-center gap-2 w-full sm:w-auto bg-surface-elevated px-3 py-1.5 rounded-full border border-border/50">
            <span className="text-[11px] font-medium text-text-secondary w-8 text-right">{formatTime(currentTime)}</span>
            
            <input 
              type="range"
              value={currentTime} 
              max={duration || 100} 
              step={0.1}
              onChange={handleSeek}
              className="w-full sm:w-40 h-1 bg-border rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:bg-indigo-600 [&::-webkit-slider-thumb]:rounded-full transition-all"
            />
            
            <span className="text-[11px] font-medium text-text-secondary w-8">{formatTime(duration)}</span>
            
            <Button 
              onClick={togglePlay}
              variant={playing ? 'outline' : 'default'}
              size="icon"
              className="w-7 h-7 ml-1 rounded-full shrink-0 transition-all duration-200"
            >
              {playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
            </Button>
          </div>
        </div>

        {/* Pistas */}
        <div className="p-1.5 sm:p-2 bg-white grid gap-0.5">
          {STEMS.map(stem => {
            const Icon = stem.icon;
            const isMuted = mutes.has(stem.id);
            const isSolo = solos.has(stem.id);
            const activeVol = (isMuted || (solos.size > 0 && !isSolo)) ? 0 : volumes[stem.id];
            const isPlaying = activeVol > 0 && playing;
            
            return (
              <div key={stem.id} className={`flex flex-col sm:flex-row items-center gap-3 py-1.5 px-2 rounded-lg transition-colors ${isPlaying ? 'bg-indigo-50/30' : 'hover:bg-surface-elevated'}`}>
                
                {/* Nombre e Icono */}
                <div className="flex items-center gap-2.5 w-full sm:w-36">
                  <div className={`w-7 h-7 rounded flex items-center justify-center transition-colors ${isPlaying ? stem.lightBg + ' ' + stem.color : 'bg-surface border border-border/50 text-text-secondary'}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <span className={`font-medium text-sm ${activeVol > 0 ? 'text-text-primary' : 'text-text-secondary'}`}>
                    {stem.name}
                  </span>
                </div>

                {/* Botones Mute / Solo */}
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => toggleMute(stem.id)}
                    className={`w-7 h-6 rounded text-[11px] font-semibold transition-colors flex items-center justify-center border ${
                      isMuted 
                        ? 'bg-red-50 text-red-600 border-red-200' 
                        : 'bg-transparent text-text-secondary border-transparent hover:bg-surface border-border/50'
                    }`}
                  >
                    M
                  </button>
                  <button 
                    onClick={() => toggleSolo(stem.id)}
                    className={`w-7 h-6 rounded text-[11px] font-semibold transition-colors flex items-center justify-center border ${
                      isSolo 
                        ? 'bg-amber-50 text-amber-600 border-amber-200' 
                        : 'bg-transparent text-text-secondary border-transparent hover:bg-surface border-border/50'
                    }`}
                  >
                    S
                  </button>
                </div>

                {/* Volumen (Slider) */}
                <div className="flex-1 w-full flex items-center gap-2 px-2">
                  {activeVol === 0 ? <VolumeX className="w-3.5 h-3.5 text-text-secondary/50 shrink-0" /> : <Volume2 className="w-3.5 h-3.5 text-text-secondary shrink-0" />}
                  
                  <div className="relative flex-1 flex items-center h-6">
                    {/* Barra de fondo */}
                    <div className="absolute inset-0 top-1/2 -translate-y-1/2 h-1 bg-surface-elevated border border-border/50 rounded-full overflow-hidden">
                      {/* Barra de progreso */}
                      <div 
                        className={`h-full ${stem.bg} transition-all duration-75`}
                        style={{ width: `${volumes[stem.id] * 100}%`, opacity: isMuted ? 0.3 : 1 }}
                      />
                    </div>
                    {/* Input real */}
                    <input 
                      type="range"
                      value={volumes[stem.id]} 
                      max={1} 
                      step={0.01}
                      onChange={(e) => handleVolume(stem.id, e)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    {/* Botón visual del slider (pulido) */}
                    <div 
                      className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow border border-border pointer-events-none transition-all duration-75`}
                      style={{ left: `calc(${volumes[stem.id] * 100}% - 6px)`, opacity: isMuted ? 0.5 : 1 }}
                    ></div>
                  </div>

                  <span className={`text-[11px] font-medium w-8 text-right ${activeVol > 0 ? 'text-text-primary' : 'text-text-secondary'}`}>
                    {Math.round(volumes[stem.id] * 100)}%
                  </span>
                </div>

                {/* Botón Descargar */}
                <Button 
                  onClick={() => downloadStem(stem.id)}
                  variant="ghost"
                  size="icon"
                  className="w-7 h-7 text-text-secondary hover:text-text-primary shrink-0"
                  title={`Descargar ${stem.name}`}
                >
                  <Download className="w-3.5 h-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
