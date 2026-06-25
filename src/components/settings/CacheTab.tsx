'use client';

import { useState } from 'react';
import { HardDrive, Trash2, CheckCircle2 } from 'lucide-react';

export function CacheTab() {
  const [cleared, setCleared] = useState(false);

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

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h2 className="text-xl font-semibold text-text-primary mb-2 flex items-center gap-2">
          <HardDrive className="w-5 h-5 text-accent" />
          Almacenamiento Local (Caché)
        </h2>
        <p className="text-text-secondary text-sm mb-6">
          Ezy Dashboard guarda datos temporales en tu navegador para que la navegación sea instantánea. Si notas que alguna información no se ha actualizado (por ejemplo, después de crear un proyecto), limpiar la caché forzará al sistema a descargar los datos reales desde Google Drive.
        </p>

        <div className="glass p-6 rounded-2xl border border-border flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="font-medium text-text-primary mb-1">Limpiar memoria temporal</h3>
            <p className="text-sm text-text-secondary">
              Se eliminarán las copias locales de lanzamientos y vistas previas. No perderás ningún archivo, ni se cerrará tu sesión, y no afectará al almacenamiento de Google Drive.
            </p>
          </div>
          
          <button
            onClick={handleClearCache}
            disabled={cleared}
            className={`shrink-0 px-6 py-2.5 rounded-xl font-medium transition-all flex items-center gap-2 ${
              cleared 
                ? 'bg-success/20 text-success border border-success/30' 
                : 'bg-surface hover:bg-surface-elevated text-text-primary border border-border hover:border-accent/50'
            }`}
          >
            {cleared ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Caché Limpiada
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 text-text-secondary" />
                Limpiar Caché
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
