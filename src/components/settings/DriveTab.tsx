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
            <div className="bg-surface border border-border rounded-3xl p-8 flex flex-col gap-6 shadow-lg relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-success/5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none transition-transform group-hover:scale-150 duration-700" />
              
              <div className="flex items-center gap-5 relative z-10">
                {status.user.photoLink ? (
                  <img src={status.user.photoLink} alt="Avatar" className="w-16 h-16 rounded-full border-2 border-surface-elevated shadow-md" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center border border-accent/20 shadow-inner">
                    <Database className="w-8 h-8 text-accent drop-shadow-sm" />
                  </div>
                )}
                <div>
                  <div className="font-bold text-text-primary text-lg flex items-center gap-2">
                    {status.user.displayName}
                    <CheckCircle2 className="w-5 h-5 text-success drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                  </div>
                  <div className="text-sm text-text-secondary font-medium">{status.user.emailAddress}</div>
                </div>
              </div>
              <div className="relative z-10">
                <div className="text-xs text-success bg-success/10 border border-success/20 px-4 py-2 rounded-full inline-flex items-center gap-2 font-semibold shadow-sm animate-pulse-slow">
                  <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                  Conectado y Sincronizado
                </div>
              </div>
            </div>

            <div className="bg-surface border border-border rounded-3xl p-8 space-y-6 shadow-lg relative overflow-hidden group">
              <div className="flex justify-between items-end relative z-10">
                <div>
                  <div className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-2">Almacenamiento Usado</div>
                  <div className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-text-primary to-text-secondary">
                    {formatBytes(status.storageQuota.usage)}
                  </div>
                </div>
                <div className="text-sm font-medium text-text-secondary pb-1">
                  de {formatBytes(status.storageQuota.limit)}
                </div>
              </div>

              <div className="relative z-10">
                <div className="h-6 bg-surface-elevated rounded-full overflow-hidden border border-black/20 shadow-inner relative p-1">
                  <div 
                    className={`h-full rounded-full transition-all duration-1000 ease-out relative overflow-hidden shadow-sm ${
                      percentage > 95 ? 'bg-gradient-to-r from-error to-red-400' : percentage > 80 ? 'bg-gradient-to-r from-warning to-yellow-400' : 'bg-gradient-to-r from-accent to-accent-light'
                    }`}
                    style={{ width: `${percentage}%` }}
                  >
                    <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.3),transparent)] w-[200%] animate-[shimmer_2s_infinite]" />
                  </div>
                </div>
              </div>
              
              <div className="flex justify-between items-center text-xs font-semibold text-text-secondary uppercase tracking-wider relative z-10">
                <span className={percentage > 80 ? (percentage > 95 ? 'text-error' : 'text-warning') : 'text-accent'}>{percentage}% utilizado</span>
                <span>{formatBytes((limitBytes - usageBytes).toString())} libres</span>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
