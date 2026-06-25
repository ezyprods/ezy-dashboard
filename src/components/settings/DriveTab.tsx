'use client';

import { useEffect, useState } from 'react';
import { Database, AlertCircle, Loader2, CheckCircle2, RefreshCw } from 'lucide-react';

interface DriveStatus {
  user: {
    displayName: string;
    emailAddress: string;
    photoLink: string;
  };
  storageQuota: {
    limit: string;
    usage: string;
    usageInDrive: string;
    usageInDriveTrash: string;
  };
}

export function DriveTab() {
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDriveStatus();
  }, []);

  const fetchDriveStatus = async () => {
    try {
      const res = await fetch('/api/settings/drive');
      const data = await res.json();
      if (data.success && data.data) {
        setStatus(data.data);
      } else {
        throw new Error(data.error || 'Error desconocido');
      }
    } catch (err: any) {
      setError(err.message || 'Error al conectar con Google Drive');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  const handleForceSync = () => {
    setSyncing(true);
    fetchDriveStatus();
  };

  const formatBytes = (bytesStr?: string) => {
    if (!bytesStr) return '0 B';
    const bytes = parseInt(bytesStr, 10);
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-48">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-2xl border border-error/30 bg-error/10 text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-error mx-auto" />
        <h3 className="text-lg font-semibold text-error">Error de Conexión</h3>
        <p className="text-text-secondary text-sm">{error}</p>
        <button onClick={fetchDriveStatus} className="text-sm px-4 py-2 bg-error text-white rounded-lg hover:bg-error/90 transition">
          Reintentar
        </button>
      </div>
    );
  }

  const limitBytes = parseInt(status?.storageQuota.limit || '1', 10);
  const usageBytes = parseInt(status?.storageQuota.usage || '0', 10);
  const percentage = Math.min(100, Math.round((usageBytes / limitBytes) * 100));
  
  // Determine color based on usage percentage
  let progressColor = 'bg-accent';
  if (percentage > 80) progressColor = 'bg-warning';
  if (percentage > 95) progressColor = 'bg-error';

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col md:flex-row items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-semibold text-text-primary mb-2 flex items-center gap-2">
            <Database className="w-5 h-5 text-accent" />
            Google Drive
          </h2>
          <p className="text-text-secondary text-sm">
            Gestiona el estado de tu conexión con Google Drive y revisa el almacenamiento disponible para tus proyectos.
          </p>
        </div>
        <button 
          onClick={handleForceSync}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 bg-surface hover:bg-surface-elevated border border-border hover:border-accent/50 rounded-xl text-sm font-medium transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin text-accent' : 'text-text-secondary'}`} />
          Sincronizar ahora
        </button>
      </div>

      {status && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="glass p-6 rounded-2xl flex flex-col gap-4">
              <div className="flex items-center gap-4">
                {status.user.photoLink ? (
                  <img src={status.user.photoLink} alt="Avatar" className="w-12 h-12 rounded-full border border-border" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center">
                    <Database className="w-6 h-6 text-accent" />
                  </div>
                )}
                <div>
                  <div className="font-semibold text-text-primary flex items-center gap-2">
                    {status.user.displayName}
                    <CheckCircle2 className="w-4 h-4 text-success" />
                  </div>
                  <div className="text-sm text-text-secondary">{status.user.emailAddress}</div>
                </div>
              </div>
              <div className="text-xs text-success bg-success/10 px-3 py-1.5 rounded-full inline-flex w-max font-medium">
                Conectado y Sincronizado
              </div>
            </div>

            <div className="glass p-6 rounded-2xl space-y-4">
              <div className="flex justify-between items-end">
                <div>
                  <div className="text-sm text-text-secondary mb-1">Almacenamiento Usado</div>
                  <div className="text-2xl font-bold text-text-primary">
                    {formatBytes(status.storageQuota.usage)}
                  </div>
                </div>
                <div className="text-sm text-text-secondary">
                  de {formatBytes(status.storageQuota.limit)}
                </div>
              </div>

              <div className="h-4 bg-surface-elevated rounded-full overflow-hidden border border-border/50 shadow-inner relative">
                <div 
                  className={`h-full transition-all duration-1000 ease-out relative overflow-hidden ${
                    percentage > 95 ? 'bg-error' : percentage > 80 ? 'bg-warning' : 'bg-gradient-to-r from-accent to-accent-light'
                  }`}
                  style={{ width: `${percentage}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 w-full animate-[shimmer_2s_infinite] -translate-x-full" style={{ backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)' }} />
                </div>
              </div>
              <div className="flex justify-between items-center text-xs text-text-secondary font-medium">
                <span>{percentage}% utilizado</span>
                <span>{formatBytes((limitBytes - usageBytes).toString())} libres</span>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
