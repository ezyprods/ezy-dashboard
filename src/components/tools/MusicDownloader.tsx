'use client';

import { useState, useRef } from 'react';
import { Loader2, Download, CheckCircle2, AlertCircle, Play } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function MusicDownloader() {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'extracting' | 'downloading' | 'converting' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  
  const ffmpegRef = useRef<any>(null);

  const loadFFmpeg = async () => {
    if (ffmpegRef.current) return ffmpegRef.current;
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const { toBlobURL } = await import('@ffmpeg/util');
    const ffmpeg = new FFmpeg();
    
    ffmpeg.on('progress', ({ progress, time }) => {
      setProgress(Math.round(progress * 100));
    });

    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    
    ffmpegRef.current = ffmpeg;
    return ffmpeg;
  };

  const handleDownload = async () => {
    if (!url.trim()) return;
    setStatus('extracting');
    setErrorMsg('');
    setProgress(0);

    try {
      // 1. Extract Info
      const extractRes = await fetch('/api/tools/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      
      const info = await extractRes.json();
      if (!extractRes.ok) throw new Error(info.error || 'Error extrayendo info del video');

      setStatus('downloading');

      // 2. Download Stream via Proxy
      const proxyUrl = `/api/tools/proxy?url=${encodeURIComponent(info.directUrl)}`;
      const streamRes = await fetch(proxyUrl);
      if (!streamRes.ok) throw new Error('Error al descargar el flujo de audio');

      const contentLength = streamRes.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      let loaded = 0;

      const reader = streamRes.body?.getReader();
      if (!reader) throw new Error('No stream body');

      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          loaded += value.length;
          if (total) {
            setProgress(Math.round((loaded / total) * 100));
          }
        }
      }

      // Merge chunks
      const totalLength = chunks.reduce((acc, val) => acc + val.length, 0);
      const audioData = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        audioData.set(chunk, offset);
        offset += chunk.length;
      }

      // 3. Convert to MP3
      setStatus('converting');
      setProgress(0);
      
      const ffmpeg = await loadFFmpeg();
      const inputName = `input.${info.format || 'webm'}`;
      
      await ffmpeg.writeFile(inputName, audioData);
      
      // Convert
      await ffmpeg.exec(['-i', inputName, '-vn', '-ab', '192k', '-ar', '44100', '-y', 'output.mp3']);
      
      const data = await ffmpeg.readFile('output.mp3');
      const blob = new Blob([data], { type: 'audio/mp3' });
      
      // Cleanup FFmpeg FS
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile('output.mp3');

      // 4. Download to User
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      const safeTitle = info.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      a.download = `${safeTitle}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      setStatus('done');
      setTimeout(() => {
        setStatus('idle');
        setUrl('');
        setProgress(0);
      }, 3000);

    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setErrorMsg(err.message || 'Error desconocido al descargar');
    }
  };

  return (
    <div className="w-full h-full min-h-[60vh] bg-surface border border-border/50 rounded-2xl overflow-hidden shadow-2xl flex flex-col items-center justify-center p-8 relative">
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
            {(status === 'downloading' || status === 'converting') && <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {progress}%</>}
          </Button>
        </div>

        {status === 'extracting' && <p className="text-sm text-text-secondary animate-pulse">Obteniendo metadatos del video...</p>}
        {status === 'downloading' && <p className="text-sm text-text-secondary animate-pulse">Descargando audio de alta calidad... ({progress}%)</p>}
        {status === 'converting' && <p className="text-sm text-accent animate-pulse font-medium">Convirtiendo a MP3... ({progress}%)</p>}
        {status === 'error' && <p className="text-sm text-danger font-medium">{errorMsg}</p>}

      </div>
    </div>
  );
}
