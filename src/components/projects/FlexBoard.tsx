'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, Plus, GripVertical, Trash2, Circle, Clock, Eye, CheckCircle2,
  ChevronDown, ChevronRight, MoreHorizontal, Pencil, X, AlertCircle,
  ArrowUp, Tag, StickyNote, Palette,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { FlexBoardData, TaskGroup, FlexTask, FlexTaskStatus, FlexTaskPriority } from '@/types';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragOverEvent, DragStartEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// --- Constants ---
const STATUS_CONFIG: Record<FlexTaskStatus, { label: string; icon: typeof Circle; color: string }> = {
  todo: { label: 'Pendiente', icon: Circle, color: 'text-text-secondary' },
  in_progress: { label: 'En progreso', icon: Clock, color: 'text-accent' },
  review: { label: 'Revisión', icon: Eye, color: 'text-warning' },
  done: { label: 'Hecho', icon: CheckCircle2, color: 'text-success' },
};

const PRIORITY_CONFIG: Record<FlexTaskPriority, { label: string; color: string; dot: string }> = {
  urgent: { label: 'Urgente', color: 'text-error', dot: 'bg-error' },
  high: { label: 'Alta', color: 'text-warning', dot: 'bg-warning' },
  medium: { label: 'Media', color: 'text-accent', dot: 'bg-accent' },
  low: { label: 'Baja', color: 'text-text-secondary', dot: 'bg-text-secondary' },
};

const GROUP_COLORS = ['#6c5ce7', '#00cec9', '#00b894', '#fdcb6e', '#e17055', '#a29bfe', '#fd79a8', '#636e72'];
const STATUSES: FlexTaskStatus[] = ['todo', 'in_progress', 'review', 'done'];
const PRIORITIES: FlexTaskPriority[] = ['urgent', 'high', 'medium', 'low'];

function genId() { return Math.random().toString(36).slice(2, 10); }

