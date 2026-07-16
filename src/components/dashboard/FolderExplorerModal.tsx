'use client';

import { useState, useEffect } from 'react';
import { X, FolderOpen } from 'lucide-react';
import { DriveExplorer } from '@/components/artists/DriveExplorer';
import { createPortal } from 'react-dom';

interface FolderExplorerModalProps {
  isOpen: boolean;
  onClose: () => void;
  folderId: string | null;
  folderName?: string;
}

export function FolderExplorerModal({ isOpen, onClose, folderId, folderName = 'Carpeta' }: FolderExplorerModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !folderId || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal shell — full height flex column, no outer overflow */}
      <div className="relative w-full max-w-6xl h-[88vh] bg-surface border border-border shadow-2xl rounded-2xl flex flex-col animate-in zoom-in-95 duration-200 gpu-layer">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border bg-surface flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-text-primary tracking-tight">Explorador</h2>
              <p className="text-xs text-text-secondary font-medium mt-0.5">Viendo ubicación del archivo</p>
            </div>
          </div>
          
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-elevated text-text-secondary hover:text-text-primary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content — flex-1 so it fills the remaining height; overflow-y-auto is handled inside DriveExplorer panels */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar smooth-scroll-container p-6">
          <DriveExplorer 
            rootFolderId={folderId} 
            rootName={folderName} 
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
