'use client';

import React, { useEffect, useState } from 'react';
import { RefreshCw, RotateCcw, CheckCircle2, AlertCircle, Loader2, Music } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PersonalProject } from '@/types';

export interface PendingAudioReplacement {
  project: PersonalProject;
  file: File;
  secondsLeft: number;
  status: 'counting' | 'uploading' | 'done' | 'error';
  error?: string;
}

interface ReplaceAudioUndoToastProps {
  pending: PendingAudioReplacement | null;
  onCancel: () => void;
  onProceedNow?: () => void;
}

export function ReplaceAudioUndoToast({
  pending,
  onCancel,
  onProceedNow,
}: ReplaceAudioUndoToastProps) {
  if (!pending) return null;

  const totalDuration = 5;
  const progressPercent = Math.max(0, Math.min(100, (pending.secondsLeft / totalDuration) * 100));

  return (
    <div className="fixed bottom-24 sm:bottom-20 left-1/2 -translate-x-1/2 z-50 w-[92vw] max-w-lg animate-in fade-in slide-in-from-bottom-5 duration-200">
      <div className={cn(
        "relative overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-xl transition-all duration-300 p-4",
        pending.status === 'counting' && "bg-surface-elevated/95 border-accent/40 shadow-[0_10px_35px_rgba(108,92,231,0.25)]",
        pending.status === 'uploading' && "bg-surface-elevated/95 border-accent/60 shadow-[0_10px_35px_rgba(108,92,231,0.3)]",
        pending.status === 'done' && "bg-emerald-950/90 border-emerald-500/40 shadow-[0_10px_35px_rgba(16,185,129,0.2)]",
        pending.status === 'error' && "bg-red-950/90 border-red-500/40 shadow-[0_10px_35px_rgba(239,68,68,0.2)]"
      )}>
        {/* Animated countdown progress line */}
        {pending.status === 'counting' && (
          <div 
            className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-accent via-violet-400 to-cyan-400 transition-all duration-100 ease-linear"
            style={{ width: `${progressPercent}%` }}
          />
        )}

        <div className="flex items-center justify-between gap-3">
          {/* Icon & Details */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border",
              pending.status === 'counting' && "bg-accent/15 border-accent/30 text-accent",
              pending.status === 'uploading' && "bg-accent/20 border-accent/40 text-accent",
              pending.status === 'done' && "bg-emerald-500/20 border-emerald-500/30 text-emerald-400",
              pending.status === 'error' && "bg-red-500/20 border-red-500/30 text-red-400"
            )}>
              {pending.status === 'counting' && <RefreshCw className="w-5 h-5 animate-spin duration-3000" />}
              {pending.status === 'uploading' && <Loader2 className="w-5 h-5 animate-spin" />}
              {pending.status === 'done' && <CheckCircle2 className="w-5 h-5" />}
              {pending.status === 'error' && <AlertCircle className="w-5 h-5" />}
            </div>

            <div className="min-w-0 flex-1">
              {pending.status === 'counting' && (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-text-primary">
                      Sustituyendo audio en <span className="font-mono text-accent">{pending.secondsLeft}s</span>
                    </span>
                  </div>
                  <p className="text-[11px] text-text-secondary truncate mt-0.5" title={`"${pending.project.title}" ← ${pending.file.name}`}>
                    <span className="text-text-primary font-medium">{pending.project.title}</span> ← <span className="italic text-accent/90">{pending.file.name}</span>
                  </p>
                </>
              )}

              {pending.status === 'uploading' && (
                <>
                  <div className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                    <span>Sustituyendo audio en Google Drive...</span>
                  </div>
                  <p className="text-[11px] text-text-secondary truncate mt-0.5">
                    Eliminando versión anterior y subiendo nuevo master sin dejar rastro
                  </p>
                </>
              )}

              {pending.status === 'done' && (
                <>
                  <div className="text-xs font-bold text-emerald-400">
                    Audio sustituido con éxito
                  </div>
                  <p className="text-[11px] text-emerald-300/80 truncate mt-0.5">
                    El proyecto ahora reproduce el nuevo archivo exportado
                  </p>
                </>
              )}

              {pending.status === 'error' && (
                <>
                  <div className="text-xs font-bold text-red-400">
                    Error al sustituir audio
                  </div>
                  <p className="text-[11px] text-red-300/80 truncate mt-0.5">
                    {pending.error || 'Ocurrió un error en el servidor'}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Action buttons */}
          {pending.status === 'counting' && (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onCancel}
                className="px-3 py-1.5 rounded-xl bg-surface hover:bg-surface-elevated border border-border text-text-primary hover:text-danger text-xs font-semibold flex items-center gap-1.5 transition-all duration-150 shadow-sm cursor-pointer"
                title="Deshacer sustitución de audio (Ctrl+Z)"
              >
                <RotateCcw className="w-3.5 h-3.5 text-danger" />
                <span>Deshacer</span>
                <kbd className="hidden sm:inline-block px-1.5 py-0.2 text-[10px] font-mono bg-surface-elevated border border-border/80 rounded text-text-secondary">
                  Ctrl+Z
                </kbd>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
