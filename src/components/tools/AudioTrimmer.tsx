'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { UploadCloud, Scissors, Play, Pause, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import WaveSurfer from 'wavesurfer.js';

export function AudioTrimmer() {
  const [file, setFile] = useState<File | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [status, setStatus] = useState<'idle' | 'trimming' | 'completed'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onFileSelect = (files: FileList | null) => {
    if (files && files[0]) {
      setFile(files[0]);
      setStatus('idle');
      setErrorMsg('');
    }
  };

  useEffect(() => {
    if (!file || !containerRef.current) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: 'rgba(168, 85, 247, 0.4)',
      progressColor: 'rgb(168, 85, 247)',
      cursorColor: 'rgb(147, 51, 234)',
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 100,
    });

    ws.on('ready', () => {
      setDuration(ws.getDuration());
      setEndTime(ws.getDuration());
      setStartTime(0);
    });

    ws.on('audioprocess', () => {
      if (ws.getCurrentTime() >= endTime) {
        ws.pause();
        ws.setTime(startTime);
      }
    });

    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));

    const objectUrl = URL.createObjectURL(file);
    ws.load(objectUrl);
    wavesurferRef.current = ws;

    return () => {
      ws.destroy();
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  const handlePlayPause = () => {
    if (wavesurferRef.current) {
      if (wavesurferRef.current.getCurrentTime() >= endTime) {
        wavesurferRef.current.setTime(startTime);
      }
      wavesurferRef.current.playPause();
    }
  };

  const handleTrim = async () => {
    if (!file) return;
    setStatus('trimming');
    setErrorMsg('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('startTime', startTime.toString());
      formData.append('endTime', endTime.toString());
      formData.append('format', 'mp3');

      const res = await fetch('/api/tools/trim', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al recortar');
      }

      setStatus('completed');
    } catch (err: any) {
      setErrorMsg(err.message);
      setStatus('idle');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="glass p-6 sm:p-8 rounded-2xl border border-border/50 text-center">
        <h2 className="text-xl sm:text-2xl font-bold text-text-primary mb-2 flex items-center justify-center gap-2">
          <Scissors className="w-6 h-6 text-pink-500" /> Recortador de Audio
        </h2>
        <p className="text-sm sm:text-base text-text-secondary mb-6">Sube una pista y extrae el fragmento exacto que necesitas.</p>

        {!file ? (
          <div 
            className="border-2 border-dashed border-border/60 hover:border-pink-500/50 hover:bg-pink-500/5 transition-all rounded-2xl p-8 sm:p-12 cursor-pointer flex flex-col items-center justify-center gap-4"
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); onFileSelect(e.dataTransfer.files); }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input type="file" ref={fileInputRef} className="hidden" accept="audio/*" onChange={e => onFileSelect(e.target.files)} />
            <div className="w-16 h-16 bg-surface-elevated rounded-full flex items-center justify-center shadow-inner">
              <UploadCloud className="w-8 h-8 text-text-secondary" />
            </div>
            <div>
              <p className="text-text-primary font-medium">Selecciona el audio a recortar</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-4">
              <p className="font-medium text-text-primary">{file.name}</p>
              <Button variant="outline" size="sm" onClick={() => setFile(null)}>Cambiar archivo</Button>
            </div>

            <div className="bg-surface-elevated p-4 rounded-xl border border-border/50 relative">
              <div ref={containerRef} className="w-full" />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 bg-surface p-4 rounded-xl border border-border/50">
              <Button onClick={handlePlayPause} variant="secondary" className="rounded-full w-12 h-12 p-0 flex items-center justify-center bg-pink-500/10 text-pink-500 hover:bg-pink-500/20">
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </Button>

              <div className="flex items-center gap-4">
                <div className="flex flex-col items-start gap-1">
                  <label className="text-xs text-text-secondary font-medium uppercase tracking-wider">Inicio (s)</label>
                  <input 
                    type="number" 
                    value={startTime.toFixed(2)} 
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val)) {
                        setStartTime(val);
                        if (wavesurferRef.current) wavesurferRef.current.setTime(val);
                      }
                    }}
                    className="w-24 bg-surface border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-pink-500"
                    step="0.1"
                    min="0"
                    max={endTime}
                  />
                </div>
                
                <div className="flex flex-col items-start gap-1">
                  <label className="text-xs text-text-secondary font-medium uppercase tracking-wider">Fin (s)</label>
                  <input 
                    type="number" 
                    value={endTime.toFixed(2)} 
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val)) setEndTime(val);
                    }}
                    className="w-24 bg-surface border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-pink-500"
                    step="0.1"
                    min={startTime}
                    max={duration}
                  />
                </div>
              </div>

              <Button 
                onClick={handleTrim} 
                disabled={status === 'trimming'}
                className="bg-pink-500 hover:bg-pink-600 text-white rounded-xl min-w-[120px]"
              >
                {status === 'trimming' ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Recortar'}
              </Button>
            </div>

            {errorMsg && <p className="text-sm text-danger animate-in fade-in">{errorMsg}</p>}
            {status === 'completed' && (
              <div className="flex items-center justify-center gap-2 text-emerald-500 bg-emerald-500/10 p-3 rounded-lg animate-in fade-in slide-in-from-bottom-2">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-medium">¡Audio recortado y guardado en Descargas!</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
