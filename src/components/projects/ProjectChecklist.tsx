'use client';

import { useState, useEffect } from 'react';
import { Loader2, Plus, GripVertical, Trash2, CheckCircle2, Circle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { Task } from '@/types';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// --- Subcomponente SortableItem ---
function SortableTaskItem({
  task,
  toggleTask,
  deleteTask,
}: {
  task: Task;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 rounded-lg border border-border bg-surface-elevated group ${
        isDragging ? 'z-10 shadow-lg border-accent/50 relative' : ''
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="text-text-secondary cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <button
        onClick={() => toggleTask(task.id)}
        className="shrink-0 text-text-secondary hover:text-accent transition-colors"
      >
        {task.status === 'completed' ? (
          <CheckCircle2 className="w-5 h-5 text-success" />
        ) : (
          <Circle className="w-5 h-5" />
        )}
      </button>
      <span
        className={`flex-1 text-sm ${
          task.status === 'completed' ? 'text-text-secondary line-through' : 'text-text-primary'
        }`}
      >
        {task.title}
      </span>
      <button
        onClick={() => deleteTask(task.id)}
        className="text-text-secondary hover:text-error opacity-0 group-hover:opacity-100 transition-opacity p-1"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

// --- Componente Principal ---
export function ProjectChecklist({ projectId }: { projectId: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    fetchTasks();
  }, [projectId]);

  const fetchTasks = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks`);
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const saveTasks = async (newTasks: Task[]) => {
    setIsSaving(true);
    setTasks(newTasks);
    try {
      await fetch(`/api/projects/${projectId}/tasks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: newTasks }),
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const addTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    const newTask: Task = {
      id: Math.random().toString(),
      title: newTaskTitle.trim(),
      status: 'pending',
    };
    saveTasks([...tasks, newTask]);
    setNewTaskTitle('');
  };

  const toggleTask = (taskId: string) => {
    const updated = tasks.map(t =>
      t.id === taskId
        ? { ...t, status: t.status === 'completed' ? 'pending' : ('completed' as any) }
        : t
    );
    saveTasks(updated);
  };

  const deleteTask = (taskId: string) => {
    const updated = tasks.filter(t => t.id !== taskId);
    saveTasks(updated);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = tasks.findIndex(t => t.id === active.id);
      const newIndex = tasks.findIndex(t => t.id === over.id);

      const newTasks = arrayMove(tasks, oldIndex, newIndex);
      saveTasks(newTasks);
    }
  };

  if (isLoading)
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
      </div>
    );

  const completed = tasks.filter(t => t.status === 'completed').length;
  const progress = tasks.length === 0 ? 0 : Math.round((completed / tasks.length) * 100);

  return (
    <div className="glass rounded-xl border border-border p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-text-primary">Progreso del Proyecto</h3>
          <p className="text-sm text-text-secondary">
            {completed} de {tasks.length} tareas completadas
          </p>
        </div>
        <div className="text-2xl font-bold text-accent">{progress}%</div>
      </div>

      <div className="w-full h-2 bg-surface rounded-full mb-8 overflow-hidden">
        <div
          className="h-full bg-accent transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="space-y-2 mb-6 min-h-[50px]">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={tasks} strategy={verticalListSortingStrategy}>
            {tasks.map(task => (
              <SortableTaskItem
                key={task.id}
                task={task}
                toggleTask={toggleTask}
                deleteTask={deleteTask}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      <form onSubmit={addTask} className="flex gap-2">
        <Input
          placeholder="Añadir nueva tarea (ej. Afinar voces, Renderizar stems...)"
          value={newTaskTitle}
          onChange={e => setNewTaskTitle(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" disabled={!newTaskTitle.trim() || isSaving}>
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        </Button>
      </form>
    </div>
  );
}
