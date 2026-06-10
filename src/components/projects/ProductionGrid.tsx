'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, Plus, Trash2, CheckCircle2, Clock, Eye, Circle, GripVertical, Calendar, MessageSquare, Paperclip, Settings, Play, Download, X, Link } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { ProductionGrid, FlexTaskStatus, GridCell } from '@/types';
import { useAudio } from '@/lib/contexts/AudioContext';
import { customConfirm, customAlert } from '@/lib/dialog';

import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, horizontalListSortingStrategy, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { CellComponent, COL_TYPES, STATUS_CONFIG } from './GridCells';
import type { ColumnType } from '@/types';

// --- Sortable Column Header ---
function SortableColHeader({ col, onDelete }: { col: { id: string; name: string; type?: ColumnType }; onDelete: (id: string) => void; }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const typeCfg = COL_TYPES.find(t => t.id === (col.type || 'status'));
  const Icon = typeCfg ? typeCfg.icon : Circle;

  return (
    <th
      ref={setNodeRef}
      style={style}
      className="p-3 border-b border-r border-border bg-surface/50 min-w-[150px] group relative"
    >
      <div className="flex items-center justify-center gap-1.5">
        <button {...attributes} {...listeners} className="cursor-grab text-text-secondary opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity shrink-0">
          <GripVertical className="w-3.5 h-3.5" />
        </button>
        <Icon className="w-3 h-3 text-accent shrink-0" />
        <span className="font-semibold text-sm text-center truncate">{col.name}</span>
        <button onClick={() => onDelete(col.id)} className="opacity-0 group-hover:opacity-100 text-error hover:bg-error/10 p-0.5 rounded transition-opacity shrink-0">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </th>
  );
}

// --- Sortable Row Component ---
function SortableRow({
  row,
  columns,
  onDelete,
  onCellUpdate,
  artistName,
  files,
  uploadTargetId,
}: {
  row: { id: string; name: string; cells: Record<string, GridCell> };
  columns: { id: string; name: string; type?: ColumnType }[];
  onDelete: (id: string) => void;
  onCellUpdate: (rowId: string, colId: string, updates: Partial<any>) => void;
  artistName: string;
  files: any[];
  uploadTargetId: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, position: 'relative' as const, zIndex: isDragging ? 50 : 1 };

  return (
    <tr ref={setNodeRef} style={style} className={`group/row transition-colors ${isDragging ? 'bg-surface-elevated shadow-lg' : 'hover:bg-surface/30'}`}>
      <td className="p-3 border-b border-r border-border font-medium text-sm text-text-primary bg-surface/10 max-w-[200px]">
        <div className="flex items-center gap-2">
          <button {...attributes} {...listeners} className="cursor-grab text-text-secondary opacity-0 group-hover/row:opacity-60 hover:opacity-100 transition-opacity shrink-0"><GripVertical className="w-3.5 h-3.5" /></button>
          <span className="truncate flex-1" title={row.name}>{row.name}</span>
          <button onClick={() => onDelete(row.id)} className="opacity-0 group-hover/row:opacity-100 text-error hover:bg-error/10 p-1 rounded transition-opacity shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </td>
      {columns.map(col => (
        <CellComponent
          key={col.id} rowId={row.id} colId={col.id} colType={col.type as ColumnType} cellData={row.cells[col.id] || { status: 'todo' }}
          artistName={artistName} files={files} onUpdate={onCellUpdate} uploadTargetId={uploadTargetId}
        />
      ))}
    </tr>
  );
}

