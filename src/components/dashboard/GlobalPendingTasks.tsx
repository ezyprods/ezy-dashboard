'use client';

import { useState, useEffect } from 'react';
import { Loader2, KanbanSquare, Circle, Clock, AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useContextMenu } from '@/lib/contexts/ContextMenuContext';

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
  status: 'todo' | 'in_progress' | 'review';
}

export function GlobalPendingTasks() {
  const [tasks, setTasks] = useState<PendingTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { showMenu } = useContextMenu();

  useEffect(() => {
    fetch('/api/dashboard/matrices')
      .then(res => res.json())
      .then(data => {
        const matrices = data.matrices || [];
        const extracted: PendingTask[] = [];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        matrices.forEach((m: any) => {
          if (!m.productionGrid || !m.productionGrid.rows || !m.productionGrid.columns) return;
          
          // Map column IDs to Names
          const colMap: Record<string, string> = {};
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          m.productionGrid.columns.forEach((c: any) => {
            colMap[c.id] = c.name;
          });

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
                  status: cell.status
                });
              }
            });
          });
        });

        // Sort by artist name, then matrix, then row to keep it somewhat stable
        extracted.sort((a, b) => a.artistName.localeCompare(b.artistName) || a.rowName.localeCompare(b.rowName));

        setTasks(extracted);
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Error fetching global tasks', err);
        setIsLoading(false);
      });
  }, []);

  const todoTasks = tasks.filter(t => t.status === 'todo');
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress');
  const reviewTasks = tasks.filter(t => t.status === 'review');

  const renderColumn = (
    title: string, 
    icon: React.ReactNode, 
    columnTasks: PendingTask[], 
    bgColor: string, 
    textColor: string, 
    borderColor: string
  ) => (
    <div className="flex flex-col h-[500px] bg-surface-elevated/50 rounded-2xl border border-border/50 overflow-hidden shadow-inner">
      <div className={cn("p-4 border-b border-border/50 flex items-center justify-between", bgColor)}>
        <div className="flex items-center gap-2">
          {icon}
          <h3 className={cn("font-bold text-sm", textColor)}>{title}</h3>
        </div>
        <span className={cn("text-xs px-2.5 py-1 rounded-full font-bold bg-background/50 backdrop-blur-sm shadow-sm", textColor)}>
          {columnTasks.length}
        </span>
      </div>
      
      <div className="flex-1 p-3 overflow-y-auto custom-scrollbar space-y-3">
        {columnTasks.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-40 text-text-secondary">
            <CheckCircle2 className="w-8 h-8 mb-2" />
            <span className="text-xs font-medium">No hay tareas</span>
          </div>
        ) : (
          columnTasks.map(task => (
            <Link
              key={task.id}
              href={`/artists/${task.artistId}?tab=matrices`}
              onContextMenu={(e) => {
                e.preventDefault();
                showMenu(e.clientX, e.clientY, [
                  { label: 'Ir a Matriz', icon: 'KanbanSquare', action: () => window.location.href = `/artists/${task.artistId}?tab=matrices` }
                ]);
              }}
              className={cn(
                "block p-3.5 rounded-xl border transition-all hover:-translate-y-0.5 hover:shadow-md group",
                borderColor,
                "bg-surface hover:bg-surface-elevated"
              )}
            >
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-bold tracking-wider uppercase bg-surface-elevated px-2 py-0.5 rounded text-text-secondary truncate max-w-[120px]">
                  {task.artistName}
                </span>
                <span className="text-[10px] text-text-secondary flex items-center gap-1 bg-surface-elevated px-2 py-0.5 rounded">
                  <KanbanSquare className="w-3 h-3" />
                  <span className="truncate max-w-[80px]">{task.matrixName}</span>
                </span>
              </div>
              
              <h4 className="font-semibold text-text-primary text-sm mb-1 line-clamp-2 leading-tight group-hover:text-accent transition-colors">
                {task.rowName}
              </h4>
              
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/40">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent/50" />
                  <span className="text-[11px] font-medium text-text-secondary truncate max-w-[150px]">
                    {task.colName}
                  </span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="glass rounded-[24px] border border-border p-8 min-h-[400px] flex flex-col items-center justify-center animate-pulse">
        <Loader2 className="w-8 h-8 animate-spin text-accent mb-4" />
        <p className="text-text-secondary font-medium">Cargando centro de tareas...</p>
      </div>
    );
  }

  return (
    <div className="glass rounded-[24px] border border-border p-6 shadow-xl relative overflow-hidden mt-8">
      {/* Decorative background element */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-accent/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
      
      <div className="relative z-10 flex items-center justify-between mb-8">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10">
        {renderColumn(
          "Pendientes", 
          <Circle className="w-4 h-4 text-text-secondary" />, 
          todoTasks,
          "bg-surface-elevated/30",
          "text-text-primary",
          "border-border/60 hover:border-text-secondary/50"
        )}
        
        {renderColumn(
          "En Progreso", 
          <Clock className="w-4 h-4 text-warning" />, 
          inProgressTasks,
          "bg-warning/10",
          "text-warning",
          "border-warning/20 hover:border-warning/50"
        )}
        
        {renderColumn(
          "En Revisión", 
          <AlertCircle className="w-4 h-4 text-blue-400" />, 
          reviewTasks,
          "bg-blue-500/10",
          "text-blue-400",
          "border-blue-500/20 hover:border-blue-500/50"
        )}
      </div>
    </div>
  );
}