// --- Sortable Task Item ---
function SortableTaskItem({
  task, groupId, onUpdate, onDelete,
}: {
  task: FlexTask; groupId: string;
  onUpdate: (groupId: string, taskId: string, patch: Partial<FlexTask>) => void;
  onDelete: (groupId: string, taskId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { groupId },
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [showNotes, setShowNotes] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const statusCfg = STATUS_CONFIG[task.status];
  const StatusIcon = statusCfg.icon;

  const cycleStatus = () => {
    const idx = STATUSES.indexOf(task.status);
    const next = STATUSES[(idx + 1) % STATUSES.length];
    onUpdate(groupId, task.id, { status: next });
  };

  const saveTitle = () => {
    if (editTitle.trim() && editTitle.trim() !== task.title) {
      onUpdate(groupId, task.id, { title: editTitle.trim() });
    }
    setIsEditing(false);
  };

  return (
    <div ref={setNodeRef} style={style} className={`rounded-lg border border-border bg-surface-elevated/50 group transition-all ${isDragging ? 'z-10 shadow-lg border-accent/50 relative' : 'hover:border-border'}`}>
      <div className="flex items-center gap-2 p-3">
        {/* Drag handle */}
        <button {...attributes} {...listeners} className="text-text-secondary cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <GripVertical className="w-4 h-4" />
        </button>

        {/* Priority dot */}
        {task.priority && (
          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_CONFIG[task.priority].dot}`} title={PRIORITY_CONFIG[task.priority].label} />
        )}

        {/* Status toggle */}
        <button onClick={cycleStatus} className={`shrink-0 transition-colors ${statusCfg.color}`} title={statusCfg.label}>
          <StatusIcon className="w-4 h-4" />
        </button>

        {/* Title */}
        {isEditing ? (
          <input
            autoFocus
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setIsEditing(false); }}
            className="flex-1 text-sm bg-transparent border-b border-accent outline-none text-text-primary px-1"
          />
        ) : (
          <span
            onClick={() => setIsEditing(true)}
            className={`flex-1 text-sm cursor-text ${task.status === 'done' ? 'text-text-secondary line-through' : 'text-text-primary'}`}
          >
            {task.title}
          </span>
        )}

        {/* Tags */}
        {task.tags && task.tags.length > 0 && (
          <div className="hidden sm:flex items-center gap-1">
            {task.tags.map(tag => (
              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/10 text-accent-light">{tag}</span>
            ))}
          </div>
        )}

        {/* Notes indicator */}
        {task.notes && (
          <button onClick={() => setShowNotes(!showNotes)} className="text-text-secondary hover:text-accent transition-colors shrink-0">
            <StickyNote className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Menu */}
        <div className="relative">
          <button onClick={() => setShowMenu(!showMenu)} className="text-text-secondary hover:text-text-primary opacity-0 group-hover:opacity-100 transition-opacity p-0.5">
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-6 z-50 bg-surface border border-border rounded-lg shadow-xl py-1 w-44 animate-fade-in">
                <div className="px-2 py-1 text-[10px] text-text-secondary uppercase tracking-wider">Estado</div>
                {STATUSES.map(s => {
                  const cfg = STATUS_CONFIG[s];
                  const Icon = cfg.icon;
                  return (
                    <button key={s} onClick={() => { onUpdate(groupId, task.id, { status: s }); setShowMenu(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-surface-elevated ${task.status === s ? 'text-accent' : 'text-text-primary'}`}>
                      <Icon className="w-3.5 h-3.5" /> {cfg.label}
                    </button>
                  );
                })}
                <div className="border-t border-border my-1" />
                <div className="px-2 py-1 text-[10px] text-text-secondary uppercase tracking-wider">Prioridad</div>
                {PRIORITIES.map(p => (
                  <button key={p} onClick={() => { onUpdate(groupId, task.id, { priority: task.priority === p ? undefined : p }); setShowMenu(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-surface-elevated ${task.priority === p ? 'text-accent' : 'text-text-primary'}`}>
                    <div className={`w-2 h-2 rounded-full ${PRIORITY_CONFIG[p].dot}`} /> {PRIORITY_CONFIG[p].label}
                  </button>
                ))}
                <div className="border-t border-border my-1" />
                <button onClick={() => { onUpdate(groupId, task.id, { notes: task.notes || '' }); setShowNotes(true); setShowMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-surface-elevated text-text-primary">
                  <StickyNote className="w-3.5 h-3.5" /> {task.notes ? 'Editar nota' : 'Añadir nota'}
                </button>
                <button onClick={() => { onDelete(groupId, task.id); setShowMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-surface-elevated text-error">
                  <Trash2 className="w-3.5 h-3.5" /> Eliminar
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Expandable notes */}
      {showNotes && (
        <div className="px-10 pb-3">
          <textarea
            value={task.notes || ''}
            onChange={e => onUpdate(groupId, task.id, { notes: e.target.value })}
            placeholder="Escribe una nota..."
            rows={2}
            className="w-full text-xs bg-surface border border-border rounded-md p-2 text-text-primary placeholder:text-text-secondary/50 outline-none focus:border-accent resize-none"
          />
        </div>
      )}
    </div>
  );
}

// --- Main FlexBoard ---
export function FlexBoard({ projectId }: { projectId: string }) {
  const [board, setBoard] = useState<FlexBoardData>({ groups: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [newTaskInputs, setNewTaskInputs] = useState<Record<string, string>>({});
  const [isAddingGroup, setIsAddingGroup] = useState(false);
  const [newGroupTitle, setNewGroupTitle] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => { fetchBoard(); }, [projectId]);

  const fetchBoard = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks`);
      const data = await res.json();
      setBoard(data.groups ? data : { groups: [] });
    } catch (err) { console.error(err); }
    finally { setIsLoading(false); }
  };

  const saveBoard = useCallback(async (newBoard: FlexBoardData) => {
    setBoard(newBoard);
    setIsSaving(true);
    try {
      await fetch(`/api/projects/${projectId}/tasks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newBoard),
      });
    } catch (err) { console.error(err); }
    finally { setIsSaving(false); }
  }, [projectId]);

  // --- Group actions ---
  const addGroup = () => {
    if (!newGroupTitle.trim()) return;
    const newGroup: TaskGroup = {
      id: genId(),
      title: newGroupTitle.trim(),
      color: GROUP_COLORS[board.groups.length % GROUP_COLORS.length],
      collapsed: false,
      tasks: [],
    };
    saveBoard({ groups: [...board.groups, newGroup] });
    setNewGroupTitle('');
    setIsAddingGroup(false);
  };

  const updateGroup = (groupId: string, patch: Partial<TaskGroup>) => {
    const updated = { groups: board.groups.map(g => g.id === groupId ? { ...g, ...patch } : g) };
    saveBoard(updated);
  };

  const deleteGroup = (groupId: string) => {
    saveBoard({ groups: board.groups.filter(g => g.id !== groupId) });
  };

  // --- Task actions ---
  const addTask = (groupId: string) => {
    const title = (newTaskInputs[groupId] || '').trim();
    if (!title) return;
    const task: FlexTask = { id: genId(), title, status: 'todo', createdAt: new Date().toISOString() };
    const updated = {
      groups: board.groups.map(g => g.id === groupId ? { ...g, tasks: [...g.tasks, task] } : g),
    };
    saveBoard(updated);
    setNewTaskInputs(prev => ({ ...prev, [groupId]: '' }));
  };

  const updateTask = (groupId: string, taskId: string, patch: Partial<FlexTask>) => {
    const updated = {
      groups: board.groups.map(g =>
        g.id === groupId
          ? { ...g, tasks: g.tasks.map(t => t.id === taskId ? { ...t, ...patch } : t) }
          : g
      ),
    };
    saveBoard(updated);
  };

  const deleteTask = (groupId: string, taskId: string) => {
    const updated = {
      groups: board.groups.map(g =>
        g.id === groupId ? { ...g, tasks: g.tasks.filter(t => t.id !== taskId) } : g
      ),
    };
    saveBoard(updated);
  };

  // --- Drag & Drop ---
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeGroupId = (active.data.current as any)?.groupId;
    const overGroupId = (over.data.current as any)?.groupId;

    if (!activeGroupId) return;

    if (activeGroupId === overGroupId) {
      // Reorder within same group
      const group = board.groups.find(g => g.id === activeGroupId);
      if (!group) return;
      const oldIdx = group.tasks.findIndex(t => t.id === active.id);
      const newIdx = group.tasks.findIndex(t => t.id === over.id);
      if (oldIdx === -1 || newIdx === -1) return;

      const newTasks = arrayMove(group.tasks, oldIdx, newIdx);
      const updated = {
        groups: board.groups.map(g => g.id === activeGroupId ? { ...g, tasks: newTasks } : g),
      };
      saveBoard(updated);
    } else if (overGroupId) {
      // Move between groups
      const sourceGroup = board.groups.find(g => g.id === activeGroupId);
      const targetGroup = board.groups.find(g => g.id === overGroupId);
      if (!sourceGroup || !targetGroup) return;

      const task = sourceGroup.tasks.find(t => t.id === active.id);
      if (!task) return;

      const targetIdx = targetGroup.tasks.findIndex(t => t.id === over.id);

      const updated = {
        groups: board.groups.map(g => {
          if (g.id === activeGroupId) return { ...g, tasks: g.tasks.filter(t => t.id !== active.id) };
          if (g.id === overGroupId) {
            const newTasks = [...g.tasks];
            newTasks.splice(targetIdx >= 0 ? targetIdx : newTasks.length, 0, task);
            return { ...g, tasks: newTasks };
          }
          return g;
        }),
      };
      saveBoard(updated);
    }
  };

  // --- Stats ---
  const allTasks = board.groups.flatMap(g => g.tasks);
  const totalTasks = allTasks.length;
  const doneTasks = allTasks.filter(t => t.status === 'done').length;
  const progress = totalTasks === 0 ? 0 : Math.round((doneTasks / totalTasks) * 100);

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-accent" /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Progress header */}
      <div className="glass rounded-xl border border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-text-primary">Estado del Proyecto</h3>
            <p className="text-sm text-text-secondary">{doneTasks} de {totalTasks} tareas completadas</p>
          </div>
          <div className="flex items-center gap-3">
            {isSaving && <Loader2 className="w-4 h-4 animate-spin text-accent" />}
            <div className="text-2xl font-bold text-accent">{progress}%</div>
          </div>
        </div>
        <div className="w-full h-2 bg-surface rounded-full overflow-hidden">
          <div className="h-full bg-accent transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        {/* Stats row */}
        <div className="flex gap-4 mt-4">
          {STATUSES.map(s => {
            const cfg = STATUS_CONFIG[s];
            const Icon = cfg.icon;
            const count = allTasks.filter(t => t.status === s).length;
            return (
              <div key={s} className="flex items-center gap-1.5 text-xs text-text-secondary">
                <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                <span>{count} {cfg.label.toLowerCase()}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Groups */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="space-y-4">
          {board.groups.map(group => {
            const groupDone = group.tasks.filter(t => t.status === 'done').length;
            const groupTotal = group.tasks.length;

            return (
              <div key={group.id} className="rounded-xl border border-border bg-surface/30 overflow-hidden">
                {/* Group header */}
                <div className="flex items-center gap-3 p-4 border-b border-border/50">
                  <button onClick={() => updateGroup(group.id, { collapsed: !group.collapsed })} className="text-text-secondary hover:text-text-primary">
                    {group.collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: group.color || '#6c5ce7' }} />
                  <input
                    value={group.title}
                    onChange={e => updateGroup(group.id, { title: e.target.value })}
                    className="flex-1 text-sm font-semibold text-text-primary bg-transparent outline-none border-b border-transparent focus:border-accent"
                  />
                  <span className="text-xs text-text-secondary">{groupDone}/{groupTotal}</span>
                  {/* Color picker */}
                  <div className="relative group/colors">
                    <button className="text-text-secondary hover:text-text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                      <Palette className="w-3.5 h-3.5" />
                    </button>
                    <div className="absolute right-0 top-6 hidden group-hover/colors:flex gap-1 p-2 bg-surface border border-border rounded-lg shadow-xl z-50">
                      {GROUP_COLORS.map(c => (
                        <button key={c} onClick={() => updateGroup(group.id, { color: c })} className="w-5 h-5 rounded-full border border-border hover:scale-110 transition-transform" style={{ backgroundColor: c }} />
                      ))}
                    </div>
                  </div>
                  <button onClick={() => deleteGroup(group.id)} className="text-text-secondary hover:text-error opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Tasks */}
                {!group.collapsed && (
                  <div className="p-3 space-y-2">
                    <SortableContext items={group.tasks} strategy={verticalListSortingStrategy}>
                      {group.tasks.map(task => (
                        <SortableTaskItem key={task.id} task={task} groupId={group.id} onUpdate={updateTask} onDelete={deleteTask} />
                      ))}
                    </SortableContext>

                    {/* Add task inline */}
                    <form onSubmit={e => { e.preventDefault(); addTask(group.id); }} className="flex gap-2 pt-1">
                      <Input
                        placeholder="Nueva tarea..."
                        value={newTaskInputs[group.id] || ''}
                        onChange={e => setNewTaskInputs(prev => ({ ...prev, [group.id]: e.target.value }))}
                        className="flex-1 h-8 text-sm"
                      />
                      <Button type="submit" size="sm" variant="ghost" disabled={!(newTaskInputs[group.id] || '').trim()} className="h-8 px-2">
                        <Plus className="w-4 h-4" />
                      </Button>
                    </form>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </DndContext>

      {/* Add group */}
      {isAddingGroup ? (
        <div className="flex gap-2 items-center">
          <Input
            autoFocus
            placeholder="Nombre del grupo (ej. Mix, Voces, Artwork...)"
            value={newGroupTitle}
            onChange={e => setNewGroupTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addGroup(); if (e.key === 'Escape') setIsAddingGroup(false); }}
            className="flex-1"
          />
          <Button onClick={addGroup} disabled={!newGroupTitle.trim()}>Crear</Button>
          <Button variant="ghost" onClick={() => setIsAddingGroup(false)}><X className="w-4 h-4" /></Button>
        </div>
      ) : (
        <Button variant="outline" onClick={() => setIsAddingGroup(true)} className="w-full border-dashed">
          <Plus className="w-4 h-4 mr-2" /> Añadir Grupo
        </Button>
      )}
    </div>
  );
}
