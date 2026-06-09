'use client';

import { useState, useEffect, useCallback } from 'react';
import { Play, Square, Save, Clock, History, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { WorkSession } from '@/types';

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function TimeTrackerWidget({ projectId }: { projectId: string }) {
  const [sessions, setSessions] = useState<WorkSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [sessionDesc, setSessionDesc] = useState('');

  useEffect(() => {
    fetchSessions();
  }, [projectId]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning) {
      interval = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning]);

  const fetchSessions = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks`);
      const data = await res.json();
      setSessions(data.workSessions || []);
    } catch (err) { console.error(err); }
    finally { setIsLoading(false); }
  };

  const toggleTimer = () => {
    if (isRunning) {
      setIsRunning(false);
      setShowSaveDialog(true);
    } else {
      setIsRunning(true);
    }
  };

  const handleSaveSession = async () => {
    if (elapsedSeconds < 60 && !confirm('La sesión duró menos de 1 minuto. ¿Seguro que quieres guardarla?')) {
      resetTimer();
      return;
    }

    const newSession: WorkSession = {
      id: Math.random().toString(36).slice(2),
      date: new Date().toISOString(),
      duration: formatDuration(elapsedSeconds),
      description: sessionDesc.trim() || 'Sesión de trabajo',
    };

    const newSessions = [newSession, ...sessions];
    setSessions(newSessions);
    setIsSaving(true);
    
    try {
      await fetch(`/api/projects/${projectId}/tasks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workSessions: newSessions }),
      });
    } catch (err) { console.error(err); }
    finally { 
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

  const deleteSession = async (id: string) => {
    const newSessions = sessions.filter(s => s.id !== id);
    setSessions(newSessions);
    try {
      await fetch(`/api/projects/${projectId}/tasks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workSessions: newSessions }),
      });
    } catch (err) { console.error(err); }
  };

  if (isLoading) return null;

  return (
    <div className="bg-surface-elevated rounded-xl border border-border overflow-hidden">
      <div className="p-4 border-b border-border/50 flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold">
          <Clock className="w-4 h-4 text-accent" />
          <span>Cronómetro de Estudio</span>
        </div>
        <div className="text-2xl font-mono tracking-wider font-bold">
          {formatDuration(elapsedSeconds)}
        </div>
      </div>
      
      <div className="p-4">
        {showSaveDialog ? (
          <div className="space-y-3 animate-fade-in">
            <label className="text-sm font-medium">¿En qué has estado trabajando?</label>
            <Input 
              autoFocus
              placeholder="Ej. Mezcla de voces track 3..." 
              value={sessionDesc}
              onChange={e => setSessionDesc(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveSession()}
            />
            <div className="flex gap-2">
              <Button onClick={handleSaveSession} disabled={isSaving} className="flex-1">
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Guardar
              </Button>
              <Button variant="ghost" onClick={resetTimer}>Descartar</Button>
            </div>
          </div>
        ) : (
          <Button 
            onClick={toggleTimer} 
            variant={isRunning ? 'destructive' : 'default'}
            className="w-full"
          >
            {isRunning ? (
              <><Square className="w-4 h-4 mr-2 fill-current" /> Terminar Sesión</>
            ) : (
              <><Play className="w-4 h-4 mr-2 fill-current" /> Empezar a Trabajar</>
            )}
          </Button>
        )}
      </div>

      {sessions.length > 0 && (
        <div className="border-t border-border/50 bg-surface/50 max-h-48 overflow-y-auto">
          <div className="p-3 text-xs font-semibold text-text-secondary sticky top-0 bg-surface/90 backdrop-blur-sm border-b border-border/50 flex items-center gap-2">
            <History className="w-3.5 h-3.5" /> Historial Reciente
          </div>
          {sessions.slice(0, 5).map(session => (
            <div key={session.id} className="p-3 border-b border-border/50 hover:bg-surface-elevated transition-colors group flex justify-between items-start">
              <div>
                <p className="text-sm font-medium">{session.description}</p>
                <p className="text-xs text-text-secondary">{new Date(session.date).toLocaleDateString()} a las {new Date(session.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-xs font-mono font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                  {session.duration}
                </span>
                <button onClick={() => deleteSession(session.id)} className="text-[10px] text-error opacity-0 group-hover:opacity-100 transition-opacity">
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
