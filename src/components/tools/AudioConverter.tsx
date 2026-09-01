'use client';

import { useState, useRef, useEffect } from 'react';
import { 
  UploadCloud, 
  RefreshCw, 
  FileAudio, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Download, 
  Play, 
  Pause, 
  Trash2,
  CheckCheck
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface ConversionTask {
  id: string;
  file: File;
  targetFormat: string;
  targetQuality: string;
  status: 'pending' | 'converting' | 'completed' | 'error';
  progress?: number;
  error?: string;
  downloadUrl?: string;
  convertedName?: string;
  convertedSize?: number;
}

export function AudioConverter() {
  const [tasks, setTasks] = useState<ConversionTask[]>([]);
  const [format, setFormat] = useState('mp3');
  const [quality, setQuality] = useState('320');
  const [isConverting, setIsConverting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tasksRef = useRef<ConversionTask[]>([]);
  tasksRef.current = tasks;

  // Cleanup object URLs on unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      tasksRef.current.forEach(t => {
        if (t.downloadUrl) {
          URL.revokeObjectURL(t.downloadUrl);
        }
      });
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newTasks: ConversionTask[] = Array.from(files).map(file => ({
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      file,
      targetFormat: format,
      targetQuality: quality,
      status: 'pending'
    }));
    setTasks(prev => [...prev, ...newTasks]);
  };

  const removeTask = (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (task?.downloadUrl) {
      URL.revokeObjectURL(task.downloadUrl);
    }
    if (playingId === id && audioRef.current) {
      audioRef.current.pause();
      setPlayingId(null);
    }
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  const clearAllTasks = () => {
    tasks.forEach(t => {
      if (t.downloadUrl) {
        URL.revokeObjectURL(t.downloadUrl);
      }
    });
    if (audioRef.current) {
      audioRef.current.pause();
      setPlayingId(null);
    }
    setTasks([]);
  };

  const togglePlayPreview = (task: ConversionTask) => {
    if (!task.downloadUrl) return;

    if (playingId === task.id) {
      audioRef.current?.pause();
      setPlayingId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(task.downloadUrl);
      audio.onended = () => setPlayingId(null);
      audio.onerror = () => setPlayingId(null);
      audio.play().catch(() => setPlayingId(null));
      audioRef.current = audio;
      setPlayingId(task.id);
    }
  };

  const startConversion = async () => {
    if (isConverting) return;
    setIsConverting(true);

    try {
      // Loop sequentially through pending or failed tasks
      for (let i = 0; i < tasks.length; i++) {
        const currentTask = tasksRef.current[i];
        if (!currentTask || (currentTask.status !== 'pending' && currentTask.status !== 'error')) {
          continue;
        }

        // Set status to converting
        setTasks(prev => prev.map(t => t.id === currentTask.id ? { ...t, status: 'converting', error: undefined } : t));

        try {
          const formData = new FormData();
          formData.append('file', currentTask.file);
          formData.append('format', currentTask.targetFormat);
          if (currentTask.targetFormat === 'mp3' || currentTask.targetFormat === 'm4a' || currentTask.targetFormat === 'aac') {
            formData.append('quality', currentTask.targetQuality);
          }

          const res = await fetch('/api/tools/convert', {
            method: 'POST',
            body: formData
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({ error: 'Error en la conversión' }));
            throw new Error(errData.error || 'Error en la conversión');
          }

          const blob = await res.blob();
          const blobUrl = URL.createObjectURL(blob);

          const headerFilename = res.headers.get('X-Converted-Filename');
          const cleanName = headerFilename 
            ? decodeURIComponent(headerFilename) 
            : `${currentTask.file.name.replace(/\.[^/.]+$/, '')}_converted.${currentTask.targetFormat}`;

          setTasks(prev => prev.map(t => t.id === currentTask.id ? {
            ...t,
            status: 'completed',
            downloadUrl: blobUrl,
            convertedName: cleanName,
            convertedSize: blob.size
          } : t));

        } catch (err: any) {
          setTasks(prev => prev.map(t => t.id === currentTask.id ? {
            ...t,
            status: 'error',
            error: err.message || 'Error al procesar el archivo'
          } : t));
        }
      }
    } finally {
      setIsConverting(false);
    }
  };

  const downloadAllCompleted = () => {
    const completedTasks = tasks.filter(t => t.status === 'completed' && t.downloadUrl);
    completedTasks.forEach((task, index) => {
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = task.downloadUrl!;
        a.download = task.convertedName || `audio_${index}.${task.targetFormat}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }, index * 250);
    });
  };

  const hasPending = tasks.some(t => t.status === 'pending' || t.status === 'error');
  const completedCount = tasks.filter(t => t.status === 'completed').length;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="glass p-6 sm:p-8 rounded-2xl border border-border/50 text-center relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-60 h-60 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-60 h-60 bg-accent/10 rounded-full blur-3xl pointer-events-none" />

        <h2 className="text-xl sm:text-2xl font-bold text-text-primary mb-2 flex items-center justify-center gap-2 relative z-10">
          <RefreshCw className="w-6 h-6 text-purple-500 animate-in spin-in-180 duration-500" /> Conversor Universal de Audio
        </h2>
        <p className="text-sm sm:text-base text-text-secondary mb-6 relative z-10 max-w-xl mx-auto">
          Convierte tus pistas y grabaciones a cualquier formato de alta fidelidad. Procesamiento ultrarrápido con motor FFmpeg.
        </p>

        {/* Controles de Configuración */}
        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 mb-8 bg-surface/70 backdrop-blur-md p-4 rounded-xl border border-border/50 relative z-10">
          <div className="flex items-center gap-2.5">
            <label className="text-sm font-semibold text-text-secondary">Formato de salida:</label>
            <select 
              value={format} 
              onChange={e => setFormat(e.target.value)}
              disabled={isConverting}
              className="bg-surface-elevated border border-border rounded-lg px-3 py-1.5 text-sm font-medium text-text-primary focus:outline-none focus:border-purple-500 cursor-pointer disabled:opacity-50"
            >
              <option value="mp3">MP3 (.mp3)</option>
              <option value="wav">WAV (.wav)</option>
              <option value="flac">FLAC (.flac)</option>
              <option value="m4a">M4A (.m4a)</option>
              <option value="ogg">OGG (.ogg)</option>
              <option value="aac">AAC (.aac)</option>
            </select>
          </div>

          {(format === 'mp3' || format === 'm4a' || format === 'aac') && (
            <div className="flex items-center gap-2.5 animate-in fade-in zoom-in-95 duration-200">
              <label className="text-sm font-semibold text-text-secondary">Bitrate / Calidad:</label>
              <select 
                value={quality} 
                onChange={e => setQuality(e.target.value)}
                disabled={isConverting}
                className="bg-surface-elevated border border-border rounded-lg px-3 py-1.5 text-sm font-medium text-text-primary focus:outline-none focus:border-purple-500 cursor-pointer disabled:opacity-50"
              >
                <option value="320">320 kbps (Máxima Fidelidad)</option>
                <option value="256">256 kbps (Alta)</option>
                <option value="192">192 kbps (Estándar)</option>
                <option value="128">128 kbps (Ligero)</option>
              </select>
            </div>
          )}
        </div>

        {/* Dropzone interactiva */}
        <div 
          className={`border-2 border-dashed transition-all duration-300 rounded-2xl p-8 sm:p-12 cursor-pointer flex flex-col items-center justify-center gap-4 relative z-10 ${
            isDragging 
              ? 'border-purple-500 bg-purple-500/10 scale-[0.99] shadow-lg shadow-purple-500/10' 
              : 'border-border/60 hover:border-purple-500/50 hover:bg-purple-500/5'
          }`}
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={e => { e.preventDefault(); setIsDragging(false); }}
          onDrop={e => { 
            e.preventDefault(); 
            setIsDragging(false); 
            handleFiles(e.dataTransfer.files); 
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            multiple 
            accept="audio/*,video/*" 
            onChange={e => handleFiles(e.target.files)} 
          />
          <div className="w-16 h-16 bg-surface-elevated rounded-full flex items-center justify-center shadow-inner text-purple-500 group-hover:scale-110 transition-transform">
            <UploadCloud className="w-8 h-8" />
          </div>
          <div>
            <p className="text-text-primary font-semibold text-base sm:text-lg">Haz clic o arrastra archivos aquí</p>
            <p className="text-xs sm:text-sm text-text-secondary mt-1">
              Soporta WAV, MP3, MP4, FLAC, M4A, OGG, AIFF, AAC...
            </p>
          </div>
        </div>
      </div>

      {/* Cola de Tareas */}
      {tasks.length > 0 && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-surface/40 p-3.5 rounded-xl border border-border/40">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-text-primary text-sm sm:text-base">
                Archivos en cola ({tasks.length})
              </h3>
              {completedCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-medium">
                  {completedCount} completado{completedCount > 1 ? 's' : ''}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {completedCount > 1 && (
                <Button 
                  onClick={downloadAllCompleted} 
                  variant="outline" 
                  size="sm" 
                  className="rounded-xl border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" /> Descargar Todos ({completedCount})
                </Button>
              )}

              {hasPending && (
                <Button 
                  onClick={startConversion} 
                  disabled={isConverting}
                  className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl shadow-lg shadow-purple-600/20 gap-2 font-medium"
                >
                  {isConverting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" /> Convirtiendo...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" /> Convertir Todos
                    </>
                  )}
                </Button>
              )}

              {!isConverting && (
                <button
                  onClick={clearAllTasks}
                  title="Limpiar lista"
                  className="p-2 text-text-secondary hover:text-danger hover:bg-surface-elevated rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {tasks.map(task => (
              <div 
                key={task.id} 
                className="glass p-3.5 rounded-xl border border-border/50 flex items-center gap-3 relative overflow-hidden transition-all hover:border-border"
              >
                {task.status === 'converting' && (
                  <div className="absolute inset-0 bg-purple-500/10 animate-pulse pointer-events-none" />
                )}
                
                <div className="p-2.5 bg-surface-elevated rounded-lg shrink-0 z-10 text-purple-400">
                  <FileAudio className="w-5 h-5" />
                </div>
                
                <div className="flex-1 min-w-0 z-10">
                  <p className="text-sm font-semibold text-text-primary truncate" title={task.file.name}>
                    {task.file.name}
                  </p>
                  
                  <div className="flex items-center gap-2 text-xs text-text-secondary mt-0.5">
                    <span>{(task.file.size / 1024 / 1024).toFixed(2)} MB</span>
                    <span>•</span>
                    <span className="font-medium text-purple-400 uppercase">
                      ➔ {task.targetFormat}
                    </span>
                    {task.convertedSize && (
                      <>
                        <span>•</span>
                        <span className="text-emerald-400 font-medium">
                          {(task.convertedSize / 1024 / 1024).toFixed(2)} MB
                        </span>
                      </>
                    )}
                  </div>

                  {task.error && (
                    <p className="text-xs text-danger mt-1 truncate" title={task.error}>
                      {task.error}
                    </p>
                  )}
                </div>
                
                <div className="shrink-0 flex items-center gap-1.5 z-10">
                  {task.status === 'pending' && (
                    <button 
                      onClick={() => removeTask(task.id)} 
                      title="Eliminar de la cola"
                      className="text-text-secondary hover:text-danger p-1.5 rounded-lg hover:bg-surface-elevated transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}

                  {task.status === 'converting' && (
                    <div className="flex items-center gap-1 px-2 py-1 bg-purple-500/10 rounded-lg text-purple-400 text-xs font-medium">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Procesando</span>
                    </div>
                  )}

                  {task.status === 'completed' && task.downloadUrl && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => togglePlayPreview(task)}
                        title={playingId === task.id ? "Pausar" : "Escuchar preescucha"}
                        className="p-2 bg-surface-elevated text-text-primary rounded-lg hover:bg-surface hover:text-purple-400 transition-colors"
                      >
                        {playingId === task.id ? (
                          <Pause className="w-4 h-4 text-purple-400" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </button>

                      <a 
                        href={task.downloadUrl} 
                        download={task.convertedName || `${task.file.name.replace(/\.[^/.]+$/, '')}_converted.${task.targetFormat}`}
                        title="Descargar archivo"
                        className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors flex items-center gap-1 font-medium text-xs shadow-sm"
                      >
                        <Download className="w-4 h-4" />
                        <span className="hidden sm:inline">Descargar</span>
                      </a>
                    </div>
                  )}

                  {task.status === 'error' && (
                    <div className="flex items-center gap-1">
                      <span title={task.error} className="text-danger p-1">
                        <AlertCircle className="w-5 h-5" />
                      </span>
                      <button 
                        onClick={() => removeTask(task.id)} 
                        title="Quitar"
                        className="text-text-secondary hover:text-danger p-1 rounded-lg hover:bg-surface-elevated"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

