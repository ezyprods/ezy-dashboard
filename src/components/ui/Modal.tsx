'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './Button';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function Modal({ isOpen, onClose, title, description, children, className }: ModalProps) {
  const sheetRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<{ startY: number; startT: number; dy: number } | null>(null);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Phone bottom sheet: drag the handle / header down to dismiss it (like native iOS sheets)
  const onDragStart = (e: React.TouchEvent) => {
    if (window.innerWidth >= 768 || e.touches.length !== 1) return;
    dragRef.current = { startY: e.touches[0].clientY, startT: Date.now(), dy: 0 };
  };
  const onDragMove = (e: React.TouchEvent) => {
    const drag = dragRef.current;
    const sheet = sheetRef.current;
    if (!drag || !sheet) return;
    drag.dy = Math.max(0, e.touches[0].clientY - drag.startY);
    sheet.style.transition = 'none';
    sheet.style.transform = `translateY(${drag.dy}px)`;
  };
  const onDragEnd = () => {
    const drag = dragRef.current;
    const sheet = sheetRef.current;
    dragRef.current = null;
    if (!drag || !sheet) return;
    const velocity = drag.dy / Math.max(1, Date.now() - drag.startT);
    sheet.style.transition = 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)';
    if (drag.dy > 120 || (drag.dy > 40 && velocity > 0.6)) {
      sheet.style.transform = 'translateY(100%)';
      setTimeout(onClose, 200);
    } else {
      sheet.style.transform = '';
    }
  };

  if (!isOpen || typeof document === 'undefined') return null;

  // Portal to <body>: an ancestor with transform / backdrop-filter / overflow would otherwise
  // trap this `fixed` overlay inside a card instead of covering the screen.
  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-end md:justify-center p-0 md:p-4" role="dialog" aria-modal="true" aria-label={title}>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 animate-fade-in touch-none"
        style={{ willChange: 'opacity' }}
        onClick={onClose}
      />

      {/* Content */}
      <div
        ref={sheetRef}
        className={cn(
          "relative z-10 w-full md:max-w-lg bg-surface-elevated rounded-t-[28px] md:rounded-2xl shadow-[0_-20px_60px_-15px_rgba(0,0,0,0.3)] md:shadow-2xl animate-slide-up md:animate-scale-in border-t md:border border-border max-h-[calc(100dvh-env(safe-area-inset-top,0px)-0.75rem)] md:max-h-[90dvh] flex flex-col pb-[env(safe-area-inset-bottom)] md:pb-0",
          className
        )}
      >
        <div
          className="shrink-0 touch-none md:touch-auto"
          onTouchStart={onDragStart}
          onTouchMove={onDragMove}
          onTouchEnd={onDragEnd}
          onTouchCancel={onDragEnd}
        >
          <div className="w-10 h-1.5 bg-border rounded-full mx-auto mt-2.5 mb-1 md:hidden" />
          <div className="flex items-center justify-between gap-3 px-5 md:px-6 py-4 md:py-5 border-b border-border/50">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-text-primary truncate">{title}</h2>
              {description && (
                <p className="text-sm text-text-secondary mt-1">{description}</p>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0 -mr-2 min-h-[44px] min-w-[44px]" aria-label="Cerrar">
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        <div className="p-5 md:p-6 overflow-y-auto overscroll-contain min-h-0">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
