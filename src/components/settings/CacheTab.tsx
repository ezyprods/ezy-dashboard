'use client';

import { useEffect, useState } from 'react';
import { HardDrive, Trash2, CheckCircle2, Download, PackageOpen } from 'lucide-react';

export function CacheTab() {
  const [cleared, setCleared] = useState(false);
  const [cacheSize, setCacheSize] = useState('0 B');

  useEffect(() => {
    calculateSize();
  }, [cleared]);

  const calculateSize = () => {
    let total = 0;
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && (key.startsWith('release_cache_') || key.startsWith('ezy_'))) {
        total += (sessionStorage.getItem(key)?.length || 0) * 2; // approx 2 bytes per char
      }
    }
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('ezy_')) {
        total += (localStorage.getItem(key)?.length || 0) * 2;
      }
    }
    if (total === 0) setCacheSize('0 B');
    else if (total < 1024) setCacheSize(total + ' B');
    else if (total < 1024 * 1024) setCacheSize((total / 1024).toFixed(2) + ' KB');
    else setCacheSize((total / (1024 * 1024)).toFixed(2) + ' MB');
  };

  const handleClearCache = () => {
    try {
      // Clear all release caches stored in sessionStorage (the ones used to avoid Drive delays)
      Object.keys(sessionStorage).forEach(key => {
        if (key.startsWith('release_cache_') || key.startsWith('ezy_')) {
          sessionStorage.removeItem(key);
        }
      });
      setCleared(true);
      setTimeout(() => setCleared(false), 3000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleBackup = () => {
    const data: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('ezy_')) {
        data[key] = localStorage.getItem(key) || '';
      }
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ezy-dashboard-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h2 className="text-xl font-semibold text-text-primary mb-2 flex items-center gap-2">
          <HardDrive className="w-5 h-5 text-accent" />
          Datos y Caché
        </h2>
        <p className="text-text-secondary text-sm mb-6">
          Gestiona el almacenamiento local de la aplicación y crea copias de seguridad de tus preferencias.
        </p>

        <div className="space-y-4">
          <div className="glass p-6 rounded-2xl border border-border flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 blur-3xl rounded-full -mr-10 -mt-10 pointer-events-none" />
            <div className="relative z-10">
              <h3 className="font-medium text-text-primary mb-1 flex items-center gap-2">
                <PackageOpen className="w-4 h-4 text-accent" />
                Limpiar memoria temporal
              </h3>
              <p className="text-sm text-text-secondary">
                Forzará al sistema a descargar los datos reales desde Google Drive. No perderás archivos ni configuraciones.
              </p>
              <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface border border-border/50 text-xs font-medium text-text-secondary">
                <span className="w-2 h-2 rounded-full bg-accent animate-pulse" /> Uso actual estimado: {cacheSize}
              </div>
            </div>
            
            <button
              onClick={handleClearCache}
              disabled={cleared}
              className={`relative z-10 shrink-0 px-6 py-2.5 rounded-xl font-medium transition-all flex items-center gap-2 ${
                cleared 
                  ? 'bg-success/20 text-success border border-success/30' 
                  : 'bg-surface hover:bg-surface-elevated text-text-primary border border-border hover:border-accent/50 hover:text-accent shadow-sm'
              }`}
            >
              {cleared ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Caché Limpiada
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  Limpiar Caché
                </>
              )}
            </button>
          </div>

          <div className="glass p-6 rounded-2xl border border-border flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h3 className="font-medium text-text-primary mb-1">Copia de Seguridad Local</h3>
              <p className="text-sm text-text-secondary">
                Descarga un archivo con tus preferencias (estudio, notificaciones, apariencia) guardadas en este navegador.
              </p>
            </div>
            
            <button
              onClick={handleBackup}
              className="shrink-0 px-6 py-2.5 rounded-xl font-medium transition-all flex items-center gap-2 bg-surface hover:bg-accent hover:text-white text-text-primary border border-border shadow-sm group"
            >
              <Download className="w-4 h-4 text-text-secondary group-hover:text-white transition-colors" />
              Exportar JSON
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
