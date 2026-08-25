'use client';

import React, { useState, useEffect } from 'react';
import { 
  Play, 
  Square, 
  Clock, 
  History, 
  Trash2, 
  Save, 
  Timer as TimerIcon,
  Loader2 
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { WorkSession } from '@/types';
import { customAlert, customConfirm } from '@/lib/dialog';

interface PersonalProjectTimeTabProps {
  projectId: string;
  workSessions: WorkSession[];
  onUpdateSessions: (sessions: WorkSession[]) => Promise<any>;
}

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function formatDurationText(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function PersonalProjectTimeTab({
  projectId,
  workSessions,
  onUpdateSessions,
}: PersonalProjectTimeTabProps) {
  const [sessions, setSessions] = useState<WorkSession[]>(workSessions || []);
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [sessionDesc, setSessionDesc] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setSessions(workSessions || []);
  }, [workSessions]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning) {
      interval = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning]);

  const toggleTimer = () => {
    if (isRunning) {
      setIsRunning(false);
      setShowSaveDialog(true);
    } else {
      setIsRunning(true);
    }
  };

  const handleSaveSession = async () => {
    if (elapsedSeconds < 10) {
      const confirmSave = await customConfirm('La sesión duró menos de 10 segundos. ¿Deseas guardarla igualmente?');
      if (!confirmSave) {
        resetTimer();
        return;
      }
    }

    const newSession: WorkSession = {
      id: Math.random().toString(36).substring(2, 9),
      date: new Date().toISOString(),
      duration: formatDurationText(elapsedSeconds),
      description: sessionDesc.trim() || 'Sesión de producción',
    };

    const updated = [newSession, ...sessions];
    setSessions(updated);
    setIsSaving(true);

    try {
      await onUpdateSessions(updated);
      customAlert('¡Sesión de trabajo guardada!');
    } catch (err: any) {
      console.error(err);
      customAlert('Error al guardar la sesión de trabajo.');
    } finally {
      setIsSaving(false);
      resetTimer();
    }
  };

  const resetTimer = () => {
    setIsRunning(false);
    setElapsedSeconds(0);
    setShowSaveDialog(false);
    setSessionDesc('');
  };

  const handleDeleteSession = async (id: string) => {
    const confirmed = await customConfirm('¿Eliminar este registro de sesión?');
    if (!confirmed) return;

    const updated = sessions.filter(s => s.id !== id);
    setSessions(updated);
    try {
      await onUpdateSessions(updated);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Stopwatch Widget */}
      <div className="glass p-6 sm:p-8 rounded-2xl border border-border/80 shadow-md text-center flex flex-col items-center justify-center space-y-4">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent">
          <TimerIcon className="w-4 h-4" />
          <span>Contador de Tiempo en Directo</span>
        </div>

        <div className="text-4xl sm:text-6xl font-mono font-bold text-text-primary tracking-tight">
          {formatTime(elapsedSeconds)}
        </div>

        {!showSaveDialog ? (
          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={toggleTimer}
              className={isRunning 
                ? "bg-amber-500 hover:bg-amber-600 text-black font-bold px-6 shadow-lg shadow-amber-500/20" 
                : "bg-accent hover:bg-accent-light text-white font-bold px-6 shadow-lg shadow-accent/20"
              }
            >
              {isRunning ? (
                <>
                  <Square className="w-4 h-4 mr-2 fill-current" />
                  Pausar / Finalizar Sesión
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2 fill-current ml-0.5" />
                  {elapsedSeconds > 0 ? 'Reanudar Contador' : 'Iniciar Sesión'}
                </>
              )}
            </Button>

            {elapsedSeconds > 0 && !isRunning && (
              <Button variant="outline" onClick={resetTimer}>
                Descartar
              </Button>
            )}
          </div>
        ) : (
          <div className="w-full max-w-md space-y-3 pt-2 animate-in fade-in zoom-in-95">
            <p className="text-xs text-text-secondary">
              Tiempo registrado: <strong className="text-text-primary font-mono">{formatDurationText(elapsedSeconds)}</strong>
            </p>
            <Input
              value={sessionDesc}
              onChange={(e) => setSessionDesc(e.target.value)}
              placeholder="¿En qué has estado trabajando? (ej: 'Arreglos de batería')..."
              autoFocus
              className="w-full text-center"
            />
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" onClick={resetTimer} disabled={isSaving}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handleSaveSession} disabled={isSaving} className="bg-accent text-white">
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                Guardar Registro
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Sessions History */}
      <div className="glass p-6 rounded-2xl border border-border/80 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-accent" />
            <h3 className="font-bold text-sm text-text-primary">Historial de Sesiones</h3>
          </div>
          <span className="text-xs text-text-secondary">
            {sessions.length} sesión{sessions.length !== 1 ? 'es' : ''} registrada{sessions.length !== 1 ? 's' : ''}
          </span>
        </div>

        {sessions.length === 0 ? (
          <p className="text-xs text-text-secondary text-center py-6">
            Aún no has registrado ninguna sesión de trabajo en este beat/proyecto.
          </p>
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between gap-4 p-3 rounded-xl bg-surface-elevated/40 border border-border/50 hover:border-border transition-colors text-xs"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-text-primary truncate">
                    {session.description}
                  </p>
                  <p className="text-[11px] text-text-secondary mt-0.5">
                    {new Date(session.date).toLocaleString('es', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-mono font-bold text-accent bg-accent/10 px-2.5 py-1 rounded-lg border border-accent/20">
                    {session.duration}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteSession(session.id)}
                    className="p-1 rounded-lg text-text-secondary hover:text-danger hover:bg-surface transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
