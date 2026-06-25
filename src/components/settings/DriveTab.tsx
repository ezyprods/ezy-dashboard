'use client';

import { useEffect, useState } from 'react';
import { Database, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';

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
    }
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
      <div>
        <h2 className="text-xl font-semibold text-text-primary mb-2 flex items-center gap-2">
          <Database className="w-5 h-5 text-accent" />
          Google Drive
        </h2>
        <p className="text-text-secondary text-sm mb-6">
          Gestiona el estado de tu conexión con Google Drive y revisa el almacenamiento disponible para tus proyectos.
        </p>

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

              <div className="h-3 bg-surface-elevated rounded-full overflow-hidden">
                <div 
                  className={`h-full ${progressColor} transition-all duration-1000 ease-out`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <div className="text-xs text-text-secondary text-right">
                {percentage}% utilizado
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
