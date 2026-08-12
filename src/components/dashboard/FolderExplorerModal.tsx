'use client';

import React from 'react';
import { FileLocationModal } from './FileLocationModal';

interface FolderExplorerModalProps {
  isOpen: boolean;
  onClose: () => void;
  folderId: string | null;
  folderName?: string;
  highlightFileId?: string;
  highlightFileName?: string;
}

class ModalErrorBoundary extends React.Component<
  { onClose: () => void; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('FolderExplorerModal error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/75">
          <div className="bg-surface border border-border p-6 rounded-2xl max-w-md w-full text-center space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-text-primary">No se pudo abrir la ubicación</h3>
            <p className="text-xs text-text-secondary">Ocurrió un problema temporal al cargar los archivos.</p>
            <button
              onClick={() => {
                this.setState({ hasError: false });
                this.props.onClose();
              }}
              className="px-4 py-2 bg-accent text-white text-xs font-bold rounded-xl hover:bg-accent/90 transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function FolderExplorerModal(props: FolderExplorerModalProps) {
  if (!props.isOpen || !props.folderId) return null;

  return (
    <ModalErrorBoundary onClose={props.onClose}>
      <FileLocationModal {...props} />
    </ModalErrorBoundary>
  );
}

export default FolderExplorerModal;
