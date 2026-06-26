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
      // Usar la API pública de Cobalt.tools directamente desde el navegador (IP residencial)
      // Esto evita el bloqueo de Datacenters de Vercel (Sign in to confirm you're not a bot)
      const cobaltRes = await fetch('https://api.cobalt.tools/api/json', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: url,
          isAudioOnly: true,
          aFormat: 'mp3'
        })
      });

      if (!cobaltRes.ok) {
        // Fallback to new API format if needed
        throw new Error('El servicio de descarga está saturado o bloqueado. Intenta más tarde.');
      }

      const data = await cobaltRes.json();
      
      if (data.status === 'error') {
        throw new Error(data.text || 'Error extrayendo audio de YouTube');
      }

      // Cobalt nos devuelve la URL directa de descarga
      const downloadUrl = data.url;

      if (!downloadUrl) {
         throw new Error('No se recibió la URL de descarga');
      }

      setStatus('downloading');

      // Descargamos el archivo directamente para no bloquear la pestaña
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
    <div className="w-full max-w-3xl mx-auto py-24 bg-surface border border-border/50 rounded-2xl overflow-hidden shadow-2xl flex flex-col items-center justify-center p-8 relative">
      <div className="absolute top-0 left-0 w-full h-64 bg-accent/5 blur-[100px] rounded-full pointer-events-none" />
      
      <div className="max-w-xl w-full z-10 text-center space-y-8">
        <div>
          <div className="w-16 h-16 bg-accent/10 border border-accent/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Play className="w-8 h-8 text-accent" />
          </div>
          <h2 className="text-3xl font-bold text-text-primary mb-3">SoundBox Cloud</h2>
          <p className="text-text-secondary">Descarga audios de YouTube rápidamente y conviértelos a MP3 directamente en tu navegador, sin historial y a máxima velocidad.</p>
        </div>

        <div className="glass p-2 rounded-2xl border border-border flex items-center gap-2 focus-within:border-accent/50 focus-within:ring-1 focus-within:ring-accent/50 transition-all">
          <input 
            type="text" 
            placeholder="Pega el enlace de YouTube aquí..."
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && status === 'idle' && handleDownload()}
            className="flex-1 bg-transparent border-none focus:outline-none text-text-primary px-4 py-3 placeholder:text-text-secondary/50"
            disabled={status !== 'idle' && status !== 'error' && status !== 'done'}
          />
          <Button 
            onClick={handleDownload}
            disabled={!url.trim() || (status !== 'idle' && status !== 'error' && status !== 'done')}
            className="rounded-xl px-6 py-3 font-bold"
          >
            {status === 'idle' && <><Download className="w-4 h-4 mr-2" /> Descargar</>}
            {status === 'error' && <><AlertCircle className="w-4 h-4 mr-2" /> Reintentar</>}
            {status === 'done' && <><CheckCircle2 className="w-4 h-4 mr-2" /> ¡Completado!</>}
            {status === 'extracting' && <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Procesando...</>}
            {status === 'downloading' && <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Descargando...</>}
          </Button>
        </div>

        {status === 'extracting' && <p className="text-sm text-text-secondary animate-pulse">Conectando con el motor anti-bot...</p>}
        {status === 'downloading' && <p className="text-sm text-text-secondary animate-pulse">Descargando audio...</p>}
        {status === 'error' && <p className="text-sm text-danger font-medium">{errorMsg}</p>}

      </div>
    </div>
  );
}
