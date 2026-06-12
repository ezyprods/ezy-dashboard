'use client';

import { useState } from 'react';
import { Loader2, Trash2, Clock, X, AlertTriangle, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { customAlert } from '@/lib/dialog';

interface DeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileId: string;
  fileName: string;
  onDeleted: () => void;
  currentExpiration?: number | null;
}

export function DeleteModal({ isOpen, onClose, fileId, fileName, onDeleted, currentExpiration }: DeleteModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<boolean>(!!currentExpiration);
  
  // Opciones de caducidad
  const expirationOptions = [
    { label: 'En 1 hora', ms: 60 * 60 * 1000 },
    { label: 'En 24 horas', ms: 24 * 60 * 60 * 1000 },
    { label: 'En 7 días', ms: 7 * 24 * 60 * 60 * 1000 },
    { label: 'En 30 días', ms: 30 * 24 * 60 * 60 * 1000 },
  ];
  const [selectedExpirationMs, setSelectedExpirationMs] = useState<number>(expirationOptions[1].ms);

  if (!isOpen) return null;

  const handleDeleteNow = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/files?id=${fileId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al eliminar');
      onDeleted();
      onClose();
    } catch (e: any) {
      customAlert(e.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleScheduleDelete = async () => {
    setIsScheduling(true);
    try {
      const res = await fetch(`/api/files/${fileId}/expiration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresInMs: selectedExpirationMs })
      });
      if (!res.ok) throw new Error('Error al programar eliminación');
      
      customAlert(`Eliminación programada con éxito.`);
      onDeleted(); // To trigger a refresh
      onClose();
    } catch (e: any) {
      customAlert(e.message);
    } finally {
      setIsScheduling(false);
    }
  };

  const handleCancelSchedule = async () => {
    setIsScheduling(true);
    try {
      const res = await fetch(`/api/files/${fileId}/expiration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresInMs: null })
      });
      if (!res.ok) throw new Error('Error al cancelar eliminación');
      
      onDeleted();
      onClose();
    } catch (e: any) {
      customAlert(e.message);
    } finally {
      setIsScheduling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-surface-elevated w-full max-w-md rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border bg-surface/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-error/10 flex items-center justify-center">
              <Trash2 className="w-5 h-5 text-error" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Opciones de Eliminación</h2>
              <p className="text-xs text-text-secondary truncate max-w-[200px]">{fileName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface rounded-full transition-colors">
            <X className="w-5 h-5 text-text-secondary" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-6">
          
          {/* Tabs */}
          <div className="flex p-1 bg-surface rounded-xl border border-border">
            <button
              onClick={() => setScheduleMode(false)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-all ${!scheduleMode ? 'bg-surface-elevated shadow-sm text-error' : 'text-text-secondary hover:text-text-primary'}`}
            >
              <Trash2 className="w-4 h-4" />
              Eliminar Ahora
            </button>
            <button
              onClick={() => setScheduleMode(true)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-all ${scheduleMode ? 'bg-surface-elevated shadow-sm text-accent' : 'text-text-secondary hover:text-text-primary'}`}
            >
              <Clock className="w-4 h-4" />
              Programar
            </button>
          </div>

          {/* Mode: Delete Now */}
          {!scheduleMode && (
            <div className="space-y-4 animate-fade-in">
              <div className="bg-error/10 border border-error/20 p-4 rounded-xl flex gap-3 text-error">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <p className="text-sm">¿Estás seguro de que deseas eliminar este archivo? Esta acción lo moverá a la papelera.</p>
              </div>
              <Button 
                onClick={handleDeleteNow} 
                className="w-full bg-error hover:bg-error/90 text-white gap-2" 
                size="lg"
                disabled={isDeleting}
              >
                {isDeleting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                Eliminar Inmediatamente
              </Button>
            </div>
          )}

          {/* Mode: Schedule */}
          {scheduleMode && (
            <div className="space-y-4 animate-fade-in">
              {currentExpiration ? (
                <div className="bg-accent/10 border border-accent/20 p-4 rounded-xl space-y-3">
                  <div className="flex gap-3 text-accent">
                    <Clock className="w-5 h-5 shrink-0" />
                    <p className="text-sm font-medium">Este archivo ya está programado para eliminarse automáticamente.</p>
                  </div>
                  <div className="text-xs text-text-secondary pl-8">
                    Caducará el: {new Date(currentExpiration).toLocaleString()}
                  </div>
                  <Button 
                    variant="outline" 
                    className="w-full mt-2 gap-2 border-accent/30 hover:bg-accent/10 text-accent"
                    onClick={handleCancelSchedule}
                    disabled={isScheduling}
                  >
                    {isScheduling ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                    Cancelar Autodestrucción
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-text-primary flex items-center gap-2">
                      <CalendarDays className="w-4 h-4 text-accent" />
                      ¿Cuándo debe eliminarse?
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {expirationOptions.map(opt => (
                        <button
                          key={opt.label}
                          onClick={() => setSelectedExpirationMs(opt.ms)}
                          className={`p-3 text-sm rounded-xl border text-left transition-all ${selectedExpirationMs === opt.ms ? 'border-accent bg-accent/10 text-accent' : 'border-border bg-surface hover:border-accent/50 text-text-secondary'}`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Button 
                    onClick={handleScheduleDelete} 
                    className="w-full gap-2" 
                    size="lg"
                    disabled={isScheduling}
                  >
                    {isScheduling ? <Loader2 className="w-5 h-5 animate-spin" /> : <Clock className="w-5 h-5" />}
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
