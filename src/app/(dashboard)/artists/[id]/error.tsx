'use client';
import { useEffect } from 'react';

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Captured by Next.js Error Boundary:', error);
  }, [error]);

  return (
    <div className="p-8 text-center border border-error/50 bg-error/10 rounded-xl m-8 max-w-4xl mx-auto shadow-2xl">
      <h2 className="text-xl font-bold text-error mb-4 flex items-center justify-center gap-2">
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        Error de Renderizado
      </h2>
      <p className="text-text-primary mb-4">
        Ha ocurrido un error en la interfaz. Por favor, toma una captura de pantalla de este mensaje y compártela para solucionarlo.
      </p>
      <div className="text-left bg-[#0a0a0f] p-4 rounded-lg overflow-x-auto border border-border mb-6">
        <p className="text-error font-mono font-bold mb-2">{error.name}: {error.message}</p>
        <pre className="text-text-secondary font-mono text-xs whitespace-pre-wrap">{error.stack}</pre>
      </div>
      <button 
        onClick={() => reset()} 
        className="px-6 py-2 bg-error text-white font-semibold rounded-lg hover:bg-error/80 transition-colors"
      >
        Intentar de nuevo
      </button>
    </div>
  );
}
