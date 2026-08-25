'use client';

import React, { useState } from 'react';
import { 
  CheckCircle2, 
  Circle, 
  Plus, 
  Trash2, 
  ListTodo, 
  Loader2, 
  Sparkles 
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { PersonalTask } from '@/types';
import { customAlert } from '@/lib/dialog';

interface PersonalProjectTasksTabProps {
  projectId: string;
  tasks: PersonalTask[];
  onUpdateTasks: (tasks: PersonalTask[]) => Promise<any>;
}

export function PersonalProjectTasksTab({
  projectId,
  tasks,
  onUpdateTasks,
}: PersonalProjectTasksTabProps) {
  const [localTasks, setLocalTasks] = useState<PersonalTask[]>(tasks || []);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  React.useEffect(() => {
    setLocalTasks(tasks || []);
  }, [tasks]);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    const newTask: PersonalTask = {
      id: Math.random().toString(36).substring(2, 9),
      title: newTaskTitle.trim(),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    const updated = [...localTasks, newTask];
    setLocalTasks(updated);
    setNewTaskTitle('');

    setIsSaving(true);
    try {
      await onUpdateTasks(updated);
    } catch (err: any) {
      console.error(err);
      customAlert('Error al guardar la tarea');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleTask = async (taskId: string) => {
    const updated = localTasks.map(t => {
      if (t.id === taskId) {
        return {
          ...t,
          status: (t.status === 'completed' ? 'pending' : 'completed') as 'pending' | 'completed',
        };
      }
      return t;
    });

    setLocalTasks(updated);
    try {
      await onUpdateTasks(updated);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    const updated = localTasks.filter(t => t.id !== taskId);
    setLocalTasks(updated);
    try {
      await onUpdateTasks(updated);
    } catch (err) {
      console.error(err);
    }
  };

  const pendingCount = localTasks.filter(t => t.status === 'pending').length;
  const completedCount = localTasks.filter(t => t.status === 'completed').length;
  const progressPercent = localTasks.length > 0 ? Math.round((completedCount / localTasks.length) * 100) : 0;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header & Progress */}
      <div className="glass p-6 rounded-2xl border border-border/80 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center border border-accent/20">
              <ListTodo className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h2 className="text-base font-bold text-text-primary">Checklist de Producción</h2>
              <p className="text-xs text-text-secondary">
                {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''} · {completedCount} completada{completedCount !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-accent">{progressPercent}%</span>
            <div className="w-28 h-2 bg-surface-elevated rounded-full overflow-hidden border border-border/60">
              <div
                className="h-full bg-accent transition-all duration-300 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Add Task Input */}
        <form onSubmit={handleAddTask} className="flex gap-2">
          <Input
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            placeholder="Añadir nueva tarea (ej: 'Reemplazar snare', 'Exportar stems')..."
            className="flex-1"
          />
          <Button
            type="submit"
            disabled={isSaving || !newTaskTitle.trim()}
            className="bg-accent hover:bg-accent-light text-white shrink-0"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-1.5" />}
            Añadir
          </Button>
        </form>
      </div>

      {/* Task List */}
      <div className="space-y-2">
        {localTasks.length === 0 ? (
          <div className="glass p-8 rounded-2xl border border-dashed border-border text-center text-text-secondary text-xs">
            No hay tareas pendientes en este proyecto. Añade tu primera tarea arriba.
          </div>
        ) : (
          localTasks.map((task) => {
            const isDone = task.status === 'completed';
            return (
              <div
                key={task.id}
                className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border transition-all duration-150 ${
                  isDone 
                    ? 'bg-surface/40 border-border/40 opacity-75' 
                    : 'bg-surface/80 hover:bg-surface border-border/70 shadow-sm'
                }`}
              >
                <div 
                  className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer select-none"
                  onClick={() => handleToggleTask(task.id)}
                >
                  <button
                    type="button"
                    className="shrink-0 focus:outline-none"
                  >
                    {isDone ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 fill-emerald-500/10" />
                    ) : (
                      <Circle className="w-5 h-5 text-text-secondary hover:text-accent transition-colors" />
                    )}
                  </button>

                  <span className={`text-sm ${isDone ? 'line-through text-text-secondary' : 'text-text-primary font-medium'} truncate`}>
                    {task.title}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteTask(task.id)}
                  className="p-1.5 rounded-lg text-text-secondary hover:text-danger hover:bg-surface-elevated transition-colors"
                  title="Eliminar tarea"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
