'use client';

import React from 'react';
import { X, AlertTriangle, RefreshCw } from 'lucide-react';

interface DAWErrorBoundaryProps {
  children: React.ReactNode;
  onClose: () => void;
}

interface DAWErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Specialized ErrorBoundary for the Mini-DAW modal.
 * Catches any render-phase errors (e.g. AudioContext issues, Canvas failures)
 * and shows a friendly fallback with a close button that properly cleans up.
 */
export class DAWErrorBoundary extends React.Component<
  DAWErrorBoundaryProps,
  DAWErrorBoundaryState
> {
  constructor(props: DAWErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): DAWErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[DAWErrorBoundary] Caught error:', error, info);
  }

  handleClose = () => {
    this.setState({ hasError: false, error: null });
    this.props.onClose();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/90 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-surface-elevated border border-error/30 rounded-2xl p-8 shadow-2xl text-center">
            {/* Close button */}
            <button
              onClick={this.handleClose}
              className="absolute top-4 right-4 p-2 text-text-secondary hover:text-text-primary rounded-lg hover:bg-surface transition-colors"
              aria-label="Cerrar editor"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Error icon */}
            <div className="w-14 h-14 rounded-full bg-error/10 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-7 h-7 text-error" />
            </div>

            <h3 className="text-lg font-bold text-text-primary mb-2">
              Error en el editor de audio
            </h3>

            <p className="text-sm text-text-secondary mb-1">
              El Mini-DAW encontró un error inesperado:
            </p>
            <p className="text-xs font-mono bg-surface border border-border rounded-lg px-3 py-2 text-error/90 break-all mb-6">
              {this.state.error?.message ?? 'Error desconocido'}
            </p>

            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:border-accent/40 transition-colors text-sm"
              >
                <RefreshCw className="w-4 h-4" />
                Reintentar
              </button>
              <button
                onClick={this.handleClose}
                className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
              >
                Cerrar editor
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
