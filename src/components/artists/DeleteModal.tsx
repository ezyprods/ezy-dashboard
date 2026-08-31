'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { Loader2, Trash2, Clock, X, AlertTriangle, CalendarDays, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { customAlert } from '@/lib/dialog';

interface DeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileId: string;
  fileName: string;
  fileIds?: string[];
  onDeleted: (deletedIds?: string[]) => void;
  onExpirationChanged?: (fileId: string, newExpiration: number | null) => void;
  currentExpiration?: number | null;
}

export function DeleteModal({
  isOpen,
  onClose,
  fileId,
  fileName,
  fileIds,
  onDeleted,
  onExpirationChanged,
  currentExpiration,
}: DeleteModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<boolean>(!!currentExpiration);
  const [customMode, setCustomMode] = useState(false);
  const deleteBtnRef = useRef<HTMLButtonElement>(null);
  
  const targetIds = fileIds && fileIds.length > 0 ? fileIds : [fileId];

  // Presets de caducidad
  const expirationOptions = [
    { label: 'En 1 hora', ms: 60 * 60 * 1000 },
    { label: 'En 6 horas', ms: 6 * 60 * 60 * 1000 },
    { label: 'En 24 horas', ms: 24 * 60 * 60 * 1000 },
    { label: 'En 3 días', ms: 3 * 24 * 60 * 60 * 1000 },
    { label: 'En 7 días', ms: 7 * 24 * 60 * 60 * 1000 },
    { label: 'En 30 días', ms: 30 * 24 * 60 * 60 * 1000 },
  ];
  
  const [selectedExpirationMs, setSelectedExpirationMs] = useState<number>(expirationOptions[2].ms); // default 24h
  
  // Custom date/time picker (min: now + 5 min)
  const defaultCustomDate = useMemo(() => {
    const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }, []);
  const [customDateTime, setCustomDateTime] = useState<string>(defaultCustomDate);

  const calculatedExpirationTimestamp = customMode
    ? new Date(customDateTime).getTime()
    : Date.now() + selectedExpirationMs;

  const formattedCalculatedDate = new Date(calculatedExpirationTimestamp).toLocaleString('es-ES', {
    dateStyle: 'full',
    timeStyle: 'short',
  });

  // Auto-focus on open
  useEffect(() => {
    if (isOpen && !scheduleMode) {
      setTimeout(() => {
        deleteBtnRef.current?.focus();
      }, 50);
    }
  }, [isOpen, scheduleMode]);

  // Teclado: Enter para eliminar inmediatamente, Escape para cerrar
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Enter') {
        // Si el usuario está escribiendo en el selector de fecha, no interferir salvo que pulse enter explícito
        e.preventDefault();
        if (!scheduleMode) {
          if (!isDeleting) {
            handleDeleteNow();
          }
        } else if (!isScheduling && !currentExpiration) {
          handleScheduleDelete();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, scheduleMode, isDeleting, isScheduling, currentExpiration, targetIds, calculatedExpirationTimestamp]);

  if (!isOpen) return null;

  const handleDeleteNow = async () => {
    setIsDeleting(true);
    try {
      for (const id of targetIds) {
        const res = await fetch(`/api/files?id=${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Error al eliminar un archivo');
      }
      onDeleted(targetIds);
      window.dispatchEvent(new CustomEvent('recentfiles:refresh'));
      onClose();
    } catch (e: any) {
      customAlert(e.message || 'Error al eliminar');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleScheduleDelete = async () => {
    if (customMode && isNaN(calculatedExpirationTimestamp)) {
      customAlert('Por favor selecciona una fecha y hora válidas.');
      return;
    }
    if (customMode && calculatedExpirationTimestamp <= Date.now() + 60000) {
      customAlert('La fecha de eliminación debe ser al menos 1 minuto en el futuro.');
      return;
    }

    setIsScheduling(true);
    try {
      for (const id of targetIds) {
        const res = await fetch(`/api/files/${id}/expiration`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expiresAt: calculatedExpirationTimestamp })
        });
        if (!res.ok) throw new Error('Error al programar eliminación');
      }
      
      customAlert(`Eliminación programada con éxito para el ${new Date(calculatedExpirationTimestamp).toLocaleString()}.`);
      
      for (const id of targetIds) {
        onExpirationChanged?.(id, calculatedExpirationTimestamp);
      }
      window.dispatchEvent(new CustomEvent('recentfiles:refresh'));
      onClose();
    } catch (e: any) {
      customAlert(e.message || 'Error al programar');
    } finally {
      setIsScheduling(false);
    }
  };

  const handleCancelSchedule = async () => {
    setIsScheduling(true);
    try {
      for (const id of targetIds) {
        const res = await fetch(`/api/files/${id}/expiration`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expiresInMs: null, expiresAt: null })
        });
        if (!res.ok) throw new Error('Error al cancelar eliminación');
        onExpirationChanged?.(id, null);
      }
      
      customAlert('Autodestrucción cancelada. El archivo no se eliminará automáticamente.');
      window.dispatchEvent(new CustomEvent('recentfiles:refresh'));
      onClose();
    } catch (e: any) {
      customAlert(e.message || 'Error al cancelar');
    } finally {
      setIsScheduling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" 
        onClick={onClose}
        style={{ willChange: 'opacity' }}
      />
      <div 
        className="relative z-10 bg-surface-elevated w-full max-w-md rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden animate-scale-in"
        style={{ willChange: 'transform, opacity' }}
      >
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border bg-surface/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-error/10 flex items-center justify-center shrink-0">
              <Trash2 className="w-5 h-5 text-error" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-text-primary">Opciones de Eliminación</h2>
              <p className="text-xs text-text-secondary truncate max-w-[240px]">{fileName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface rounded-full transition-colors">
            <X className="w-5 h-5 text-text-secondary" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          
          {/* Tabs */}
          <div className="flex p-1 bg-surface rounded-xl border border-border">
            <button
              onClick={() => setScheduleMode(false)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all ${!scheduleMode ? 'bg-surface-elevated shadow-sm text-error' : 'text-text-secondary hover:text-text-primary'}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Eliminar Ahora
            </button>
            <button
              onClick={() => setScheduleMode(true)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all ${scheduleMode ? 'bg-surface-elevated shadow-sm text-accent' : 'text-text-secondary hover:text-text-primary'}`}
            >
              <Clock className="w-3.5 h-3.5" />
              Programar Autodestrucción
            </button>
          </div>

          {/* Mode: Delete Now */}
          {!scheduleMode && (
            <div className="space-y-4 animate-fade-in">
              <div className="bg-error/10 border border-error/20 p-4 rounded-xl flex gap-3 text-error">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-semibold">¿Eliminar inmediatamente?</p>
                  <p className="text-error/80">Esta acción moverá el archivo a la papelera de Google Drive.</p>
                </div>
              </div>
              <Button 
                ref={deleteBtnRef}
                onClick={handleDeleteNow} 
                className="w-full bg-error hover:bg-error/90 text-white gap-2 h-11" 
                disabled={isDeleting}
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Eliminar Inmediatamente
              </Button>
            </div>
          )}

          {/* Mode: Schedule */}
          {scheduleMode && (
            <div className="space-y-4 animate-fade-in">
              {currentExpiration ? (
                <div className="bg-accent/10 border border-accent/20 p-4 rounded-xl space-y-3">
                  <div className="flex gap-2.5 text-accent">
                    <Clock className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-bold">Autodestrucción activa</p>
                      <p className="text-[11px] text-text-secondary mt-0.5">
                        Este archivo se eliminará de forma automática el:
                      </p>
                      <p className="text-xs font-semibold text-accent mt-1 bg-accent/10 py-1 px-2 rounded-lg border border-accent/20">
                        📅 {new Date(currentExpiration).toLocaleString('es-ES', { dateStyle: 'full', timeStyle: 'short' })}
                      </p>
                    </div>
                  </div>
                  <div className="pt-2 flex flex-col gap-2">
                    <Button 
                      variant="outline" 
                      className="w-full gap-2 border-accent/30 hover:bg-accent/10 text-accent text-xs h-9"
                      onClick={handleCancelSchedule}
                      disabled={isScheduling}
                    >
                      {isScheduling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                      Cancelar Autodestrucción
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-text-primary flex items-center gap-1.5 uppercase tracking-wider">
                        <CalendarDays className="w-3.5 h-3.5 text-accent" />
                        Tiempo de caducidad
                      </p>
                      <button
                        type="button"
                        onClick={() => setCustomMode(!customMode)}
                        className="text-[11px] font-semibold text-accent hover:underline"
                      >
                        {customMode ? '← Usar presets' : 'Personalizar fecha →'}
                      </button>
                    </div>

                    {!customMode ? (
                      <div className="grid grid-cols-3 gap-2">
                        {expirationOptions.map(opt => (
                          <button
                            key={opt.label}
                            type="button"
                            onClick={() => setSelectedExpirationMs(opt.ms)}
                            className={`p-2.5 text-xs font-semibold rounded-xl border text-center transition-all ${selectedExpirationMs === opt.ms ? 'border-accent bg-accent/15 text-accent shadow-sm' : 'border-border bg-surface hover:border-accent/40 text-text-secondary'}`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-2 bg-surface p-3 rounded-xl border border-border">
                        <label className="text-[11px] font-medium text-text-secondary block">Selecciona fecha y hora exacta de eliminación:</label>
                        <input
                          type="datetime-local"
                          value={customDateTime}
                          onChange={(e) => setCustomDateTime(e.target.value)}
                          className="w-full bg-surface-elevated border border-border/80 rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-accent"
                        />
                      </div>
                    )}

                    {/* Expiration date preview */}
                    <div className="bg-surface p-2.5 rounded-lg border border-border/60 text-[11px] flex items-center gap-2 text-text-secondary">
                      <Clock className="w-3.5 h-3.5 text-accent shrink-0" />
                      <span className="truncate">
                        Se borrará: <strong className="text-text-primary font-medium">{formattedCalculatedDate}</strong>
                      </span>
                    </div>
                  </div>

                  <Button 
                    onClick={handleScheduleDelete} 
                    className="w-full gap-2 h-11 bg-accent hover:bg-accent/90 text-white shadow-lg shadow-accent/20" 
                    disabled={isScheduling}
                  >
                    {isScheduling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
                    Activar Autodestrucción
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
