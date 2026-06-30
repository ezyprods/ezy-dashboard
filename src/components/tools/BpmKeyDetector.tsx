'use client';

import { useState, useRef } from 'react';
import { UploadCloud, Activity, Loader2, Music2 } from 'lucide-react';

interface AnalysisResult {
  bpm: number;
  key: string;
  relative: string;
  isMajor: boolean;
}

export function BpmKeyDetector() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'analyzing' | 'completed'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || !files[0]) return;
    const selectedFile = files[0];
    setFile(selectedFile);
    setStatus('analyzing');
    setErrorMsg('');
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await fetch('/api/tools/detect', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al analizar el audio');
      }

      const data = await res.json();
      setResult(data);
      setStatus('completed');
    } catch (err: any) {
      setErrorMsg(err.message);
      setStatus('idle');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="glass p-6 sm:p-8 rounded-2xl border border-border/50">
        <div className="text-center mb-8">
          <h2 className="text-xl sm:text-2xl font-bold text-text-primary mb-2 flex items-center justify-center gap-2">
            <Activity className="w-6 h-6 text-emerald-500" /> Detector BPM & Key
          </h2>
          <p className="text-sm sm:text-base text-text-secondary">Analiza cualquier audio para descubrir su Tempo (BPM) y Tonalidad musical.</p>
        </div>

        <div className="flex flex-col md:flex-row gap-8 items-center md:items-stretch">
          {/* Upload Zone */}
          <div 
            className="flex-1 w-full border-2 border-dashed border-border/60 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all rounded-2xl p-8 cursor-pointer flex flex-col items-center justify-center gap-4 text-center min-h-[250px]"
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleFileSelect(e.dataTransfer.files); }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input type="file" ref={fileInputRef} className="hidden" accept="audio/*" onChange={e => handleFileSelect(e.target.files)} />
            <div className="w-16 h-16 bg-surface-elevated rounded-full flex items-center justify-center shadow-inner mb-2">
              <UploadCloud className="w-8 h-8 text-text-secondary" />
            </div>
            <div>
              <p className="text-text-primary font-medium">Sube o arrastra una pista</p>
              <p className="text-xs text-text-secondary mt-1">Soporta MP3, WAV, FLAC...</p>
            </div>
            
            {file && (
              <div className="mt-4 px-4 py-2 bg-surface rounded-lg border border-border/50 text-xs font-medium text-text-primary truncate max-w-[200px] sm:max-w-xs">
                {file.name}
              </div>
            )}
          </div>

          {/* Results Zone */}
          <div className="flex-1 w-full bg-surface-elevated border border-border/50 rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center min-h-[250px] relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl rounded-full" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-emerald-500/5 blur-3xl rounded-full" />

            {status === 'idle' && !result && (
              <div className="text-center text-text-secondary/50 flex flex-col items-center gap-3">
                <Music2 className="w-12 h-12 opacity-20" />
                <p className="text-sm font-medium">Esperando archivo...</p>
              </div>
            )}

            {status === 'analyzing' && (
              <div className="text-center flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                  <Activity className="w-6 h-6 text-emerald-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
                </div>
                <p className="text-emerald-500 font-medium">Analizando frecuencias...</p>
              </div>
            )}

            {status === 'completed' && result && (
              <div className="w-full space-y-6 animate-in zoom-in-95 duration-500">
                <div className="text-center">
                  <p className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-1">Tempo Detectado</p>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-5xl font-black text-text-primary tracking-tighter">{result.bpm}</span>
                    <span className="text-lg font-bold text-text-secondary">BPM</span>
                  </div>
                </div>

                <div className="h-px w-full bg-gradient-to-r from-transparent via-border to-transparent" />

                <div className="grid grid-cols-2 gap-4 text-center">
                  <div>
                    <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-1">Tonalidad</p>
                    <p className={`text-xl font-bold ${result.isMajor ? 'text-amber-500' : 'text-blue-500'}`}>
                      {result.key}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-1">Relativa</p>
                    <p className={`text-xl font-bold ${!result.isMajor ? 'text-amber-500' : 'text-blue-500'}`}>
                      {result.relative}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {errorMsg && (
              <p className="text-sm text-danger font-medium text-center">{errorMsg}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
