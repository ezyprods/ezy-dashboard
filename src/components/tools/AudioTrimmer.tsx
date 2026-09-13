'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { UploadCloud, Scissors, Play, Pause, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import WaveSurfer from 'wavesurfer.js';
import { downloadResponseAsFile } from '@/lib/clientDownload';

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
  // Refs so the WaveSurfer listeners (registered once per file) always see the current range
  const startTimeRef = useRef(0);
  const endTimeRef = useRef(0);
  useEffect(() => { startTimeRef.current = startTime; }, [startTime]);
  useEffect(() => { endTimeRef.current = endTime; }, [endTime]);

  const onFileSelect = (files: FileList | null) => {
    if (files && files[0]) {
      setFile(files[0]);
      setStatus('idle');
      setErrorMsg('');
      setIsPlaying(false);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
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
      if (endTimeRef.current > 0 && ws.getCurrentTime() >= endTimeRef.current) {
        ws.pause();
        ws.setTime(startTimeRef.current);
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
      const t = wavesurferRef.current.getCurrentTime();
      if (t >= endTime || t < startTime) {
        wavesurferRef.current.setTime(startTime);
      }
      wavesurferRef.current.playPause();
    }
  };

  const handleTrim = async () => {
    if (!file) return;
    if (endTime <= startTime) {
      setErrorMsg('El final del recorte debe ser posterior al inicio.');
      return;
    }
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
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Error al recortar');
      }

      await downloadResponseAsFile(res, `${file.name.replace(/\.[^/.]+$/, '')}_recorte.mp3`);
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
            <div className="flex items-center justify-between gap-3 mb-4">
              <p className="font-medium text-text-primary truncate min-w-0 text-left">{file.name}</p>
              <Button variant="outline" size="sm" onClick={() => { setFile(null); setStatus('idle'); setErrorMsg(''); setIsPlaying(false); }} className="shrink-0">Cambiar archivo</Button>
            </div>

            <div className="bg-surface-elevated p-4 rounded-xl border border-border/50 relative">
              <div ref={containerRef} className="w-full" />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 bg-surface p-4 rounded-xl border border-border/50">
              <Button onClick={handlePlayPause} variant="secondary" className="rounded-full w-12 h-12 p-0 flex items-center justify-center bg-pink-500/10 text-pink-500 hover:bg-pink-500/20">
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </Button>

              <div className="flex items-center gap-4">
                <TimeField
                  label="Inicio (s)"
                  value={startTime}
                  min={0}
                  max={endTime}
                  onCommit={(val) => {
                    setStartTime(val);
                    if (wavesurferRef.current) wavesurferRef.current.setTime(val);
                  }}
                />
                <TimeField
                  label="Fin (s)"
                  value={endTime}
                  min={startTime}
                  max={duration}
                  onCommit={(val) => setEndTime(val)}
                />
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
                <span className="font-medium">¡Audio recortado y descargado!</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Numeric input with its own text state so typing (e.g. "1." or clearing the field) is not fought by re-formatting. */
function TimeField({ label, value, min, max, onCommit }: { label: string; value: number; min: number; max: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState(value.toFixed(2));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(value.toFixed(2));
  }, [value, focused]);

  const commit = () => {
    const val = parseFloat(text.replace(',', '.'));
    if (!isNaN(val)) {
      const clamped = Math.min(Math.max(val, min), max || val);
      onCommit(clamped);
      setText(clamped.toFixed(2));
    } else {
      setText(value.toFixed(2));
    }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <label className="text-xs text-text-secondary font-medium uppercase tracking-wider">{label}</label>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        onFocus={() => setFocused(true)}
        onChange={e => setText(e.target.value)}
        onBlur={() => { setFocused(false); commit(); }}
        onKeyDown={e => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
        className="w-24 bg-surface border border-border rounded-lg px-3 py-1.5 text-base sm:text-sm focus:outline-none focus:border-pink-500"
      />
    </div>
  );
}
