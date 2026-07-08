'use client';

import * as React from 'react';
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
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-end md:justify-center p-0 md:p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 animate-fade-in" 
        style={{ willChange: 'opacity' }}
        onClick={onClose}
      />
      
      {/* Content */}
      <div 
        className={cn(
          "relative z-10 w-full md:max-w-lg bg-surface-elevated rounded-t-[32px] md:rounded-2xl shadow-[0_-20px_60px_-15px_rgba(0,0,0,0.3)] md:shadow-2xl animate-slide-up md:animate-scale-in border-t md:border border-border max-h-[92vh] md:max-h-[90vh] flex flex-col pb-[env(safe-area-inset-bottom)]",
          className
        )}
        style={{ willChange: 'transform, opacity' }}
      >
        <div className="w-12 h-1.5 bg-border/80 rounded-full mx-auto mt-3 mb-1 md:hidden shrink-0" />
        <div className="flex items-center justify-between px-6 py-5 border-b border-border/50 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
            {description && (
              <p className="text-sm text-text-secondary mt-1">{description}</p>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0 -mr-2">
            <X className="w-5 h-5" />
          </Button>
        </div>
        
        <div className="p-6 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
