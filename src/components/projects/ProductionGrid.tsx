'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Plus, GripVertical, Trash2, Settings2, CheckCircle2, Clock, Eye, Circle, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { ProductionGrid, FlexTaskStatus } from '@/types';

const STATUS_CONFIG: Record<FlexTaskStatus, { label: string; icon: typeof Circle; color: string; bgColor: string }> = {
  todo: { label: 'Pendiente', icon: Circle, color: 'text-text-secondary', bgColor: 'bg-surface' },
  in_progress: { label: 'En progreso', icon: Clock, color: 'text-accent', bgColor: 'bg-accent/10' },
  review: { label: 'Revisión', icon: Eye, color: 'text-warning', bgColor: 'bg-warning/10' },
  done: { label: 'Hecho', icon: CheckCircle2, color: 'text-success', bgColor: 'bg-success/10' },
};

const NEXT_STATUS: Record<FlexTaskStatus, FlexTaskStatus> = {
  todo: 'in_progress',
  in_progress: 'review',
  review: 'done',
  done: 'todo'
};

export function ProductionGridBoard({ projectId }: { projectId: string }) {
  const [grid, setGrid] = useState<ProductionGrid>({ columns: [], rows: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newRowName, setNewRowName] = useState('');
  
  useEffect(() => { fetchGrid(); }, [projectId]);

  const fetchGrid = async () => {
    setIsLoading(true);
    try {
      // Re-using the tasks API to store the entire project config extensions
      const res = await fetch(`/api/projects/${projectId}/tasks`);
      const data = await res.json();
      setGrid(data.productionGrid || { columns: [], rows: [] });
    } catch (err) { console.error(err); }
    finally { setIsLoading(false); }
  };

  const saveGrid = useCallback(async (newGrid: ProductionGrid) => {
    setGrid(newGrid);
    setIsSaving(true);
    try {
      await fetch(`/api/projects/${projectId}/tasks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productionGrid: newGrid }),
      });
    } catch (err) { console.error(err); }
    finally { setIsSaving(false); }
  }, [projectId]);

  const addColumn = () => {
    if (!newColName.trim()) return;
    const newCol = { id: Math.random().toString(36).slice(2), name: newColName.trim() };
    saveGrid({ ...grid, columns: [...grid.columns, newCol] });
    setNewColName('');
  };

  const addRow = () => {
    if (!newRowName.trim()) return;
    const newRow = { id: Math.random().toString(36).slice(2), name: newRowName.trim(), cells: {} };
    saveGrid({ ...grid, rows: [...grid.rows, newRow] });
    setNewRowName('');
  };

  const deleteColumn = (colId: string) => {
    const newGrid = {
      ...grid,
      columns: grid.columns.filter(c => c.id !== colId),
      rows: grid.rows.map(r => {
        const newCells = { ...r.cells };
        delete newCells[colId];
        return { ...r, cells: newCells };
      })
    };
    saveGrid(newGrid);
  };

  const deleteRow = (rowId: string) => {
    saveGrid({ ...grid, rows: grid.rows.filter(r => r.id !== rowId) });
  };

  const cycleCellStatus = (rowId: string, colId: string) => {
    const row = grid.rows.find(r => r.id === rowId);
    if (!row) return;
    
    const currentCell = row.cells[colId] || { status: 'todo' };
    const nextStatus = NEXT_STATUS[currentCell.status];
    
    const newRows = grid.rows.map(r => {
      if (r.id === rowId) {
        return { ...r, cells: { ...r.cells, [colId]: { ...currentCell, status: nextStatus } } };
      }
      return r;
    });
    
    saveGrid({ ...grid, rows: newRows });
  };

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-accent" /></div>;

  const totalCells = grid.columns.length * grid.rows.length;
  const doneCells = grid.rows.reduce((acc, row) => {
    return acc + Object.values(row.cells).filter(c => c.status === 'done').length;
  }, 0);
  const progress = totalCells === 0 ? 0 : Math.round((doneCells / totalCells) * 100);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold">Matriz de Producción</h3>
          <p className="text-sm text-text-secondary">Trackeo modular por canción y fase.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-text-secondary">{progress}% Completado</div>
          {isSaving && <Loader2 className="w-4 h-4 animate-spin text-accent" />}
        </div>
      </div>

      <div className="overflow-x-auto bg-surface-elevated/30 rounded-xl border border-border">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr>
              <th className="p-3 border-b border-r border-border bg-surface/50 w-64 min-w-[200px]">
                <div className="flex items-center gap-2">
                  <Input 
                    placeholder="Nueva fila (ej. Canción 1)" 
                    value={newRowName}
                    onChange={e => setNewRowName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addRow()}
                    className="h-8 text-xs bg-transparent"
                  />
                  <Button size="sm" variant="ghost" onClick={addRow} disabled={!newRowName.trim()} className="h-8 px-2"><Plus className="w-4 h-4" /></Button>
                </div>
              </th>
              {grid.columns.map(col => (
                <th key={col.id} className="p-3 border-b border-r border-border bg-surface/50 min-w-[120px] group relative">
                  <div className="font-semibold text-sm text-center">{col.name}</div>
                  <button onClick={() => deleteColumn(col.id)} className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-error hover:bg-error/10 p-1 rounded">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </th>
              ))}
              <th className="p-3 border-b border-border bg-surface/50 min-w-[150px]">
                <div className="flex items-center gap-2">
                  <Input 
                    placeholder="Fase (ej. Mezcla)" 
                    value={newColName}
                    onChange={e => setNewColName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addColumn()}
                    className="h-8 text-xs bg-transparent"
                  />
                  <Button size="sm" variant="ghost" onClick={addColumn} disabled={!newColName.trim()} className="h-8 px-2"><Plus className="w-4 h-4" /></Button>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {grid.rows.map(row => (
              <tr key={row.id} className="group/row hover:bg-surface/30 transition-colors">
                <td className="p-3 border-b border-r border-border font-medium text-sm flex items-center justify-between">
                  {row.name}
                  <button onClick={() => deleteRow(row.id)} className="opacity-0 group-hover/row:opacity-100 text-error hover:bg-error/10 p-1 rounded">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
                {grid.columns.map(col => {
                  const cell = row.cells[col.id] || { status: 'todo' };
                  const cfg = STATUS_CONFIG[cell.status as FlexTaskStatus];
                  const Icon = cfg.icon;
                  
                  return (
                    <td key={col.id} className="p-2 border-b border-r border-border text-center">
                      <button 
                        onClick={() => cycleCellStatus(row.id, col.id)}
                        className={`w-full py-2 flex justify-center items-center rounded transition-colors ${cfg.bgColor} hover:brightness-110`}
                        title={cfg.label}
                      >
                        <Icon className={`w-5 h-5 ${cfg.color}`} />
                      </button>
                    </td>
                  );
                })}
                <td className="p-3 border-b border-border bg-surface/10"></td>
              </tr>
            ))}
            {grid.rows.length === 0 && (
              <tr>
                <td colSpan={grid.columns.length + 2} className="p-8 text-center text-text-secondary border-b border-border">
                  Empieza añadiendo columnas (fases) y filas (canciones).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {/* Legend */}
      <div className="flex items-center gap-6 justify-center pt-4">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
          const Icon = cfg.icon;
          return (
            <div key={key} className="flex items-center gap-2 text-xs text-text-secondary">
              <Icon className={`w-4 h-4 ${cfg.color}`} />
              <span>{cfg.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
