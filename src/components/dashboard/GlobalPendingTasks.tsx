'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, KanbanSquare, Circle, Clock, AlertCircle, ArrowRight, CheckCircle2, Play, Download, ExternalLink, MoreHorizontal, Link as LinkIcon, GripVertical } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useContextMenu } from '@/lib/contexts/ContextMenuContext';
import { useAudio } from '@/lib/contexts/AudioContext';
import { customAlert } from '@/lib/dialog';
import { useSmoothScroll } from '@/hooks/useSmoothScroll';

import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent, DragOverlay, defaultDropAnimationSideEffects, useDraggable, useDroppable
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

interface PendingTask {
  id: string; // unique virtual id
  artistId: string;
  artistName: string;
  matrixId: string;
  matrixName: string;
  rowId: string;
  rowName: string;
  colId: string;
  colName: string;
  status: 'todo' | 'in_progress' | 'review' | 'completed';
  projectId?: string;
  linkedFile?: { id: string; name: string; webViewLink?: string; webContentLink?: string; mimeType?: string };
}

// ----------------------------------------------------------------------
// TaskCard Component
// ----------------------------------------------------------------------
function TaskCard({ 
  task, 
  borderColor, 
  isOverlay = false, 
  onUpdateStatus 
}: { 
  task: PendingTask; 
  borderColor: string; 
  isOverlay?: boolean;
  onUpdateStatus: (task: PendingTask, newStatus: 'todo' | 'in_progress' | 'review' | 'completed') => void;
}) {
  const { showMenu } = useContextMenu();
  const { playTrack } = useAudio();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: task
  });

  const style = transform ? {
    transform: CSS.Translate.toString(transform),
  } : undefined;

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    showMenu(e.clientX, e.clientY, [
      { label: 'Ir a Matriz', icon: 'KanbanSquare', action: () => window.location.href = `/artists/${task.artistId}?tab=matrices&matrixId=${task.matrixId}` },
      { separator: true },
      { label: 'Pendiente', icon: 'Circle', iconClassName: 'text-text-secondary', className: 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated', action: () => onUpdateStatus(task, 'todo') },
      { label: 'En Progreso', icon: 'Clock', iconClassName: 'text-warning', className: '!text-warning hover:!text-warning hover:bg-warning/10', action: () => onUpdateStatus(task, 'in_progress') },
      { label: 'En Revisión', icon: 'AlertCircle', iconClassName: 'text-blue-400', className: '!text-blue-400 hover:!text-blue-400 hover:bg-blue-500/10', action: () => onUpdateStatus(task, 'review') },
      { label: 'Completado', icon: 'CheckCircle2', iconClassName: 'text-success', className: '!text-success hover:!text-success hover:bg-success/10', action: () => onUpdateStatus(task, 'completed') },
    ]);
  };

  const hasAudio = task.linkedFile && (task.linkedFile.mimeType?.includes('audio/') || /\.(wav|mp3|m4a|flac|aiff|ogg)$/i.test(task.linkedFile.name));

  return (
    <div
      ref={setNodeRef}
      style={style}
      onContextMenu={handleContextMenu}
      className={cn(
        "relative p-3 rounded-xl border transition-all duration-300 group block select-none overflow-hidden",
        borderColor,
        "bg-surface hover:bg-surface-elevated",
        isDragging && !isOverlay ? "opacity-40 scale-95" : "opacity-100",
        isOverlay ? "shadow-2xl shadow-black/10 scale-105 rotate-2 cursor-grabbing" : "hover:-translate-y-0.5 hover:shadow-md hover:shadow-black/5"
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      
      <div className="relative z-10 flex flex-col gap-1.5">
        <div className="flex justify-between items-start gap-2">
          <div className="flex-1 min-w-0 flex items-center gap-1.5">
            <button
              {...(isOverlay ? {} : attributes)}
              {...(isOverlay ? {} : listeners)}
              className="text-text-secondary opacity-0 group-hover:opacity-100 hover:text-text-primary transition-opacity shrink-0 cursor-grab active:cursor-grabbing"
              title="Arrastrar para mover"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </button>
            <Link 
              href={`/artists/${task.artistId}?tab=matrices&matrixId=${task.matrixId}`}
              className="font-semibold text-text-primary text-sm line-clamp-1 hover:text-accent transition-colors z-10"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {task.rowName}
            </Link>
          </div>
          <button 
            className="p-0.5 text-text-secondary hover:text-text-primary rounded-md hover:bg-background/50 transition-colors z-10 shrink-0"
            onClick={(e) => handleContextMenu(e)}
            onPointerDown={(e) => e.stopPropagation()}
            title="Opciones"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap pl-5">
          <Link 
            href={`/artists/${task.artistId}`}
            className="text-[9px] font-bold tracking-wider uppercase bg-surface-elevated px-1.5 py-0.5 rounded text-text-secondary hover:text-accent hover:bg-accent/10 transition-colors truncate max-w-[100px] z-10"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {task.artistName}
          </Link>
          <span className="text-[10px] text-text-secondary/50">•</span>
          <Link 
            href={task.projectId ? `/projects/${task.projectId}` : `/artists/${task.artistId}?tab=matrices&matrixId=${task.matrixId}`}
            className="text-[10px] font-medium text-text-secondary hover:text-accent transition-colors truncate max-w-[100px] z-10"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {task.matrixName}
          </Link>
        </div>

        <div className="flex items-center justify-between mt-1 pl-5">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-accent/50" />
            <span className="text-[10px] font-medium text-text-secondary truncate max-w-[120px]">
              {task.colName}
            </span>
          </div>

          {/* Linked File Actions */}
          {task.linkedFile && (
            <div className="flex items-center gap-1 shrink-0 z-10" onPointerDown={(e) => e.stopPropagation()}>
              {hasAudio && (
                <button 
                  onClick={(e) => { 
                    e.preventDefault();
                    e.stopPropagation(); 
                    const pathSegs = [
                      { name: 'Artistas', url: '/artists' },
                      { name: task.artistName, url: `/artists/${task.artistId}` },
                      { name: task.rowName || task.linkedFile!.name }
                    ];
                    playTrack({ 
                      id: task.linkedFile!.id, 
                      name: task.rowName || task.linkedFile!.name, 
                      url: `/api/audio/${task.linkedFile!.id}`, 
                      artistName: task.artistName, 
                      pathSegments: pathSegs 
                    }); 
                  }} 
                  className="bg-accent/10 hover:bg-accent/20 text-accent transition-colors p-1 rounded-md" 
                  title="Reproducir audio"
                >
                  <Play className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// StatusColumn Component
// ----------------------------------------------------------------------
function StatusColumn({
  id,
  title, 
  icon, 
  columnTasks, 
  bgColor, 
  textColor, 
  borderColor,
  onUpdateStatus
}: {
  id: 'todo' | 'in_progress' | 'review';
  title: string;
  icon: React.ReactNode;
  columnTasks: PendingTask[];
  bgColor: string;
  textColor: string;
  borderColor: string;
  onUpdateStatus: (task: PendingTask, newStatus: 'todo' | 'in_progress' | 'review' | 'completed') => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const scrollRef = useRef<HTMLDivElement>(null);
  useSmoothScroll(scrollRef);

  return (
    <div 
      ref={setNodeRef}
      className={cn(
        "flex flex-col h-full min-h-0 rounded-[24px] overflow-hidden transition-all duration-300 relative border backdrop-blur-xl",
        isOver ? "bg-surface/80 border-accent shadow-[0_0_30px_rgba(var(--accent),0.15)]" : "bg-surface/40 border-border/60 hover:border-border/80 shadow-lg"
      )}
    >
      {/* Ambient background glow based on column */}
      <div className={cn(
        "absolute top-0 left-1/2 -translate-x-1/2 w-full h-32 rounded-full blur-[60px] opacity-20 pointer-events-none",
        id === 'todo' ? "bg-text-secondary" : id === 'in_progress' ? "bg-warning" : "bg-blue-500"
      )} />

      <div className={cn("px-5 py-4 flex items-center justify-between z-10 relative border-b border-border/40", bgColor)}>
        <div className="flex items-center gap-2.5 relative z-10">
          <div className={cn("p-1.5 rounded-lg shadow-inner bg-surface/80 border border-border/50", textColor)}>
            {icon}
          </div>
          <h3 className={cn("font-bold text-[15px] tracking-tight", textColor)}>{title}</h3>
        </div>
        <span className={cn("text-xs px-3 py-1 rounded-full font-bold bg-surface border border-border/50 shadow-sm relative z-10", textColor)}>
          {columnTasks.length}
        </span>
      </div>
      
      <div ref={scrollRef} className="flex-1 p-3 overflow-y-auto scroll-smooth custom-scrollbar space-y-3">
        {columnTasks.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-40 text-text-secondary min-h-[100px]">
            <CheckCircle2 className="w-8 h-8 mb-2" />
            <span className="text-xs font-medium">No hay tareas</span>
          </div>
        ) : (
          columnTasks.map(task => (
            <TaskCard 
              key={task.id} 
              task={task} 
              borderColor={borderColor} 
              onUpdateStatus={onUpdateStatus}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Main GlobalPendingTasks Component
// ----------------------------------------------------------------------
export function GlobalPendingTasks() {
  const [tasks, setTasks] = useState<PendingTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeDragTask, setActiveDragTask] = useState<PendingTask | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  useEffect(() => {
    fetch('/api/dashboard/matrices')
      .then(res => res.json())
      .then(data => {
        const matrices = data.matrices || [];
        const extracted: PendingTask[] = [];

        matrices.forEach((m: any) => {
          if (!m.productionGrid || !m.productionGrid.rows || !m.productionGrid.columns) return;
          
          const colMap: Record<string, string> = {};
          m.productionGrid.columns.forEach((c: any) => {
            colMap[c.id] = c.name;
          });

          m.productionGrid.rows.forEach((row: any) => {
            if (!row.cells) return;
            Object.keys(row.cells).forEach((colId) => {
              const cell = row.cells[colId];
              if (cell && (cell.status === 'todo' || cell.status === 'in_progress' || cell.status === 'review')) {
                extracted.push({
                  id: `${m.id}-${row.id}-${colId}`,
                  artistId: m.artistId,
                  artistName: m.artistName || 'Desconocido',
                  matrixId: m.id,
                  matrixName: m.name,
                  rowId: row.id,
                  rowName: row.name || 'Sin nombre',
                  colId,
                  colName: colMap[colId] || 'Fase',
                  status: cell.status,
                  projectId: m.projectId,
                  linkedFile: row.linkedFile
                });
              }
            });
          });
        });

        extracted.sort((a, b) => a.artistName.localeCompare(b.artistName) || a.rowName.localeCompare(b.rowName));
        setTasks(extracted);
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Error fetching global tasks', err);
        setIsLoading(false);
      });
  }, []);

  const updateTaskStatus = async (task: PendingTask, newStatus: 'todo' | 'in_progress' | 'review' | 'completed') => {
    if (task.status === newStatus) return;

    // 1. Optimistic Update
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));

    try {
      // 2. Fetch specific matrix to get latest state
      const res = await fetch(`/api/artists/${task.artistId}/matrices`);
      if (!res.ok) throw new Error('Failed to fetch matrices');
      const data = await res.json();
      const matrix = data.matrices?.find((m: any) => m.id === task.matrixId);
      if (!matrix || !matrix.productionGrid) throw new Error('Matrix not found');

      // 3. Update cell in grid
      const newGrid = { ...matrix.productionGrid };
      const rowIdx = newGrid.rows.findIndex((r: any) => r.id === task.rowId);
      if (rowIdx > -1) {
        newGrid.rows[rowIdx].cells[task.colId] = {
          ...(newGrid.rows[rowIdx].cells[task.colId] || {}),
          status: newStatus
        };
      }

      // 4. Save to Drive
      const putRes = await fetch(`/api/artists/${task.artistId}/matrices/${task.matrixId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productionGrid: newGrid, projectId: task.projectId || matrix.projectId })
      });
      if (!putRes.ok) throw new Error('Failed to save matrix');

    } catch (e) {
      console.error('Failed to update task status:', e);
      customAlert('Error al actualizar el estado en el servidor. Revirtiendo cambio...');
      // Revert optimistic update
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: task.status } : t));
    }
  };

  const handleDragStart = (event: any) => {
    const { active } = event;
    const task = tasks.find(t => t.id === active.id);
    if (task) setActiveDragTask(task);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragTask(null);
    const { active, over } = event;
    if (!over) return;

    const task = tasks.find(t => t.id === active.id);
    const newStatus = over.id as 'todo' | 'in_progress' | 'review' | 'completed';

    if (task && task.status !== newStatus) {
      updateTaskStatus(task, newStatus);
    }
  };

  const handleDragCancel = () => {
    setActiveDragTask(null);
  };

  if (isLoading) {
    return (
      <div className="glass rounded-[24px] border border-border p-8 flex flex-col items-center justify-center animate-pulse h-full">
        <Loader2 className="w-8 h-8 animate-spin text-accent mb-4" />
        <p className="text-text-secondary font-medium">Cargando centro de tareas...</p>
      </div>
    );
  }

  const todoTasks = tasks.filter(t => t.status === 'todo');
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
  const reviewTasks = tasks.filter(t => t.status === 'review');

  return (
    <div className="glass rounded-[24px] border border-border p-5 shadow-xl relative overflow-hidden flex flex-col h-full">
      <div className="absolute top-0 right-0 w-96 h-96 bg-accent/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
      
      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4 shrink-0">
        <div>
          <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <KanbanSquare className="w-5 h-5 text-accent" />
            Flujo de Trabajo Global
          </h2>
          <p className="text-sm text-text-secondary mt-1">
            Vista unificada de todas las matrices y procesos activos
          </p>
        </div>
        
        <div className="flex items-center gap-4 bg-surface-elevated px-5 py-2.5 rounded-2xl border border-border/60 shadow-inner">
          <div className="flex flex-col items-center">
            <span className="text-xl font-black text-text-primary">{tasks.length}</span>
            <span className="text-[10px] text-text-secondary uppercase font-bold tracking-wider">Total</span>
          </div>
          <div className="w-px h-8 bg-border/80" />
          <div className="flex flex-col items-center">
            <span className="text-xl font-black text-warning">{inProgressTasks.length + reviewTasks.length}</span>
            <span className="text-[10px] text-text-secondary uppercase font-bold tracking-wider">Activas</span>
          </div>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide lg:grid lg:grid-cols-3 gap-4 lg:gap-6 relative z-10 flex-1 min-h-[450px] lg:min-h-0 pb-4 lg:pb-0 -mx-5 px-5 lg:mx-0 lg:px-0">
          <div className="w-[85vw] sm:w-[340px] shrink-0 snap-center lg:w-auto lg:h-full">
            <StatusColumn
              id="todo"
              title="Pendientes"
              icon={<Circle className="w-4 h-4 text-text-secondary" />}
              columnTasks={todoTasks}
              bgColor="bg-surface-elevated/30"
              textColor="text-text-primary"
              borderColor="border-border/60 hover:border-text-secondary/50"
              onUpdateStatus={updateTaskStatus}
            />
          </div>
          
          <div className="w-[85vw] sm:w-[340px] shrink-0 snap-center lg:w-auto lg:h-full">
            <StatusColumn
              id="in_progress"
              title="En Progreso"
              icon={<Clock className="w-4 h-4 text-warning" />}
              columnTasks={inProgressTasks}
              bgColor="bg-warning/10"
              textColor="text-warning"
              borderColor="border-warning/20 hover:border-warning/50"
              onUpdateStatus={updateTaskStatus}
            />
          </div>
          
          <div className="w-[85vw] sm:w-[340px] shrink-0 snap-center lg:w-auto lg:h-full">
            <StatusColumn
              id="review"
              title="En Revisión"
              icon={<AlertCircle className="w-4 h-4 text-blue-400" />}
              columnTasks={reviewTasks}
              bgColor="bg-blue-500/10"
              textColor="text-blue-400"
              borderColor="border-blue-500/20 hover:border-blue-500/50"
              onUpdateStatus={updateTaskStatus}
            />
          </div>
        </div>

        <DragOverlay dropAnimation={{ duration: 250, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
          {activeDragTask ? (
            <TaskCard
              task={activeDragTask}
              borderColor={
                activeDragTask.status === 'todo' ? "border-border/60" :
                activeDragTask.status === 'in_progress' ? "border-warning/50" :
                "border-blue-500/50"
              }
              isOverlay={true}
              onUpdateStatus={() => {}}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
