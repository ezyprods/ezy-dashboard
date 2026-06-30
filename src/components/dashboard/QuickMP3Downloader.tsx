'use client';

import { useState } from 'react';
import { Loader2, Download, CheckCircle2, AlertCircle } from 'lucide-react';
import { customAlert } from '@/lib/dialog';

export function QuickMP3Downloader() {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'extracting' | 'done' | 'error'>('idle');

  const handleDownload = async () => {
    if (!url.trim()) return;
    setStatus('extracting');

    try {
      const downloadUrl = `/api/tools/ytdl?url=${encodeURIComponent(url)}`;
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
      customAlert(err.message || 'Error al descargar MP3');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  return (
    <div className="flex-1 relative overflow-hidden glass rounded-xl border border-border/60 hover:border-emerald-500/50 focus-within:border-emerald-500/50 group transition-all flex items-center gap-3 p-3 md:px-4 shadow-sm hover:shadow-md focus-within:shadow-md focus-within:bg-surface-elevated/50">
      <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/10 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none group-focus-within:scale-150 transition-transform duration-500" />
      
      <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-500/20 text-emerald-500 flex items-center justify-center transition-transform shadow-inner relative z-10 shrink-0">
        {status === 'idle' && <Download className="w-4 h-4" />}
        {status === 'extracting' && <Loader2 className="w-4 h-4 animate-spin" />}
        {status === 'done' && <CheckCircle2 className="w-4 h-4" />}
        {status === 'error' && <AlertCircle className="w-4 h-4 text-error" />}
      </div>
      
      <div className="flex-1 min-w-0 relative z-10 flex flex-col justify-center h-full">
        <input 
          type="text" 
          placeholder="Pegar link YouTube..."
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && status === 'idle' && handleDownload()}
          className="w-full bg-transparent border-none focus:outline-none text-sm font-bold text-text-primary placeholder:text-text-primary/70 p-0 m-0 leading-tight"
          disabled={status !== 'idle' && status !== 'error'}
        />
        <p className="text-[11px] text-text-secondary font-medium mt-0.5 leading-tight">
          {status === 'idle' && "Presiona Enter para descargar MP3"}
          {status === 'extracting' && "Procesando..."}
          {status === 'done' && "¡Descargado!"}
          {status === 'error' && "Error al descargar"}
        </p>
      </div>
    </div>
  );
}
