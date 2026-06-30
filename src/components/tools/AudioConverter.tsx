'use client';

import { useState, useRef } from 'react';
import { UploadCloud, RefreshCw, FileAudio, CheckCircle2, AlertCircle, X, Download } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface ConversionTask {
  id: string;
  file: File;
  status: 'pending' | 'converting' | 'completed' | 'error';
  progress?: number;
  error?: string;
  downloadUrl?: string;
}

export function AudioConverter() {
  const [tasks, setTasks] = useState<ConversionTask[]>([]);
  const [format, setFormat] = useState('mp3');
  const [quality, setQuality] = useState('320');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const newTasks: ConversionTask[] = Array.from(files).map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      status: 'pending'
    }));
    setTasks(prev => [...prev, ...newTasks]);
  };

  const removeTask = (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  const startConversion = async () => {
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      if (task.status !== 'pending' && task.status !== 'error') continue;

      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'converting' } : t));

      try {
        const formData = new FormData();
        formData.append('file', task.file);
        formData.append('format', format);
        if (format === 'mp3' || format === 'm4a') {
          formData.append('quality', quality);
        }

        const res = await fetch('/api/tools/convert', {
          method: 'POST',
          body: formData
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Error en conversión');
        }

        const data = await res.json();
        
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'completed', downloadUrl: data.downloadUrl } : t));
      } catch (err: any) {
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'error', error: err.message } : t));
      }
    }
  };

  const hasPending = tasks.some(t => t.status === 'pending' || t.status === 'error');

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="glass p-6 sm:p-8 rounded-2xl border border-border/50 text-center">
        <h2 className="text-xl sm:text-2xl font-bold text-text-primary mb-2 flex items-center justify-center gap-2">
          <RefreshCw className="w-6 h-6 text-purple-500" /> Conversor Universal
        </h2>
        <p className="text-sm sm:text-base text-text-secondary mb-6">Arrastra archivos locales para convertirlos rápidamente. FFmpeg procesará el audio sin usar internet.</p>

        {/* Controles */}
        <div className="flex flex-wrap items-center justify-center gap-4 mb-8 bg-surface p-4 rounded-xl border border-border/50">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-text-secondary">Formato:</label>
            <select 
              value={format} 
              onChange={e => setFormat(e.target.value)}
              className="bg-surface-elevated border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-purple-500"
            >
              <option value="mp3">MP3</option>
              <option value="wav">WAV</option>
              <option value="flac">FLAC</option>
              <option value="m4a">M4A</option>
              <option value="ogg">OGG</option>
            </select>
          </div>

          {(format === 'mp3' || format === 'm4a') && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-text-secondary">Calidad:</label>
              <select 
                value={quality} 
                onChange={e => setQuality(e.target.value)}
                className="bg-surface-elevated border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-purple-500"
              >
                <option value="320">320 kbps (Alta)</option>
                <option value="192">192 kbps (Estándar)</option>
              </select>
            </div>
          )}
        </div>

        {/* Dropzone */}
        <div 
          className="border-2 border-dashed border-border/60 hover:border-purple-500/50 hover:bg-purple-500/5 transition-all rounded-2xl p-8 sm:p-12 cursor-pointer flex flex-col items-center justify-center gap-4"
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
          onClick={() => fileInputRef.current?.click()}
        >
          <input type="file" ref={fileInputRef} className="hidden" multiple accept="audio/*,video/*" onChange={e => handleFiles(e.target.files)} />
          <div className="w-16 h-16 bg-surface-elevated rounded-full flex items-center justify-center shadow-inner">
            <UploadCloud className="w-8 h-8 text-text-secondary" />
          </div>
          <div>
            <p className="text-text-primary font-medium">Haz clic o arrastra archivos aquí</p>
            <p className="text-sm text-text-secondary mt-1">Soporta WAV, MP4, FLAC, M4A, OGG...</p>
          </div>
        </div>
      </div>

      {/* Tareas */}
      {tasks.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-text-primary">Archivos en cola ({tasks.length})</h3>
            {hasPending && (
              <Button onClick={startConversion} className="bg-purple-500 hover:bg-purple-600 text-white rounded-xl">
                Convertir Todos
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {tasks.map(task => (
              <div key={task.id} className="glass p-3 rounded-xl border border-border/50 flex items-center gap-3 relative overflow-hidden">
                {task.status === 'converting' && <div className="absolute inset-0 bg-purple-500/10 animate-pulse" />}
                
                <div className="p-2 bg-surface-elevated rounded-lg shrink-0 z-10">
                  <FileAudio className="w-5 h-5 text-text-secondary" />
                </div>
                
                <div className="flex-1 min-w-0 z-10">
                  <p className="text-sm font-medium text-text-primary truncate">{task.file.name}</p>
                  <p className="text-xs text-text-secondary mt-0.5">
                    {(task.file.size / 1024 / 1024).toFixed(2)} MB • a {format.toUpperCase()}
                  </p>
                </div>
                
                <div className="shrink-0 flex items-center gap-2 z-10">
                  {task.status === 'pending' && <button onClick={() => removeTask(task.id)} className="text-text-secondary hover:text-danger p-1"><X className="w-4 h-4" /></button>}
                  {task.status === 'converting' && <RefreshCw className="w-5 h-5 text-purple-500 animate-spin" />}
                  {task.status === 'completed' && task.downloadUrl && (
                    <a href={task.downloadUrl} download className="p-1.5 bg-emerald-500/20 text-emerald-500 rounded-lg hover:bg-emerald-500/30">
                      <Download className="w-4 h-4" />
                    </a>
                  )}
                  {task.status === 'completed' && !task.downloadUrl && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                  {task.status === 'error' && <AlertCircle className="w-5 h-5 text-danger" title={task.error} />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
