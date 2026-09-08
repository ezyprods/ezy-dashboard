'use client';

import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Download, Volume2, VolumeX, Mic2, Disc3, Speaker, Music4 } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface StemsMixerProps {
  taskId: string;
  filename: string;
  stems?: {
    vocals?: string;
    drums?: string;
    bass?: string;
    other?: string;
  };
}

const STEMS = [
  { id: 'vocals', name: 'Vocales', icon: Mic2, color: 'text-indigo-400', bg: 'bg-indigo-500', lightBg: 'bg-indigo-500/20' },
  { id: 'drums', name: 'Batería', icon: Disc3, color: 'text-amber-400', bg: 'bg-amber-500', lightBg: 'bg-amber-500/20' },
  { id: 'bass', name: 'Bajo', icon: Speaker, color: 'text-emerald-400', bg: 'bg-emerald-500', lightBg: 'bg-emerald-500/20' },
  { id: 'other', name: 'Otros', icon: Music4, color: 'text-purple-400', bg: 'bg-purple-500', lightBg: 'bg-purple-500/20' }
] as const;

export function StemsMixer({ taskId, filename, stems }: StemsMixerProps) {
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
    // Cleanup previous audios
    Object.values(audioRefs.current).forEach(audio => {
      audio.pause();
      audio.src = '';
    });
    audioRefs.current = {};

    STEMS.forEach(stem => {
      const directUrl = stems?.[stem.id as keyof typeof stems];
      const audioSrc = directUrl || `/api/tools/stems/stream?taskId=${taskId}&stem=${stem.id}`;
      
      const audio = new Audio(audioSrc);
      audio.crossOrigin = 'anonymous';
      audio.preload = 'auto';

      audio.addEventListener('loadedmetadata', () => {
        if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
          setDuration(prev => Math.max(prev, audio.duration));
        }
      });

      audio.addEventListener('ended', () => {
        if (stem.id === 'vocals' || !audioRefs.current['vocals']) {
          setPlaying(false);
          setCurrentTime(0);
        }
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
  }, [taskId, stems]);

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
        if (Math.abs(audio.currentTime - targetTime) > 0.05) {
          audio.currentTime = targetTime;
        }
        audio.play().catch(() => {});
      });
      setPlaying(true);

      if (progressInterval.current) clearInterval(progressInterval.current);
      progressInterval.current = setInterval(() => {
        const masterAudio = audioRefs.current['vocals'] || Object.values(audioRefs.current)[0];
        if (masterAudio) {
          const masterTime = masterAudio.currentTime;
          setCurrentTime(masterTime);
          
          // Autocorregir drift si alguna pista se desfasa > 0.08s
          Object.values(audioRefs.current).forEach(aud => {
            if (Math.abs(aud.currentTime - masterTime) > 0.08) {
              aud.currentTime = masterTime;
            }
          });
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
    const directUrl = stems?.[stemId as keyof typeof stems];
    const safeBaseName = filename.replace(/\.[^/.]+$/, "") || 'track';

    // Si es un Blob URL generado localmente en el navegador (WebGPU)
    if (directUrl && directUrl.startsWith('blob:')) {
      const a = document.createElement('a');
      a.href = directUrl;
      a.download = `${safeBaseName}_${stemId}.wav`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        if (document.body.contains(a)) document.body.removeChild(a);
      }, 100);
      return;
    }

    const downloadUrl = directUrl 
      ? `/api/tools/stems/stream?url=${encodeURIComponent(directUrl)}&stem=${stemId}&filename=${encodeURIComponent(filename)}&download=true`
      : `/api/tools/stems/stream?taskId=${taskId}&stem=${stemId}&filename=${encodeURIComponent(filename)}&download=true`;

    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `${safeBaseName}_${stemId}.wav`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (document.body.contains(a)) document.body.removeChild(a);
    }, 100);
  };

  const downloadAll = () => {
    STEMS.forEach((stem, index) => {
      setTimeout(() => {
        downloadStem(stem.id);
      }, index * 250);
    });
  };

  return (
    <div className="mt-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-surface rounded-2xl border border-border/60 shadow-sm overflow-hidden">
        
        {/* Encabezado y Reproductor */}
        <div className="px-4 py-3 border-b border-border/50 bg-surface flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="flex-1 min-w-0 w-full">
            <h3 className="font-semibold text-text-primary truncate text-sm sm:text-base" title={filename}>{filename}</h3>
            <p className="text-xs text-text-secondary flex items-center gap-2">
              Mezclador de pistas sincronizado
            </p>
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={downloadAll}
              className="text-xs h-8 px-2.5 flex items-center gap-1.5 shrink-0"
              title="Descargar las 4 pistas"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Descargar Todo</span>
            </Button>

            <div className="flex items-center gap-2 bg-surface-elevated px-3 py-1.5 rounded-full border border-border/50">
              <span className="text-[11px] font-medium text-text-secondary w-8 text-right">{formatTime(currentTime)}</span>
              
              <input 
                type="range"
                value={currentTime} 
                max={duration || 100} 
                step={0.1}
                onChange={handleSeek}
                className="w-full sm:w-36 h-1 bg-border rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:bg-indigo-600 [&::-webkit-slider-thumb]:rounded-full transition-all"
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
        </div>

        {/* Pistas */}
        <div className="p-2 sm:p-3 bg-surface-elevated/40 grid gap-1.5 border-t border-border/40">
          {STEMS.map(stem => {
            const Icon = stem.icon;
            const isMuted = mutes.has(stem.id);
            const isSolo = solos.has(stem.id);
            const activeVol = (isMuted || (solos.size > 0 && !isSolo)) ? 0 : volumes[stem.id];
            const isPlaying = activeVol > 0 && playing;
            
            return (
              <div 
                key={stem.id} 
                className={`flex flex-col sm:flex-row items-center gap-3 py-2 px-3 rounded-xl transition-all ${
                  isPlaying 
                    ? 'bg-surface-elevated border border-border/60 shadow-xs' 
                    : 'bg-surface/50 hover:bg-surface-elevated/50 border border-transparent'
                }`}
              >
                {/* Nombre e Icono */}
                <div className="flex items-center gap-2.5 w-full sm:w-36">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                    isPlaying 
                      ? `${stem.lightBg} ${stem.color}` 
                      : 'bg-surface-elevated border border-border/50 text-text-secondary'
                  }`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className={`font-semibold text-xs sm:text-sm ${activeVol > 0 ? 'text-text-primary' : 'text-text-secondary/70'}`}>
                    {stem.name}
                  </span>
                </div>

                {/* Botones Mute / Solo */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button 
                    type="button"
                    onClick={() => toggleMute(stem.id)}
                    aria-label={`Silenciar ${stem.name}`}
                    aria-pressed={isMuted}
                    title={isMuted ? `Activar ${stem.name}` : `Silenciar ${stem.name}`}
                    className={`w-7 h-7 rounded-lg text-xs font-bold transition-all flex items-center justify-center border ${
                      isMuted 
                        ? 'bg-red-500/20 text-red-400 border-red-500/40 shadow-xs' 
                        : 'bg-surface/60 text-text-secondary border-border/60 hover:text-text-primary hover:bg-surface-elevated'
                    }`}
                  >
                    M
                  </button>
                  <button 
                    type="button"
                    onClick={() => toggleSolo(stem.id)}
                    aria-label={`Solo ${stem.name}`}
                    aria-pressed={isSolo}
                    title={isSolo ? `Desactivar Solo ${stem.name}` : `Solo ${stem.name}`}
                    className={`w-7 h-7 rounded-lg text-xs font-bold transition-all flex items-center justify-center border ${
                      isSolo 
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 shadow-xs' 
                        : 'bg-surface/60 text-text-secondary border-border/60 hover:text-text-primary hover:bg-surface-elevated'
                    }`}
                  >
                    S
                  </button>
                </div>

                {/* Volumen (Slider) */}
                <div className="flex-1 w-full flex items-center gap-3 px-1">
                  {activeVol === 0 ? (
                    <VolumeX className="w-4 h-4 text-text-secondary/40 shrink-0" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-text-secondary shrink-0" />
                  )}
                  
                  <div className="flex-1 flex items-center">
                    <input 
                      type="range"
                      value={volumes[stem.id]} 
                      min={0}
                      max={1} 
                      step={0.01}
                      aria-label={`Volumen de ${stem.name}`}
                      aria-valuenow={Math.round(volumes[stem.id] * 100)}
                      onChange={(e) => handleVolume(stem.id, e)}
                      className="w-full h-1.5 bg-surface border border-border/50 rounded-full appearance-none cursor-pointer accent-indigo-500 transition-all [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:bg-indigo-400 [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:scale-110"
                    />
                  </div>

                  <span className={`text-xs font-mono font-medium w-10 text-right ${activeVol > 0 ? 'text-text-primary' : 'text-text-secondary/50'}`}>
                    {Math.round(volumes[stem.id] * 100)}%
                  </span>
                </div>

                {/* Botón Descargar */}
                <Button 
                  onClick={() => downloadStem(stem.id)}
                  variant="ghost"
                  size="icon"
                  className="w-8 h-8 text-text-secondary hover:text-text-primary hover:bg-surface-elevated rounded-xl shrink-0"
                  title={`Descargar ${stem.name}`}
                  aria-label={`Descargar pista ${stem.name}`}
                >
                  <Download className="w-4 h-4" />
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
