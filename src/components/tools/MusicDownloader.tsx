'use client';

import { useState, useEffect } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface MusicDownloaderProps {
  toolUrl?: string; // e.g. http://localhost:3000
}

export function MusicDownloader({ toolUrl = 'http://localhost:3000' }: MusicDownloaderProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Auto-detect if localhost is alive
  useEffect(() => {
    let isMounted = true;
    
    // We try to fetch the headers of the URL to see if it's reachable.
    // If it's localhost, we can catch the network error.
    fetch(toolUrl, { mode: 'no-cors' })
      .then(() => {
        if (isMounted) {
          setHasError(false);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setHasError(true);
          setIsLoading(false);
        }
      });
      
    return () => { isMounted = false; };
  }, [toolUrl]);

  if (hasError) {
    return (
      <div className="w-full h-[75vh] bg-surface border border-border rounded-2xl flex flex-col items-center justify-center p-8 text-center shadow-lg">
        <div className="w-16 h-16 bg-danger/10 text-danger rounded-2xl flex items-center justify-center mb-6 border border-danger/20">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-text-primary mb-2">Herramienta no disponible</h2>
        <p className="text-text-secondary max-w-md mb-8">
          No se pudo conectar con el motor local de la herramienta en <strong>{toolUrl}</strong>.
          Asegúrate de que la aplicación "SoundBox" está ejecutándose en tu ordenador.
        </p>
        <Button onClick={() => window.location.reload()} variant="primary">
          Reintentar conexión
        </Button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[85vh] bg-surface border border-border/50 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
      {isLoading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface backdrop-blur-sm">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      )}
      <iframe 
        src={`${toolUrl}?embedded=true`} 
        className="w-full flex-1 border-none"
        onLoad={() => setIsLoading(false)}
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
