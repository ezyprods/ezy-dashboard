'use client';

import { useState, useRef, useEffect } from 'react';
import { UploadCloud, Layers, Loader2, CheckCircle2, AlertTriangle, Terminal, Settings } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { StemsMixer } from './StemsMixer';

type SetupStatus = 'checking' | 'ready' | 'no_python' | 'no_demucs' | 'installing' | 'install_error';
type ProcessStatus = 'idle' | 'processing' | 'completed' | 'error';

interface Task {
  id: string;
  filename: string;
  status: ProcessStatus;
  progress: number;
  outputDir?: string;
  error?: string;
}

export function StemsSplitter() {
  const [setupStatus, setSetupStatus] = useState<SetupStatus>('checking');
  const [setupError, setSetupError] = useState('');
  
  const [file, setFile] = useState<File | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    checkDemucs();
    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close();
    };
  }, []);

  const checkDemucs = async () => {
    setSetupStatus('checking');
    try {
      const res = await fetch('/api/tools/stems/install');
      const data = await res.json();
      
      if (data.status === 'ready') {
        setSetupStatus('ready');
      } else if (data.status === 'no_python') {
        setSetupStatus('no_python');
      } else if (data.status === 'no_demucs') {
        setSetupStatus('no_demucs');
      } else {
        setSetupStatus('install_error');
        setSetupError(data.message);
      }
    } catch (e: any) {
      setSetupStatus('install_error');
      setSetupError(e.message);
    }
  };

  const installDemucs = async () => {
    setSetupStatus('installing');
    setSetupError('');
    try {
      const res = await fetch('/api/tools/stems/install', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al instalar');
      
      setSetupStatus('ready');
    } catch (e: any) {
      setSetupStatus('install_error');
      setSetupError(e.message);
    }
  };

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || !files[0]) return;
    const selected = files[0];
    setFile(selected);
    setErrorMsg('');
    setTask({ id: '', filename: selected.name, status: 'processing', progress: 0 });

    try {
      const formData = new FormData();
      formData.append('file', selected);

      const res = await fetch('/api/tools/stems/process', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al iniciar el proceso');
      }

      const { taskId } = await res.json();
      startPolling(taskId);
    } catch (err: any) {
      setErrorMsg(err.message);
      setTask(null);
    }
  };

  const startPolling = (taskId: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource(`/api/tools/stems/progress?taskId=${taskId}`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'update' && data.task) {
          setTask(data.task);
          if (data.task.status === 'completed' || data.task.status === 'error') {
            es.close();
          }
        }
      } catch (e) {
        // ignore keepalive
      }
    };

    es.onerror = () => {
      es.close();
    };
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="glass p-4 sm:p-6 rounded-2xl border border-border/50">

        {/* SETUP WIZARD */}
        {setupStatus !== 'ready' && (
          <div className="bg-surface-elevated border border-border/50 rounded-2xl p-8 max-w-lg mx-auto text-center space-y-6 animate-in zoom-in-95">
            {setupStatus === 'checking' && (
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                <p className="font-medium">Comprobando motor de Inteligencia Artificial...</p>
              </div>
            )}

            {setupStatus === 'no_python' && (
              <div className="space-y-4">
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-2">
                  <AlertTriangle className="w-8 h-8 text-red-500" />
                </div>
                <h3 className="text-lg font-bold">Falta Python en tu sistema</h3>
                <p className="text-sm text-text-secondary">
                  Demucs es un modelo de IA de código abierto que requiere Python para funcionar. Por favor, instala Python 3.8+ (asegúrate de marcar "Add Python to PATH" durante la instalación).
                </p>
                <div className="pt-4 flex gap-4 justify-center">
                  <a href="https://www.python.org/downloads/" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline text-sm font-medium">Descargar Python</a>
                  <button onClick={checkDemucs} className="text-indigo-400 hover:underline text-sm font-medium">Reintentar</button>
                </div>
              </div>
            )}

            {(setupStatus === 'no_demucs' || setupStatus === 'install_error') && (
              <div className="space-y-4">
                <div className="w-16 h-16 bg-indigo-500/10 rounded-full flex items-center justify-center mx-auto mb-2">
                  <Settings className="w-8 h-8 text-indigo-500" />
                </div>
                <h3 className="text-lg font-bold">Se requiere instalar Demucs</h3>
                <p className="text-sm text-text-secondary">
                  Hemos detectado Python en tu sistema, pero falta el motor Demucs. Haz clic en el botón para descargarlo e instalarlo automáticamente. Puede tardar un par de minutos.
                </p>
                {setupError && <p className="text-xs text-red-400 font-mono bg-red-400/10 p-2 rounded">{setupError}</p>}
                
                <Button onClick={installDemucs} className="w-full bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl">
                  Instalar Demucs IA
                </Button>
              </div>
            )}

            {setupStatus === 'installing' && (
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                  <Terminal className="w-6 h-6 text-indigo-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
                <p className="font-medium text-indigo-400">Instalando Demucs (vía pip)...</p>
                <p className="text-xs text-text-secondary">Por favor, espera unos instantes. Esto descargará las librerías necesarias.</p>
              </div>
            )}
          </div>
        )}

        {/* READY UI */}
        {setupStatus === 'ready' && (
          <div className="space-y-6">
            {!task || task.status === 'idle' ? (
              <div 
                className="border-2 border-dashed border-border/60 hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all rounded-2xl p-8 sm:p-12 cursor-pointer flex flex-col items-center justify-center gap-4 text-center"
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); handleFileSelect(e.dataTransfer.files); }}
                onClick={() => fileInputRef.current?.click()}
              >
                <input type="file" ref={fileInputRef} className="hidden" accept="audio/*" onChange={e => handleFileSelect(e.target.files)} />
                <div className="w-16 h-16 bg-surface-elevated rounded-full flex items-center justify-center shadow-inner">
                  <UploadCloud className="w-8 h-8 text-text-secondary" />
                </div>
                <div>
                  <p className="text-text-primary font-medium text-lg">Suelta una canción aquí</p>
                  <p className="text-sm text-text-secondary mt-1">La IA la separará en 4 pistas de alta calidad</p>
                </div>
              </div>
            ) : (
              <div className={`bg-surface-elevated rounded-2xl border border-border/50 text-center ${task.status === 'completed' ? 'p-1 sm:p-2' : 'p-8 space-y-6'}`}>
                {task.status !== 'completed' && <h3 className="font-medium truncate max-w-sm mx-auto">{task.filename}</h3>}
                
                {task.status === 'processing' && (
                  <div className="space-y-4">
                    <div className="relative pt-4">
                      <div className="flex mb-2 items-center justify-between">
                        <div>
                          <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-indigo-500 bg-indigo-500/10 transition-all">
                            {task.progress === 100 ? 'Finalizando y guardando pistas...' : 'Analizando y Separando'}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-semibold inline-block text-indigo-500">
                            {task.progress}%
                          </span>
                        </div>
                      </div>
                      <div className="overflow-hidden h-2 mb-4 text-xs flex rounded-full bg-surface">
                        <div style={{ width: `${task.progress}%` }} className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-indigo-500 transition-all duration-500" />
                      </div>
                    </div>
                    <p className="text-sm text-text-secondary animate-pulse">
                      {task.progress === 100 
                        ? 'Generando archivos de audio finales...' 
                        : 'Este proceso es intenso, puede tardar unos minutos...'}
                    </p>
                  </div>
                )}

                {task.status === 'completed' && (
                  <div className="animate-in zoom-in-95 fade-in duration-500">
                    <div className="flex items-center justify-between mb-2 px-3 pt-3">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        <span className="font-bold text-sm text-emerald-500">Separación Completada</span>
                      </div>
                      <Button onClick={() => setTask(null)} variant="outline" size="sm" className="h-8 text-xs">
                        Nueva Separación
                      </Button>
                    </div>
                    
                    <div className="text-left w-full">
                      <StemsMixer taskId={task.id} filename={task.filename} />
                    </div>
                  </div>
                )}

                {task.status === 'error' && (
                  <div className="space-y-4 animate-in zoom-in-95">
                    <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-2">
                      <AlertTriangle className="w-8 h-8 text-red-500" />
                    </div>
                    <p className="font-bold text-lg text-red-500">Error en el proceso</p>
                    <p className="text-sm text-text-secondary">{task.error}</p>
                    <Button onClick={() => setTask(null)} variant="outline" className="mt-4">
                      Intentar de nuevo
                    </Button>
                  </div>
                )}
              </div>
            )}
            
            {errorMsg && <p className="text-sm text-danger text-center">{errorMsg}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
