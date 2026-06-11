'use client';

import { useState, useEffect } from 'react';
import { Loader2, Table2, ChevronRight, User } from 'lucide-react';
import Link from 'next/link';

export function GlobalMatricesWidget() {
  const [matrices, setMatrices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard/matrices')
      .then(res => res.json())
      .then(data => {
        setMatrices(data.matrices || []);
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Error fetching global matrices', err);
        setIsLoading(false);
      });
  }, []);

  if (isLoading) {
    return (
      <div className="glass rounded-xl border border-border p-6 mt-8 flex flex-col items-center justify-center min-h-[150px]">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
        <p className="text-sm text-text-secondary mt-2">Cargando matrices...</p>
      </div>
    );
  }

  if (matrices.length === 0) {
    return (
      <div className="glass rounded-xl border border-border p-6 mt-8 text-center text-text-secondary">
        <Table2 className="w-8 h-8 mx-auto mb-3 opacity-50" />
        <p>No hay matrices abiertas en ningún proyecto.</p>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-4">
      <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
        <Table2 className="w-5 h-5 text-accent" />
        Matrices Activas
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {matrices.map(m => (
          <Link 
            key={`${m.artistId}-${m.id}`} 
            href={`/artists/${m.artistId}`}
            className="glass rounded-xl p-5 border border-border hover:border-accent/50 hover:bg-surface-elevated/50 transition-all group block"
          >
            <div className="flex justify-between items-start mb-2">
              <h4 className="font-bold text-text-primary truncate">{m.name}</h4>
              <ChevronRight className="w-4 h-4 text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <User className="w-3.5 h-3.5" />
              <span className="truncate">{m.artistName}</span>
            </div>
            
            {m.productionGrid && (
              <div className="mt-4 pt-4 border-t border-border/50 text-xs text-text-secondary flex justify-between">
                <span>{m.productionGrid.rows?.length || 0} filas</span>
                <span>{m.productionGrid.columns?.length || 0} columnas</span>
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
