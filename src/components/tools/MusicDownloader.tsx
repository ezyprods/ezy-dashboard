'use client';

import { useState } from 'react';
import { Loader2, Download, CheckCircle2, AlertCircle, Play } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function MusicDownloader() {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'extracting' | 'downloading' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  const handleDownload = async () => {
    if (!url.trim()) return;
    setStatus('extracting');
    setErrorMsg('');
    setProgress(0);

    try {
      // Usar nuestra API nativa de Vercel que descargará yt-dlp y ffmpeg al vuelo
      // Redirigir directamente el navegador al endpoint GET
      // Esto delega toda la gestión del archivo y la memoria al navegador (Descarga nativa)
      
      const downloadUrl = `/api/tools/ytdl?url=${encodeURIComponent(url)}`;
      
      // Creamos un link oculto y forzamos el clic para que el navegador inicie la descarga
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setStatus('done');
      setTimeout(() => {
        setStatus('idle');
        setUrl('');
      }, 3000);

    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setErrorMsg(err.message || 'Error desconocido al descargar');
    }
  };

  return (
  return (
    <div className="w-full max-w-3xl mx-auto py-8 sm:py-24 bg-surface border border-border/50 rounded-2xl overflow-hidden shadow-2xl flex flex-col items-center justify-center p-4 sm:p-8 relative">
      <div className="absolute top-0 left-0 w-full h-64 bg-accent/5 blur-[100px] rounded-full pointer-events-none" />
      
      <div className="max-w-xl w-full z-10 text-center space-y-6 sm:space-y-8">
        <div>
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-accent/10 border border-accent/20 rounded-2xl flex items-center justify-center mx-auto mb-4 sm:mb-6">
            <Play className="w-6 h-6 sm:w-8 sm:h-8 text-accent" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-text-primary mb-2 sm:mb-3">SoundBox Cloud</h2>
          <p className="text-sm sm:text-base text-text-secondary">Descarga audios de YouTube rápidamente y conviértelos a MP3 directamente en tu navegador, sin historial y a máxima velocidad.</p>
        </div>

        <div className="glass p-1.5 sm:p-2 rounded-2xl border border-border flex items-center gap-1 sm:gap-2 focus-within:border-accent/50 focus-within:ring-1 focus-within:ring-accent/50 transition-all">
          <input 
            type="text" 
            placeholder="Pega el enlace de YouTube aquí..."
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && status === 'idle' && handleDownload()}
            className="flex-1 min-w-0 bg-transparent border-none focus:outline-none text-text-primary px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base placeholder:text-text-secondary/50"
            disabled={status !== 'idle' && status !== 'error' && status !== 'done'}
          />
          <Button 
            onClick={handleDownload}
            disabled={!url.trim() || (status !== 'idle' && status !== 'error' && status !== 'done')}
            className="rounded-xl px-4 sm:px-6 py-2 sm:py-3 font-bold shrink-0 whitespace-nowrap"
          >
            {status === 'idle' && <><Download className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">Descargar</span></>}
            {status === 'error' && <><AlertCircle className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">Reintentar</span></>}
            {status === 'done' && <><CheckCircle2 className="w-4 h-4 sm:mr-2" /> <span className="hidden sm:inline">¡Completado!</span></>}
            {status === 'extracting' && <><Loader2 className="w-4 h-4 sm:mr-2 animate-spin" /> <span className="hidden sm:inline">Procesando...</span></>}
            {status === 'downloading' && <><Loader2 className="w-4 h-4 sm:mr-2 animate-spin" /> <span className="hidden sm:inline">Descargando...</span></>}
          </Button>
        </div>

        {status === 'extracting' && <p className="text-sm text-text-secondary animate-pulse">Conectando con el motor anti-bot...</p>}
        {status === 'downloading' && <p className="text-sm text-text-secondary animate-pulse">Descargando audio...</p>}
        {status === 'error' && <p className="text-sm text-danger font-medium">{errorMsg}</p>}

      </div>
    </div>
  );
}