// --- Main Grid Component ---
export function ProductionGridBoard({ 
  artistId, 
  matrixId, 
  matrixName = 'Matriz de Producción', 
  artistName = 'Artista' 
}: { 
  artistId: string; 
  matrixId: string; 
  matrixName?: string; 
  artistName?: string;
}) {
  const [grid, setGrid] = useState<ProductionGrid>({ columns: [], rows: [], mode: 'simple' });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColType, setNewColType] = useState<ColumnType>('status');
  const [newRowName, setNewRowName] = useState('');
  
  // Projects and Files logic
  const [projects, setProjects] = useState<any[]>([]);
  const [linkedProjectId, setLinkedProjectId] = useState<string>('');
  const [files, setFiles] = useState<any[]>([]);

  // DND sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  useEffect(() => {
    fetchGrid();
    fetchProjects();
  }, [artistId, matrixId]);

  useEffect(() => {
    if (linkedProjectId) fetchFiles(linkedProjectId);
    else setFiles([]);
  }, [linkedProjectId]);

  const fetchGrid = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/artists/${artistId}/matrices`);
      if (res.ok) {
        const data = await res.json();
        const matrix = data.matrices?.find((m: any) => m.id === matrixId);
        if (matrix) {
          setGrid(matrix.productionGrid || { columns: [], rows: [], mode: 'simple' });
          if (matrix.projectId) setLinkedProjectId(matrix.projectId);
        }
      }
    } catch (e) { console.error(e); } finally { setIsLoading(false); }
  };

  const fetchProjects = async () => {
    try {
      const res = await fetch(`/api/projects?artistId=${artistId}`);
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } catch (e) { console.error(e); }
  };

  const fetchFiles = async (projId: string) => {
    try {
      const res = await fetch(`/api/projects/${projId}`);
      if (res.ok) {
        const data = await res.json();
        const allFiles = [
          ...(data.project?.rootFiles || []),
          ...(data.folders ? data.folders.flatMap((f: any) => f.files) : [])
        ];
        setFiles(allFiles);
      }
    } catch (e) { console.error(e); }
  };

  const saveGrid = async (newGrid: ProductionGrid, newLinkedProjectId?: string) => {
    // Actualización optimista de la UI
    setGrid(newGrid);
    setIsSaving(true);
    try {
      await fetch(`/api/artists/${artistId}/matrices/${matrixId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          productionGrid: newGrid,
          projectId: newLinkedProjectId !== undefined ? newLinkedProjectId : linkedProjectId 
        })
      });
    } catch (e) { 
      console.error(e); 
      customAlert('Error guardando en Drive. Los cambios podrían no haberse sincronizado.');
    } finally { 
      setIsSaving(false); 
    }
  };

  const handleLinkProject = async (projId: string) => {
    setLinkedProjectId(projId);
    await saveGrid(grid, projId);
  };

  const addColumn = () => {
    if (!newColName.trim()) return;
    const newCol = { id: Math.random().toString(36).substring(7), name: newColName.trim(), type: newColType };
    saveGrid({ ...grid, columns: [...grid.columns, newCol] });
    setNewColName('');
  };

  const addRow = () => {
    if (!newRowName.trim()) return;
    const newRow = { id: Math.random().toString(36).substring(7), name: newRowName.trim(), cells: {} };
    saveGrid({ ...grid, rows: [...grid.rows, newRow] });
    setNewRowName('');
  };

  const deleteColumn = async (id: string) => {
    if (!await customConfirm('Eliminar columna y sus datos?')) return;
    saveGrid({ ...grid, columns: grid.columns.filter(c => c.id !== id) });
  };

  const deleteRow = async (id: string) => {
    if (!await customConfirm('Eliminar fila?')) return;
    saveGrid({ ...grid, rows: grid.rows.filter(r => r.id !== id) });
  };

  const handleCellUpdate = (rowId: string, colId: string, updates: Partial<any>) => {
    const newRows = grid.rows.map(r => {
      if (r.id !== rowId) return r;
      const updatedCell = { ...(r.cells[colId] || { status: 'todo' }), ...updates };
      return { ...r, cells: { ...r.cells, [colId]: updatedCell } };
    });
    saveGrid({ ...grid, rows: newRows });
  };

  const handleColDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = grid.columns.findIndex(c => c.id === active.id);
    const newIdx = grid.columns.findIndex(c => c.id === over.id);
    saveGrid({ ...grid, columns: arrayMove(grid.columns, oldIdx, newIdx) });
  };

  const handleRowDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = grid.rows.findIndex(r => r.id === active.id);
    const newIdx = grid.rows.findIndex(r => r.id === over.id);
    saveGrid({ ...grid, rows: arrayMove(grid.rows, oldIdx, newIdx) });
  };

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-accent" /></div>;

  const totalCells = grid.columns.length * grid.rows.length;
  const doneCells = grid.rows.reduce((acc, row) => acc + Object.values(row.cells).filter(c => c.status === 'done').length, 0);
  const progress = totalCells === 0 ? 0 : Math.round((doneCells / totalCells) * 100);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold">{matrixName}</h3>
          <p className="text-sm text-text-secondary">Trackeo modular por canción y fase.</p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className="flex items-center gap-2 bg-surface-elevated px-3 py-1.5 rounded-lg border border-border">
            <span className="text-xs font-bold text-text-secondary uppercase">Proyecto:</span>
            <select 
              value={linkedProjectId} 
              onChange={(e) => handleLinkProject(e.target.value)}
              className="bg-transparent text-sm font-medium outline-none text-accent"
            >
              <option value="">-- Sin Proyecto Vinculado --</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm font-bold text-text-secondary">{progress}% Completado</div>
            {isSaving && <Loader2 className="w-4 h-4 animate-spin text-accent" />}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto bg-surface-elevated/30 rounded-xl border border-border shadow-sm">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleColDragEnd}>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr>
                <th className="p-3 border-b border-r border-border bg-surface/50 w-64 min-w-[200px]">
                  <div className="flex items-center gap-1">
                    <Input placeholder="Nueva fila..." value={newRowName} onChange={e => setNewRowName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addRow()} className="h-7 text-xs bg-transparent w-full" />
                    <Button size="sm" variant="ghost" onClick={addRow} disabled={!newRowName.trim()} className="h-7 px-1.5 shrink-0"><Plus className="w-3.5 h-3.5" /></Button>
                  </div>
                </th>

                <SortableContext items={grid.columns.map(c => c.id)} strategy={horizontalListSortingStrategy}>
                  {grid.columns.map(col => <SortableColHeader key={col.id} col={col} onDelete={deleteColumn} />)}
                </SortableContext>

                <th className="p-2 border-b border-border bg-surface/50 min-w-[140px] max-w-[200px]">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-1">
                      <select value={newColType} onChange={e => setNewColType(e.target.value as ColumnType)} className="h-7 text-xs bg-surface-elevated border border-border rounded px-1 outline-none text-text-secondary w-full">
                        {COL_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center gap-1">
                      <Input placeholder="+ Fase..." value={newColName} onChange={e => setNewColName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addColumn()} className="h-7 text-xs bg-transparent w-full" />
                      <Button size="sm" variant="ghost" onClick={addColumn} disabled={!newColName.trim()} className="h-7 px-1.5 shrink-0"><Plus className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                </th>
              </tr>
            </thead>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleRowDragEnd}>
              <tbody>
                <SortableContext items={grid.rows.map(r => r.id)} strategy={verticalListSortingStrategy}>
                  {grid.rows.map(row => (
                    <SortableRow
                      key={row.id} row={row} columns={grid.columns} onDelete={deleteRow} onCellUpdate={handleCellUpdate}
                      artistName={artistName} files={files} uploadTargetId={linkedProjectId || artistId}
                    />
                  ))}
                </SortableContext>
                {grid.rows.length === 0 && (
                  <tr>
                    <td colSpan={grid.columns.length + 2} className="p-12 text-center text-text-secondary border-b border-border">
                      <div className="flex flex-col items-center justify-center opacity-50">
                        <Plus className="w-8 h-8 mb-2" />
                        <p>Empieza añadiendo columnas (fases) y filas (canciones).</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </DndContext>
          </table>
        </DndContext>
      </div>

      <div className="flex items-center gap-6 justify-center pt-2 text-xs text-text-secondary">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
          const Icon = cfg.icon;
          return <div key={key} className="flex items-center gap-1.5"><Icon className={`w-4 h-4 ${cfg.color}`} /><span>{cfg.label}</span></div>;
        })}
        <span className="text-text-secondary/50 italic">· Mantén pulsado un estado para menú circular</span>
      </div>
    </div>
  );
}
