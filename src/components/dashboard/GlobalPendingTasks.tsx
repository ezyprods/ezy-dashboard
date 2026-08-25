'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Loader2, KanbanSquare, Circle, Clock, AlertCircle, ArrowRight, 
  CheckCircle2, Play, Download, ExternalLink, MoreHorizontal, 
  Link as LinkIcon, GripVertical, Search, X, Filter, Table2 
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useContextMenu } from '@/lib/contexts/ContextMenuContext';
import { useAudio } from '@/lib/contexts/AudioContext';
import { customAlert } from '@/lib/dialog';
import { useSmoothScroll } from '@/hooks/useSmoothScroll';
import type { FlexTaskStatus } from '@/types';

import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent, DragOverlay, useDraggable, useDroppable
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
  status: FlexTaskStatus;
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
  onUpdateStatus: (task: PendingTask, newStatus: FlexTaskStatus) => void;
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
      { label: 'Completado (Hecho)', icon: 'CheckCircle2', iconClassName: 'text-success', className: '!text-success hover:!text-success hover:bg-success/10', action: () => onUpdateStatus(task, 'done') },
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
        isOverlay ? "shadow-2xl shadow-black/20 scale-105 rotate-1 cursor-grabbing ring-1 ring-accent" : "hover:-translate-y-0.5 hover:shadow-md hover:shadow-black/5"
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      
      <div className="relative z-10 flex flex-col gap-1.5">
        <div className="flex justify-between items-start gap-2">
          <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
            <button
              {...(isOverlay ? {} : attributes)}
              {...(isOverlay ? {} : listeners)}
              className="text-text-secondary opacity-40 sm:opacity-0 sm:group-hover:opacity-100 hover:text-text-primary transition-opacity shrink-0 cursor-grab active:cursor-grabbing p-0.5"
              title="Arrastrar para mover"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </button>
            <Link 
              href={`/artists/${task.artistId}?tab=matrices&matrixId=${task.matrixId}`}
              className="font-semibold text-text-primary text-[13px] hover:text-accent transition-colors z-10 truncate max-w-[140px]"
              onPointerDown={(e) => e.stopPropagation()}
              title={task.rowName}
            >
              {task.rowName}
            </Link>
            
            <span className="text-border/80 text-[10px] mx-0.5">|</span>

            <Link 
              href={`/artists/${task.artistId}`}
              className="text-[9px] font-bold tracking-wider uppercase bg-surface-elevated px-1.5 py-0.5 rounded text-text-secondary hover:text-accent hover:bg-accent/10 transition-colors truncate max-w-[80px] z-10 shrink-0"
              onPointerDown={(e) => e.stopPropagation()}
              title={task.artistName}
            >
              {task.artistName}
            </Link>
            <span className="text-[10px] text-text-secondary/50 shrink-0">•</span>
            <Link 
              href={task.projectId ? `/projects/${task.projectId}` : `/artists/${task.artistId}?tab=matrices&matrixId=${task.matrixId}`}
              className="text-[9px] font-medium text-text-secondary hover:text-accent transition-colors truncate max-w-[90px] z-10 shrink-0"
              onPointerDown={(e) => e.stopPropagation()}
              title={task.matrixName}
            >
              {task.matrixName}
            </Link>
          </div>
          <button 
            className="p-1 text-text-secondary hover:text-text-primary rounded-md hover:bg-background/50 transition-colors z-10 shrink-0"
            onClick={(e) => handleContextMenu(e)}
            onPointerDown={(e) => e.stopPropagation()}
            title="Opciones"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
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
                  className="bg-accent/10 hover:bg-accent/20 text-accent transition-colors p-1 rounded-md flex items-center gap-1 text-[10px] font-medium" 
                  title="Reproducir audio"
                >
                  <Play className="w-3 h-3" />
                  <span className="hidden sm:inline text-[9px]">Audio</span>
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
  onUpdateStatus: (task: PendingTask, newStatus: FlexTaskStatus) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const scrollRef = useRef<HTMLDivElement>(null);
  useSmoothScroll(scrollRef);

  return (
    <div 
      ref={setNodeRef}
      className={cn(
        "flex flex-col h-full min-h-0 rounded-[24px] overflow-hidden transition-all duration-300 relative border backdrop-blur-xl",
        isOver ? "bg-surface/90 border-accent shadow-lg shadow-accent/10" : "bg-surface/40 border-border/60 hover:border-border/80"
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
      
      <div ref={scrollRef} className="flex-1 p-3 overflow-y-auto custom-scrollbar space-y-3" style={{ willChange: 'scroll-position' }}>
        {columnTasks.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-40 text-text-secondary min-h-[120px]">
            <CheckCircle2 className="w-8 h-8 mb-2" />
            <span className="text-xs font-medium">No hay tareas en este estado</span>
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

import { useAppData } from '@/lib/contexts/AppDataContext';

// ----------------------------------------------------------------------
// Main GlobalPendingTasks Component
// ----------------------------------------------------------------------
export function GlobalPendingTasks() {
  const { matrices, matricesLoading: isLoading, fetchMatrices } = useAppData();
  const [tasks, setTasks] = useState<PendingTask[]>([]);
  const [activeDragTask, setActiveDragTask] = useState<PendingTask | null>(null);
  
  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArtist, setSelectedArtist] = useState<string>('all');

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  useEffect(() => {
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
              status: cell.status as FlexTaskStatus,
              projectId: m.projectId,
              linkedFile: row.linkedFile
            });
          }
        });
      });
    });

    extracted.sort((a, b) => a.artistName.localeCompare(b.artistName) || a.rowName.localeCompare(b.rowName));
    setTasks(extracted);
  }, [matrices]);

  // Unique artists list for dropdown filter
  const uniqueArtists = useMemo(() => {
    const set = new Map<string, string>();
    tasks.forEach(t => {
      if (t.artistId && t.artistName) {
        set.set(t.artistId, t.artistName);
      }
    });
    return Array.from(set.entries()).map(([id, name]) => ({ id, name }));
  }, [tasks]);

  // Filtered tasks based on search and artist dropdown
  const filteredTasks = useMemo(() => {
    const normalize = (s: string) => s?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") || "";
    const query = normalize(searchQuery.trim());

    return tasks.filter(t => {
      const matchesArtist = selectedArtist === 'all' || t.artistId === selectedArtist;
      if (!matchesArtist) return false;

      if (!query) return true;
      return (
        normalize(t.rowName).includes(query) ||
        normalize(t.artistName).includes(query) ||
        normalize(t.colName).includes(query) ||
        normalize(t.matrixName).includes(query)
      );
    });
  }, [tasks, selectedArtist, searchQuery]);

  const updateTaskStatus = async (task: PendingTask, newStatus: FlexTaskStatus) => {
    if (task.status === newStatus) return;

    const prevTasks = [...tasks];

    // 1. Optimistic Update (if 'done', remove from pending tasks)
    if (newStatus === 'done') {
      setTasks(prev => prev.filter(t => t.id !== task.id));
    } else {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    }

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
      fetchMatrices(true);

    } catch (e) {
      console.error('Failed to update task status:', e);
      customAlert('Error al actualizar el estado en el servidor. Revirtiendo cambio...');
      // Revert optimistic update
      setTasks(prevTasks);
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
    const newStatus = over.id as FlexTaskStatus;

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

  const todoTasks = filteredTasks.filter(t => t.status === 'todo');
  const inProgressTasks = filteredTasks.filter(t => t.status === 'in_progress');
  const reviewTasks = filteredTasks.filter(t => t.status === 'review');

  const totalActiveTasks = tasks.filter(t => t.status === 'in_progress' || t.status === 'review').length;

  return (
    <div className="glass rounded-[24px] border border-border p-5 shadow-xl relative overflow-hidden flex flex-col h-full">
      <div className="absolute top-0 right-0 w-96 h-96 bg-accent/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
      
      {/* Header with Search & Stats */}
      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
              <KanbanSquare className="w-5 h-5 text-accent" />
              Flujo de Trabajo Global
            </h2>
            <Link 
              href="/matrices" 
              className="text-xs font-semibold text-accent hover:text-accent-light bg-accent/10 hover:bg-accent/20 px-2.5 py-1 rounded-lg border border-accent/20 transition-all flex items-center gap-1 shrink-0 ml-2"
              title="Abrir vista completa de matrices"
            >
              <Table2 className="w-3.5 h-3.5" />
              Matrices
            </Link>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            Vista unificada de todas las matrices y procesos activos
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* Search Input */}
          <div className="relative min-w-[200px] flex-1 sm:flex-initial">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-secondary pointer-events-none" />
            <input 
              type="text"
              placeholder="Buscar tarea, artista..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-8 py-1.5 text-xs bg-surface border border-border/80 rounded-xl text-text-primary placeholder:text-text-secondary/60 focus:outline-none focus:ring-1 focus:ring-accent"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary p-0.5 rounded"
                title="Limpiar búsqueda"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Artist Filter Dropdown */}
          {uniqueArtists.length > 1 && (
            <select
              value={selectedArtist}
              onChange={(e) => setSelectedArtist(e.target.value)}
              className="text-xs bg-surface border border-border/80 rounded-xl px-2.5 py-1.5 text-text-primary focus:outline-none focus:ring-1 focus:ring-accent cursor-pointer"
            >
              <option value="all">Todos los artistas ({tasks.length})</option>
              {uniqueArtists.map(a => {
                const count = tasks.filter(t => t.artistId === a.id).length;
                return (
                  <option key={a.id} value={a.id}>
                    {a.name} ({count})
                  </option>
                );
              })}
            </select>
          )}

          {/* Stat Badges */}
          <div className="flex items-center gap-4 bg-surface-elevated px-4 py-1.5 rounded-2xl border border-border/60 shadow-inner shrink-0">
            <div className="flex flex-col items-center">
              <span className="text-lg font-black text-text-primary">{tasks.length}</span>
              <span className="text-[9px] text-text-secondary uppercase font-bold tracking-wider">Total</span>
            </div>
            <div className="w-px h-6 bg-border/80" />
            <div className="flex flex-col items-center">
              <span className="text-lg font-black text-warning">{totalActiveTasks}</span>
              <span className="text-[9px] text-text-secondary uppercase font-bold tracking-wider">Activas</span>
            </div>
          </div>
        </div>
      </div>

      {/* Active Filter Notice */}
      {(searchQuery || selectedArtist !== 'all') && (
        <div className="relative z-10 flex items-center justify-between text-xs text-text-secondary bg-surface-elevated/40 px-3 py-1.5 rounded-lg border border-border/40 mb-3">
          <span>Mostrando {filteredTasks.length} de {tasks.length} tareas</span>
          <button 
            onClick={() => { setSearchQuery(''); setSelectedArtist('all'); }}
            className="text-accent hover:underline text-[11px] font-medium"
          >
            Limpiar filtros
          </button>
        </div>
      )}

      {/* Mobile Column Quick Switcher */}
      <div className="flex lg:hidden items-center gap-1.5 p-1 bg-surface-elevated/60 rounded-xl border border-border/60 mb-3 overflow-x-auto scrollbar-hide">
        <button
          onClick={() => {
            const el = document.getElementById('col-todo');
            el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
          }}
          className="flex-1 min-w-[100px] py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all text-text-primary bg-surface border border-border/40 active:scale-95 shadow-sm"
        >
          <Circle className="w-3 h-3 text-text-secondary" />
          <span className="truncate">Pendientes</span>
          <span className="text-[10px] bg-surface-elevated px-1.5 py-0.2 rounded-full text-text-secondary">{todoTasks.length}</span>
        </button>
        <button
          onClick={() => {
            const el = document.getElementById('col-in_progress');
            el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
          }}
          className="flex-1 min-w-[100px] py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all text-warning bg-warning/10 border border-warning/20 active:scale-95 shadow-sm"
        >
          <Clock className="w-3 h-3 text-warning" />
          <span className="truncate">Progreso</span>
          <span className="text-[10px] bg-warning/20 px-1.5 py-0.2 rounded-full text-warning">{inProgressTasks.length}</span>
        </button>
        <button
          onClick={() => {
            const el = document.getElementById('col-review');
            el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
          }}
          className="flex-1 min-w-[100px] py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all text-blue-400 bg-blue-500/10 border border-blue-500/20 active:scale-95 shadow-sm"
        >
          <AlertCircle className="w-3 h-3 text-blue-400" />
          <span className="truncate">Revisión</span>
          <span className="text-[10px] bg-blue-500/20 px-1.5 py-0.2 rounded-full text-blue-400">{reviewTasks.length}</span>
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide lg:grid lg:grid-cols-3 gap-4 lg:gap-6 relative z-10 flex-1 h-[500px] lg:h-full lg:min-h-0 pb-4 lg:pb-0 -mx-5 px-5 lg:mx-0 lg:px-0">
          <div id="col-todo" className="w-[85vw] sm:w-[340px] shrink-0 snap-center lg:w-auto lg:h-full lg:min-h-0">
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
          
          <div id="col-in_progress" className="w-[85vw] sm:w-[340px] shrink-0 snap-center lg:w-auto lg:h-full lg:min-h-0">
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
          
          <div id="col-review" className="w-[85vw] sm:w-[340px] shrink-0 snap-center lg:w-auto lg:h-full lg:min-h-0">
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
