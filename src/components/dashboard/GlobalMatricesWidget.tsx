'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, Table2, ChevronRight, User } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useSmoothScroll } from '@/hooks/useSmoothScroll';

export function GlobalMatricesWidget() {
  const [matrices, setMatrices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  useSmoothScroll(scrollRef);

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
      <div className="relative bg-surface-elevated rounded-[18px] border border-border/50 overflow-hidden shadow-xl animate-pulse">
        <div className="p-4 border-b border-border/50 bg-surface/50 flex items-center gap-2">
          <Table2 className="w-4 h-4 text-accent" />
          <h3 className="font-semibold text-sm">Matrices Activas</h3>
        </div>
        <div className="p-6 flex flex-col items-center justify-center min-h-[150px]">
          <Loader2 className="w-5 h-5 animate-spin text-accent" />
          <p className="text-xs text-text-secondary mt-2">Cargando matrices...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full flex flex-col min-h-0">
      <div className="absolute -inset-0.5 bg-gradient-to-b from-accent/20 to-transparent rounded-[20px] blur opacity-50" />
      <div className="relative bg-surface-elevated rounded-[18px] border border-border/50 overflow-hidden shadow-xl flex flex-col h-full min-h-0">
        <div className="p-4 border-b border-border/50 bg-surface/50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Table2 className="w-4 h-4 text-accent" />
            <h3 className="font-semibold text-sm">Matrices Activas</h3>
          </div>
          <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full font-bold">
            {matrices.length}
          </span>
        </div>
        
        <div ref={scrollRef} className="p-3 flex-1 min-h-0 overflow-y-auto scroll-smooth space-y-2 custom-scrollbar">
          {matrices.length === 0 ? (
            <div className="text-center py-8 text-xs text-text-secondary h-full flex flex-col items-center justify-center">
              <Table2 className="w-6 h-6 mx-auto mb-2 opacity-30" />
              <p>No hay matrices abiertas.</p>
            </div>
          ) : (
            matrices.map(m => (
              <Link 
                key={`${m.artistId}-${m.id}`}
                href={`/artists/${m.artistId}?tab=matrices`}
                className="flex items-center justify-between p-3 rounded-xl hover:bg-surface border border-transparent hover:border-border/50 transition-all group block shrink-0"
              >
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-xs text-text-primary group-hover:text-accent transition-colors truncate">{m.name}</h4>
                  <div className="flex items-center gap-1.5 text-[10px] text-text-secondary mt-0.5">
                    <User className="w-3 h-3 shrink-0" />
                    <span className="truncate">{m.artistName}</span>
                  </div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0" />
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
