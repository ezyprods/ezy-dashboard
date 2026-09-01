'use client';

import { useState, useRef, useEffect } from 'react';
import { 
  UploadCloud, 
  Layers, 
  Loader2, 
  CheckCircle2, 
  AlertTriangle, 
  Terminal, 
  Settings, 
  Zap, 
  Key, 
  ExternalLink,
  Cpu
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { StemsMixer } from './StemsMixer';

type SetupStatus = 'checking' | 'ready' | 'need_token_or_python' | 'no_demucs' | 'installing' | 'install_error';
type ProcessStatus = 'idle' | 'processing' | 'completed' | 'error';

interface Task {
  id: string;
  predictionId?: string;
  filename: string;
  status: ProcessStatus;
  progress: number;
  engine?: 'cloud' | 'local';
  outputDir?: string;
  stems?: {
    vocals?: string;
    drums?: string;
    bass?: string;
    other?: string;
  };
  error?: string;
}

export function StemsSplitter() {
  const [setupStatus, setSetupStatus] = useState<SetupStatus>('checking');
  const [setupError, setSetupError] = useState('');
  const [engineType, setEngineType] = useState<'cloud' | 'local'>('cloud');
  const [cloudAvailable, setCloudAvailable] = useState(false);
  const [localAvailable, setLocalAvailable] = useState(false);
  
  // Replicate token state
  const [replicateToken, setReplicateToken] = useState<string>('');
  const [inputToken, setInputToken] = useState<string>('');
  const [isVerifyingToken, setIsVerifyingToken] = useState(false);
  const [tokenError, setTokenError] = useState('');
  const [showTokenSettings, setShowTokenSettings] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Cargar token guardado en localStorage si existe
    const savedToken = typeof window !== 'undefined' ? localStorage.getItem('ezy_replicate_token') || '' : '';
    if (savedToken) {
      setReplicateToken(savedToken);
      setInputToken(savedToken);
    }
    checkEngineStatus(savedToken);

    return () => {
      if (eventSourceRef.current) eventSourceRef.current.close();
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const checkEngineStatus = async (tokenToTest?: string) => {
    setSetupStatus('checking');
    setSetupError('');
    try {
      const activeToken = tokenToTest !== undefined ? tokenToTest : replicateToken;
      const headers: Record<string, string> = {};
      if (activeToken) {
        headers['x-replicate-token'] = activeToken;
      }

      const res = await fetch('/api/tools/stems/install', { headers });
      const data = await res.json();
      
      setCloudAvailable(Boolean(data.cloudAvailable));
      setLocalAvailable(Boolean(data.localAvailable));

      if (data.status === 'ready') {
        setSetupStatus('ready');
        setEngineType(data.engine || 'cloud');
      } else if (data.status === 'no_demucs') {
        setSetupStatus('no_demucs');
      } else {
        setSetupStatus('need_token_or_python');
        setSetupError(data.message || '');
      }
    } catch (e: any) {
      setSetupStatus('install_error');
      setSetupError(e.message || 'Error al verificar el motor de IA');
    }
  };

  const handleSaveToken = async () => {
    if (!inputToken.trim()) {
      setTokenError('Por favor ingresa un token válido de Replicate');
      return;
    }

    setIsVerifyingToken(true);
    setTokenError('');

    try {
      const res = await fetch('/api/tools/stems/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify_token', token: inputToken.trim() })
      });

      const data = await res.json();

      if (!res.ok || !data.valid) {
        throw new Error(data.error || 'Token inválido');
      }

      // Guardar token válido
      localStorage.setItem('ezy_replicate_token', inputToken.trim());
      setReplicateToken(inputToken.trim());
      setShowTokenSettings(false);
      await checkEngineStatus(inputToken.trim());
    } catch (err: any) {
      setTokenError(err.message || 'Error al verificar el token');
    } finally {
      setIsVerifyingToken(false);
    }
  };

  const removeToken = () => {
    localStorage.removeItem('ezy_replicate_token');
    setReplicateToken('');
    setInputToken('');
    checkEngineStatus('');
  };

  const installDemucsLocal = async () => {
    setSetupStatus('installing');
    setSetupError('');
    try {
      const res = await fetch('/api/tools/stems/install', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al instalar Demucs');
      
      await checkEngineStatus();
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
    setTask({ id: '', filename: selected.name, status: 'processing', progress: 5, engine: engineType });

    try {
      const formData = new FormData();
      formData.append('file', selected);
      formData.append('engine', engineType);
      if (replicateToken) {
        formData.append('replicateToken', replicateToken);
      }

      const headers: Record<string, string> = {};
      if (replicateToken) {
        headers['x-replicate-token'] = replicateToken;
      }

      const res = await fetch('/api/tools/stems/process', {
        method: 'POST',
        headers,
        body: formData
      });

      const resData = await res.json();

      if (!res.ok) {
        if (res.status === 402 || resData.code === 'INSUFFICIENT_CREDIT') {
          throw new Error('Tu cuenta de Replicate no tiene créditos suficientes para GPU. Puedes usar Demucs en tu PC o añadir saldo en Replicate.com.');
        }
        throw new Error(resData.error || 'Error al iniciar el proceso');
      }

      const { taskId, predictionId, engine } = resData;
      setTask({ 
        id: taskId, 
        predictionId, 
        filename: selected.name, 
        status: 'processing', 
        progress: 10,
        engine: engine || engineType 
      });

      startTracking(taskId, predictionId);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al procesar el audio');
      setTask(null);
    }
  };

  const startTracking = (taskId: string, predictionId?: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    const sseUrl = `/api/tools/stems/progress?taskId=${encodeURIComponent(taskId)}${predictionId ? `&predictionId=${encodeURIComponent(predictionId)}` : ''}`;
    
    try {
      const es = new EventSource(sseUrl);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'update' && data.task) {
            setTask(data.task);
            if (data.task.status === 'completed' || data.task.status === 'error') {
              es.close();
              if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            }
          }
        } catch (e) {
          // ignore heartbeat
        }
      };

      es.onerror = () => {
        es.close();
      };
    } catch (e) {
      // SSE not supported or blocked
    }

    // Fallback de polling activo (cada 2.5s) para Vercel Serverless
    pollIntervalRef.current = setInterval(async () => {
      try {
        const jsonUrl = `/api/tools/stems/progress?taskId=${encodeURIComponent(taskId)}${predictionId ? `&predictionId=${encodeURIComponent(predictionId)}` : ''}&format=json`;
        const headers: Record<string, string> = { 'Accept': 'application/json' };
        if (replicateToken) headers['x-replicate-token'] = replicateToken;

        const res = await fetch(jsonUrl, { headers });
        if (res.ok) {
          const data = await res.json();
          if (data.task) {
            setTask(data.task);
            if (data.task.status === 'completed' || data.task.status === 'error') {
              if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
              if (eventSourceRef.current) eventSourceRef.current.close();
            }
          }
        }
      } catch (e) {
        // ignore polling network glitch
      }
    }, 2500);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header Info & Settings */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-surface p-4 rounded-2xl border border-border/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
              Separador de Stems (Demucs IA)
              {setupStatus === 'ready' && (
                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                  engineType === 'cloud' 
                    ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
                    : 'bg-indigo-500/10 text-indigo-500 border border-indigo-500/20'
                }`}>
                  {engineType === 'cloud' ? <Zap className="w-3 h-3 fill-emerald-500" /> : <Cpu className="w-3 h-3" />}
                  {engineType === 'cloud' ? 'Cloud GPU Activo' : 'Motor Local'}
                </span>
              )}
            </h2>
            <p className="text-xs text-text-secondary">
              Separa cualquier audio en Voces, Batería, Bajo e Instrumental con calidad de estudio.
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowTokenSettings(!showTokenSettings)}
          className="text-xs flex items-center gap-1.5 shrink-0"
        >
          <Settings className="w-3.5 h-3.5 text-text-secondary" />
          {replicateToken ? 'Configurar Token IA' : 'Conectar Token IA'}
        </Button>
      </div>

      {/* Modal / Card de Configuración de Token de IA */}
      {showTokenSettings && (
        <div className="bg-surface-elevated border border-indigo-500/30 rounded-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key className="w-5 h-5 text-indigo-400" />
              <h3 className="font-bold text-text-primary text-sm">Token de IA en la Nube (Replicate GPU)</h3>
            </div>
            <button 
              onClick={() => setShowTokenSettings(false)}
              className="text-xs text-text-secondary hover:text-text-primary"
            >
              Cerrar
            </button>
          </div>

          <p className="text-xs text-text-secondary leading-relaxed">
            Permite procesar canciones en la nube desde cualquier dispositivo (Vercel, móvil o PC) a máxima velocidad en tarjetas gráficas NVIDIA dedicadas sin consumir los recursos de tu ordenador.
          </p>

          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="password"
                placeholder="Pega tu token de Replicate (r8_...)"
                value={inputToken}
                onChange={(e) => setInputToken(e.target.value)}
                className="flex-1 px-3 py-2 text-sm bg-surface border border-border/70 rounded-xl font-mono focus:outline-none focus:border-indigo-500"
              />
              <Button 
                onClick={handleSaveToken} 
                disabled={isVerifyingToken || !inputToken.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs px-4"
              >
                {isVerifyingToken ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verificar y Guardar'}
              </Button>
            </div>

            {tokenError && (
              <p className="text-xs text-red-500 font-medium">{tokenError}</p>
            )}

            <div className="flex items-center justify-between pt-2 text-[11px] text-text-secondary">
              <a
                href="https://replicate.com/account/api-tokens"
                target="_blank"
                rel="noreferrer"
                className="text-indigo-400 hover:underline flex items-center gap-1 font-medium"
              >
                Obtener token gratis en Replicate.com <ExternalLink className="w-3 h-3" />
              </a>

              {replicateToken && (
                <button onClick={removeToken} className="text-red-400 hover:underline">
                  Desconectar token
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="glass p-4 sm:p-6 rounded-2xl border border-border/50">
        {/* SETUP WIZARD */}
        {setupStatus !== 'ready' && (
          <div className="bg-surface-elevated border border-border/50 rounded-2xl p-8 max-w-lg mx-auto text-center space-y-6 animate-in zoom-in-95">
            {setupStatus === 'checking' && (
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                <p className="font-medium text-sm">Comprobando conexión con el motor de Inteligencia Artificial...</p>
              </div>
            )}

            {setupStatus === 'need_token_or_python' && (
              <div className="space-y-4">
                <div className="w-16 h-16 bg-indigo-500/10 rounded-full flex items-center justify-center mx-auto mb-2 text-indigo-500">
                  <Zap className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold">Activa el Procesador de Stems en la Nube</h3>
                <p className="text-sm text-text-secondary leading-relaxed">
                  Para separar pistas desde la web desplegada (Vercel) sin necesidad de tener tu ordenador encendido, conecta tu token gratuito de <strong>Replicate AI</strong>.
                </p>

                <div className="space-y-3 pt-2">
                  <input
                    type="password"
                    placeholder="Pega tu token de Replicate (r8_...)"
                    value={inputToken}
                    onChange={(e) => setInputToken(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-surface border border-border/80 rounded-xl font-mono focus:outline-none focus:border-indigo-500"
                  />

                  {tokenError && (
                    <p className="text-xs text-red-500 font-medium">{tokenError}</p>
                  )}

                  <Button 
                    onClick={handleSaveToken}
                    disabled={isVerifyingToken || !inputToken.trim()}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-2.5 font-medium flex items-center justify-center gap-2"
                  >
                    {isVerifyingToken ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    Conectar y Activar Stems
                  </Button>

                  <div className="pt-2 flex flex-col gap-2 text-xs">
                    <a 
                      href="https://replicate.com/account/api-tokens" 
                      target="_blank" 
                      rel="noreferrer" 
                      className="text-indigo-400 hover:underline inline-flex items-center justify-center gap-1 font-medium"
                    >
                      1. Conseguir token en Replicate.com (Gratis) <ExternalLink className="w-3 h-3" />
                    </a>
                    <button 
                      onClick={() => checkEngineStatus()} 
                      className="text-text-secondary hover:text-text-primary text-[11px]"
                    >
                      Reintentar comprobación
                    </button>
                  </div>
                </div>
              </div>
            )}

            {setupStatus === 'no_demucs' && (
              <div className="space-y-4">
                <div className="w-16 h-16 bg-indigo-500/10 rounded-full flex items-center justify-center mx-auto mb-2">
                  <Settings className="w-8 h-8 text-indigo-500" />
                </div>
                <h3 className="text-lg font-bold">Motor Demucs Local detectado</h3>
                <p className="text-sm text-text-secondary">
                  Hemos detectado Python en tu sistema local. Puedes instalar Demucs en tu PC o conectar un token de nube para usar GPU.
                </p>
                {setupError && <p className="text-xs text-red-400 font-mono bg-red-400/10 p-2 rounded">{setupError}</p>}
                
                <div className="flex flex-col gap-2 pt-2">
                  <Button onClick={installDemucsLocal} className="w-full bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl">
                    Instalar Demucs en PC
                  </Button>
                  <Button onClick={() => setShowTokenSettings(true)} variant="outline" className="w-full rounded-xl text-xs">
                    Preferir Motor en la Nube (Replicate GPU)
                  </Button>
                </div>
              </div>
            )}

            {setupStatus === 'installing' && (
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                  <Terminal className="w-6 h-6 text-indigo-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
                <p className="font-medium text-indigo-400">Instalando Demucs en tu PC...</p>
                <p className="text-xs text-text-secondary">Por favor, espera unos instantes. Esto descargará las librerías necesarias.</p>
              </div>
            )}

            {setupStatus === 'install_error' && (
              <div className="space-y-4">
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-2">
                  <AlertTriangle className="w-8 h-8 text-red-500" />
                </div>
                <h3 className="text-lg font-bold text-red-500">Error al iniciar el motor</h3>
                <p className="text-xs text-text-secondary">{setupError}</p>
                <Button onClick={() => checkEngineStatus()} variant="outline" className="rounded-xl">
                  Reintentar
                </Button>
              </div>
            )}
          </div>
        )}

        {/* READY UI */}
        {setupStatus === 'ready' && (
          <div className="space-y-6">
            {!task || task.status === 'idle' ? (
              <div 
                className="border-2 border-dashed border-border/60 hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all rounded-2xl p-8 sm:p-12 cursor-pointer flex flex-col items-center justify-center gap-4 text-center group"
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); handleFileSelect(e.dataTransfer.files); }}
                onClick={() => fileInputRef.current?.click()}
              >
                <input type="file" ref={fileInputRef} className="hidden" accept="audio/*" onChange={e => handleFileSelect(e.target.files)} />
                <div className="w-16 h-16 bg-surface-elevated rounded-full flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform">
                  <UploadCloud className="w-8 h-8 text-indigo-400" />
                </div>
                <div>
                  <p className="text-text-primary font-medium text-lg">Arrastra y suelta tu canción aquí</p>
                  <p className="text-sm text-text-secondary mt-1">
                    La IA de Demucs la separará en 4 pistas limpias (Voz, Batería, Bajo, Instrumental)
                  </p>
                </div>
                <span className="text-xs text-indigo-400 font-medium bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
                  Formatos soportados: MP3, WAV, FLAC, M4A, OGG
                </span>
              </div>
            ) : (
              <div className={`bg-surface-elevated rounded-2xl border border-border/50 text-center ${task.status === 'completed' ? 'p-1 sm:p-2' : 'p-8 space-y-6'}`}>
                {task.status !== 'completed' && <h3 className="font-medium truncate max-w-sm mx-auto text-sm">{task.filename}</h3>}
                
                {task.status === 'processing' && (
                  <div className="space-y-4">
                    <div className="relative pt-4">
                      <div className="flex mb-2 items-center justify-between">
                        <div>
                          <span className="text-xs font-semibold inline-block py-1 px-2.5 uppercase rounded-full text-indigo-500 bg-indigo-500/10 transition-all">
                            {task.progress >= 100 
                              ? 'Finalizando y empaquetando pistas...' 
                              : engineType === 'cloud' 
                                ? 'Procesando en GPU Cloud...' 
                                : 'Separando pistas...'}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-semibold inline-block text-indigo-500">
                            {task.progress}%
                          </span>
                        </div>
                      </div>
                      <div className="overflow-hidden h-2.5 mb-4 text-xs flex rounded-full bg-surface">
                        <div 
                          style={{ width: `${task.progress}%` }} 
                          className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-indigo-500 transition-all duration-500" 
                        />
                      </div>
                    </div>
                    <p className="text-xs text-text-secondary animate-pulse">
                      {task.progress >= 100 
                        ? 'Cargando mezclador interactivo...' 
                        : 'Separando frecuencias vocales, percusión, bajo y armonías...'}
                    </p>
                  </div>
                )}

                {task.status === 'completed' && (
                  <div className="animate-in zoom-in-95 fade-in duration-500">
                    <div className="flex items-center justify-between mb-2 px-3 pt-3">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        <span className="font-bold text-sm text-emerald-500">Separación Completada con Éxito</span>
                      </div>
                      <Button onClick={() => setTask(null)} variant="outline" size="sm" className="h-8 text-xs">
                        Separar otra canción
                      </Button>
                    </div>
                    
                    <div className="text-left w-full">
                      <StemsMixer taskId={task.id} filename={task.filename} stems={task.stems} />
                    </div>
                  </div>
                )}

                {task.status === 'error' && (
                  <div className="space-y-4 animate-in zoom-in-95">
                    <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-2">
                      <AlertTriangle className="w-8 h-8 text-red-500" />
                    </div>
                    <p className="font-bold text-lg text-red-500">Error en el proceso</p>
                    <p className="text-sm text-text-secondary max-w-md mx-auto">{task.error}</p>
                    <div className="flex items-center justify-center gap-3 pt-2">
                      <Button onClick={() => setTask(null)} variant="outline">
                        Intentar de nuevo
                      </Button>
                      {(task.error?.toLowerCase().includes('token') || task.error?.toLowerCase().includes('crédito') || task.error?.toLowerCase().includes('replicate') || task.error?.toLowerCase().includes('gpu')) && (
                        <Button 
                          onClick={() => { setTask(null); setShowTokenSettings(true); }} 
                          className="bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                          Configurar Token IA
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {errorMsg && <p className="text-sm text-danger text-center font-medium">{errorMsg}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
