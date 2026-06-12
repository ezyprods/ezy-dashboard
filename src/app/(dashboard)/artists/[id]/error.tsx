'use client';
import { useEffect } from 'react';

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Captured by Next.js Error Boundary:', error);
  }, [error]);

  return (
    <div className="p-8 text-center border border-error/50 bg-error/10 rounded-xl m-8 max-w-4xl mx-auto shadow-2xl">
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <h2 className="text-xl font-bold">This page couldn’t load</h2>
          <p className="text-text-secondary text-sm">Reload to try again, or go back.</p>
          <div className="bg-error/10 text-error p-4 rounded-xl text-xs max-w-lg mx-auto text-left overflow-auto">
            {error.message || 'Unknown error'}
          </div>
          <div className="flex items-center justify-center gap-4 mt-4">
            <button onClick={() => window.location.reload()} className="px-4 py-2 bg-surface-elevated text-text-primary hover:bg-surface border border-border rounded-lg transition-colors text-sm font-medium">
              Reload
            </button>
            <button onClick={() => window.history.back()} className="px-4 py-2 bg-accent text-white hover:bg-accent-hover rounded-lg transition-colors text-sm font-medium shadow-lg shadow-accent/20">
              Back
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
