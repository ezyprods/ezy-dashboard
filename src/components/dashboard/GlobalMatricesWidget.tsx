'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, Table2, ChevronRight, User } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useSmoothScroll } from '@/hooks/useSmoothScroll';

export function GlobalMatricesWidget({ matrices, isLoading }: { matrices: any[], isLoading: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useSmoothScroll(scrollRef, [isLoading]);

  if (isLoading) {
    return (
      <div className="relative bg-surface/80 backdrop-blur-xl rounded-[24px] border border-border/60 overflow-hidden h-full animate-pulse flex flex-col">
        <div className="p-4 border-b border-border/50 bg-gradient-to-b from-surface-elevated/50 to-surface/50 flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-accent/10">
            <Table2 className="w-4 h-4 text-accent" />
          </div>
          <h3 className="font-bold text-sm text-text-primary">Matrices Activas</h3>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-accent" />
          <p className="text-xs text-text-secondary mt-2">Cargando matrices...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full flex flex-col min-h-0 w-full">
      <div className="absolute -inset-0.5 bg-gradient-to-b from-accent/20 to-transparent rounded-[24px] blur opacity-40 pointer-events-none" />
      <div className="relative bg-surface/80 backdrop-blur-xl border border-border/60 rounded-[24px] overflow-hidden h-full flex flex-col group hover:border-accent/30 transition-colors min-h-0">
        <div className="p-4 border-b border-border/50 bg-gradient-to-b from-surface-elevated/50 to-surface/50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-accent/10 text-accent shadow-inner">
              <Table2 className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-sm text-text-primary tracking-tight">Matrices Activas</h3>
          </div>
          <span className="text-[10px] bg-accent/10 text-accent px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
            {matrices.length}
          </span>
        </div>
        
        <div ref={scrollRef} className="p-2 flex-1 min-h-0 overflow-y-auto space-y-0.5 custom-scrollbar" style={{ willChange: 'scroll-position' }}>
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
                className="flex items-center justify-between px-3 py-1.5 rounded-lg hover:bg-surface border border-transparent hover:border-border/50 transition-all group block shrink-0"
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
