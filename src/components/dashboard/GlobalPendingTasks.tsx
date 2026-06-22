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
      {...(isOverlay ? {} : {})}
      {...(isOverlay ? {} : {})}
      onContextMenu={handleContextMenu}
      className={cn(
        "relative p-3.5 rounded-xl border transition-all group block select-none",
        borderColor,
        "bg-surface hover:bg-surface-elevated",
        isDragging && !isOverlay ? "opacity-30" : "opacity-100",
        isOverlay ? "shadow-2xl scale-105" : "hover:-translate-y-0.5 hover:shadow-md"
      )}
    >
      <div className="flex justify-between items-start mb-2">
        <Link 
          href={`/artists/${task.artistId}`}
          className="text-[10px] font-bold tracking-wider uppercase bg-surface-elevated px-2 py-0.5 rounded text-text-secondary hover:text-accent hover:bg-accent/10 transition-colors truncate max-w-[120px] z-10"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {task.artistName}
        </Link>
        <div className="flex items-center gap-1.5">
          <Link 
            href={task.projectId ? `/projects/${task.projectId}` : `/artists/${task.artistId}?tab=matrices&matrixId=${task.matrixId}`}
            className="text-[10px] text-text-secondary hover:text-accent hover:bg-accent/10 transition-colors flex items-center gap-1 bg-surface-elevated px-2 py-0.5 rounded z-10"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <KanbanSquare className="w-3 h-3" />
            <span className="truncate max-w-[80px]">{task.matrixName}</span>
          </Link>
          <button 
            className="p-1 text-text-secondary hover:text-text-primary rounded-md hover:bg-background/50 transition-colors z-10"
            onClick={(e) => handleContextMenu(e)}
            onPointerDown={(e) => e.stopPropagation()}
            title="Opciones"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-start gap-1.5 flex-1 min-w-0">
          <button
            {...(isOverlay ? {} : attributes)}
            {...(isOverlay ? {} : listeners)}
            className="text-text-secondary opacity-0 group-hover:opacity-100 hover:text-text-primary transition-opacity shrink-0 cursor-grab active:cursor-grabbing mt-0.5"
            title="Arrastrar para mover"
          >
            <GripVertical className="w-4 h-4" />
          </button>
          <Link 
            href={`/artists/${task.artistId}?tab=matrices&matrixId=${task.matrixId}`}
            className="font-semibold text-text-primary text-sm line-clamp-2 leading-tight hover:text-accent transition-colors z-10"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {task.rowName}
          </Link>
        </div>
        
        {/* Linked File Actions */}
        {task.linkedFile && (
          <div className="flex items-center gap-1 shrink-0 bg-surface-elevated/80 px-1 py-0.5 rounded border border-border/50 z-10" onPointerDown={(e) => e.stopPropagation()}>
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
                className="text-accent hover:text-accent-light transition-colors p-0.5" 
                title="Reproducir audio"
              >
                <Play className="w-3.5 h-3.5" />
              </button>
            )}
            {task.linkedFile.webViewLink && (
              <a 
                href={task.linkedFile.webViewLink} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-text-secondary hover:text-text-primary transition-colors p-0.5" 
                title="Abrir en Drive"
                onClick={e => e.stopPropagation()}
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {task.linkedFile.webContentLink && (
              <a 
                href={task.linkedFile.webContentLink} 
                className="text-text-secondary hover:text-text-primary transition-colors p-0.5" 
                title="Descargar archivo"
                onClick={e => e.stopPropagation()}
              >
                <Download className="w-3 h-3" />
              </a>
            )}
          </div>
        )}
      </div>
      
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/40">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-accent/50" />
          <span className="text-[11px] font-medium text-text-secondary truncate max-w-[150px]">
            {task.colName}
          </span>
        </div>
        <ArrowRight className="w-3.5 h-3.5 text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity" />
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
        "flex flex-col h-full min-h-0 bg-surface-elevated/50 rounded-2xl border overflow-hidden shadow-inner transition-colors",
        isOver ? "border-accent/50 bg-surface-elevated/80" : "border-border/50"
      )}
    >
      <div className={cn("p-4 border-b border-border/50 flex items-center justify-between", bgColor)}>
        <div className="flex items-center gap-2">
          {icon}
          <h3 className={cn("font-bold text-sm", textColor)}>{title}</h3>
        </div>
        <span className={cn("text-xs px-2.5 py-1 rounded-full font-bold bg-background/50 backdrop-blur-sm shadow-sm", textColor)}>
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
      <div className="glass rounded-[24px] border border-border p-8 min-h-[400px] flex flex-col items-center justify-center animate-pulse h-full">
        <Loader2 className="w-8 h-8 animate-spin text-accent mb-4" />
        <p className="text-text-secondary font-medium">Cargando centro de tareas...</p>
      </div>
    );
  }

  const todoTasks = tasks.filter(t => t.status === 'todo');
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
  const reviewTasks = tasks.filter(t => t.status === 'review');

  return (
    <div className="glass rounded-[24px] border border-border p-6 shadow-xl relative overflow-hidden flex flex-col h-full">
      <div className="absolute top-0 right-0 w-96 h-96 bg-accent/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
      
      <div className="relative z-10 flex items-center justify-between mb-6 shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-text-primary flex items-center gap-3">
            <KanbanSquare className="w-6 h-6 text-accent" />
            Trabajo
          </h2>
          <p className="text-sm text-text-secondary mt-1">
            Vista unificada de todas las matrices y procesos activos
          </p>
        </div>
        
        <div className="flex items-center gap-4 bg-surface-elevated/50 px-4 py-2 rounded-xl border border-border">
          <div className="flex flex-col items-center">
            <span className="text-lg font-bold text-text-primary">{tasks.length}</span>
            <span className="text-[10px] text-text-secondary uppercase font-bold tracking-wider">Total</span>
          </div>
          <div className="w-px h-8 bg-border" />
          <div className="flex flex-col items-center">
            <span className="text-lg font-bold text-warning">{inProgressTasks.length + reviewTasks.length}</span>
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10 flex-1 min-h-0">
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
