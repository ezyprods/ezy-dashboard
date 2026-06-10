'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, Plus, Trash2, CheckCircle2, Clock, Circle, GripVertical, FileText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { ProductionGrid, FlexTaskStatus } from '@/types';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, horizontalListSortingStrategy, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const PAYMENT_STATUS_CONFIG: Record<FlexTaskStatus, { label: string; icon: typeof Circle; color: string; bgColor: string }> = {
  todo: { label: 'Sin Acción', icon: Circle, color: 'text-text-secondary', bgColor: 'bg-surface' },
  in_progress: { label: 'Facturado', icon: FileText, color: 'text-accent', bgColor: 'bg-accent/10' },
  review: { label: 'Pendiente Pago', icon: Clock, color: 'text-warning', bgColor: 'bg-warning/10' },
  done: { label: 'Pagado', icon: CheckCircle2, color: 'text-success', bgColor: 'bg-success/10' },
};

const NEXT_STATUS: Record<FlexTaskStatus, FlexTaskStatus> = {
  todo: 'in_progress',
  in_progress: 'review',
  review: 'done',
  done: 'todo'
};

function StatusCell({
  status,
  onStatusChange,
}: {
  status: FlexTaskStatus;
  onStatusChange: (s: FlexTaskStatus) => void;
}) {
  const [showRadial, setShowRadial] = useState(false);
  const [hovered, setHovered] = useState<FlexTaskStatus | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const cfg = PAYMENT_STATUS_CONFIG[status];
  const Icon = cfg.icon;

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    longPressTimer.current = setTimeout(() => {
      setShowRadial(true);
    }, 400);
  };

  const handlePointerUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (hovered) {
      onStatusChange(hovered);
    }
    setShowRadial(false);
    setHovered(null);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!showRadial || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 12) {
      setHovered(null);
      return;
    }
    const angle = Math.atan2(dy, dx);
    const positions: [FlexTaskStatus, number][] = [
      ['in_progress', 0],
      ['review', -Math.PI / 2],
      ['done', Math.PI],
      ['todo', Math.PI / 2],
    ];
    let closest: FlexTaskStatus = 'todo';
    let minDiff = Infinity;
    for (const [s, a] of positions) {
      let diff = Math.abs(angle - a);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff < minDiff) {
        minDiff = diff;
        closest = s;
      }
    }
    setHovered(closest);
  };

  const handlePointerLeave = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleClick = () => {
    if (!showRadial) {
      onStatusChange(NEXT_STATUS[status]);
    }
  };

  const radialItems: { s: FlexTaskStatus; x: number; y: number }[] = [
    { s: 'in_progress', x: 44, y: 0 },
    { s: 'review',      x: 0,  y: -44 },
    { s: 'done',        x: -44, y: 0 },
    { s: 'todo',        x: 0,  y: 44 },
  ];

  return (
    <div
      ref={containerRef}
      className="relative flex items-center justify-center select-none"
      style={{ userSelect: 'none', touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick}
    >
      <button
        className={`w-full py-2 flex justify-center items-center rounded transition-colors ${cfg.bgColor} hover:brightness-110`}
        title={cfg.label}
        type="button"
        style={{ pointerEvents: 'none' }}
      >
        <Icon className={`w-5 h-5 ${cfg.color}`} />
      </button>

      {showRadial && (
        <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center">
          {radialItems.map(({ s, x, y }) => {
            const scfg = PAYMENT_STATUS_CONFIG[s];
            const SIcon = scfg.icon;
            const isHov = hovered === s;
            return (
              <div
                key={s}
                className={`absolute flex items-center justify-center rounded-full border-2 transition-all duration-100 ${
                  isHov
                    ? 'w-10 h-10 border-accent shadow-lg shadow-accent/40 bg-surface-elevated scale-110'
                    : 'w-8 h-8 border-border bg-surface'
                }`}
                style={{ transform: `translate(${x}px, ${y}px)` }}
                title={scfg.label}
              >
                <SIcon className={`w-4 h-4 ${scfg.color}`} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SortableColHeader({
  col,
  onDelete,
}: {
  col: { id: string; name: string };
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <th
      ref={setNodeRef}
      style={style}
      className="p-3 border-b border-r border-border bg-surface/50 min-w-[120px] group relative"
    >
      <div className="flex items-center justify-center gap-1">
        <button {...attributes} {...listeners} className="cursor-grab text-text-secondary opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity shrink-0">
          <GripVertical className="w-3.5 h-3.5" />
        </button>
        <span className="font-semibold text-sm text-center">{col.name}</span>
        <button
          onClick={() => onDelete(col.id)}
          className="opacity-0 group-hover:opacity-100 text-error hover:bg-error/10 p-0.5 rounded transition-opacity"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </th>
  );
}

function SortableRow({
  row,
  columns,
  mode,
  onDelete,
  onCellChange,
}: {
  row: { id: string; name: string; cells: Record<string, { status: FlexTaskStatus }> };
  columns: { id: string; name: string }[];
  mode: 'simple' | 'interconnected';
  onDelete: (id: string) => void;
  onCellChange: (rowId: string, colId: string, status: FlexTaskStatus) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <tr ref={setNodeRef} style={style} className="group/row hover:bg-surface/30 transition-colors">
      <td className="p-3 border-b border-r border-border font-medium text-sm">
        <div className="flex items-center justify-between gap-2">
          {mode === 'simple' ? (
            <button {...attributes} {...listeners} className="cursor-grab text-text-secondary opacity-0 group-hover/row:opacity-60 hover:opacity-100 transition-opacity shrink-0">
              <GripVertical className="w-3.5 h-3.5" />
            </button>
          ) : (
            <div className="w-3.5 h-3.5 shrink-0" />
          )}
          <span className="flex-1 truncate" title={row.name}>{row.name}</span>
          {mode === 'simple' && (
            <button onClick={() => onDelete(row.id)} className="opacity-0 group-hover/row:opacity-100 text-error hover:bg-error/10 p-1 rounded">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </td>
      {columns.map(col => {
        const cell = row.cells[col.id] || { status: 'todo' as FlexTaskStatus };
        return (
          <td key={col.id} className="p-2 border-b border-r border-border text-center">
            <StatusCell
              status={cell.status as FlexTaskStatus}
              onStatusChange={(s) => onCellChange(row.id, col.id, s)}
            />
          </td>
        );
      })}
      <td className="p-3 border-b border-border bg-surface/10" />
    </tr>
  );
}

export function PaymentGridBoard({ projectId }: { projectId: string }) {
  const [grid, setGrid] = useState<ProductionGrid>({ columns: [], rows: [], mode: 'interconnected' });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newRowName, setNewRowName] = useState('');
  const [files, setFiles] = useState<any[]>([]);

  const colSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const rowSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => { fetchGrid(); }, [projectId]);

  const fetchGrid = async () => {
    setIsLoading(true);
    try {
      const [resTasks, resProj] = await Promise.all([
        fetch(`/api/projects/${projectId}/tasks`),
        fetch(`/api/projects/${projectId}`)
      ]);
      const data = await resTasks.json();
      const projData = await resProj.json();
      
      const allFiles = [
        ...(projData.rootFiles || []),
        ...(projData.folders ? projData.folders.flatMap((f: any) => f.files) : [])
      ];
      setFiles(allFiles);
      
      const g: ProductionGrid = data.paymentGrid || { columns: [{id: 'col1', name: 'Adelanto'}, {id: 'col2', name: 'Restante'}], rows: [] };
      if (!g.mode) g.mode = 'interconnected';
      setGrid(g);
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
        body: JSON.stringify({ paymentGrid: newGrid }),
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

  const handleCellChange = (rowId: string, colId: string, status: FlexTaskStatus) => {
    const newRows = grid.rows.map(r => {
      if (r.id !== rowId) return r;
      const currentCell = r.cells[colId] || { status: 'todo' };
      return { ...r, cells: { ...r.cells, [colId]: { ...currentCell, status } } };
    });
    // Si la fila no existía (estamos en interconnected mode y clickeamos un archivo), la creamos
    if (!newRows.find(r => r.id === rowId)) {
      const file = files.find(f => f.id === rowId);
      if (file) {
        newRows.push({
          id: file.id,
          name: file.name,
          cells: { [colId]: { status } }
        });
      }
    }
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
    if (grid.mode === 'interconnected') return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = grid.rows.findIndex(r => r.id === active.id);
    const newIdx = grid.rows.findIndex(r => r.id === over.id);
    saveGrid({ ...grid, rows: arrayMove(grid.rows, oldIdx, newIdx) });
  };

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-accent" /></div>;

  const displayRows = grid.mode === 'interconnected' 
    ? files.map(f => {
        const existing = grid.rows.find(r => r.id === f.id);
        return { id: f.id, name: f.name, cells: existing ? existing.cells : {} };
      })
    : grid.rows;

  return (
    <div className="space-y-6 animate-fade-in mt-6">
      <div className="overflow-x-auto bg-surface-elevated/30 rounded-xl border border-border mt-4">
        <DndContext sensors={colSensors} collisionDetection={closestCenter} onDragEnd={handleColDragEnd}>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr>
                <th className="p-3 border-b border-r border-border bg-surface/50 w-56 min-w-[180px]">
                  {grid.mode === 'simple' ? (
                    <div className="flex items-center gap-1">
                      <Input
                        placeholder="Nueva fila..."
                        value={newRowName}
                        onChange={e => setNewRowName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addRow()}
                        className="h-7 text-xs bg-transparent w-full"
                      />
                      <Button size="sm" variant="ghost" onClick={addRow} disabled={!newRowName.trim()} className="h-7 px-1.5 shrink-0"><Plus className="w-3.5 h-3.5" /></Button>
                    </div>
                  ) : (
                    <div className="text-xs text-text-secondary font-medium uppercase tracking-wider">Archivos (Cobros)</div>
                  )}
                </th>

                <SortableContext items={grid.columns.map(c => c.id)} strategy={horizontalListSortingStrategy}>
                  {grid.columns.map(col => (
                    <SortableColHeader key={col.id} col={col} onDelete={deleteColumn} />
                  ))}
                </SortableContext>

                <th className="p-2 border-b border-border bg-surface/50 min-w-[130px] max-w-[160px]">
                  <div className="flex items-center gap-1">
                    <Input
                      placeholder="+ Fase de cobro..."
                      value={newColName}
                      onChange={e => setNewColName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addColumn()}
                      className="h-7 text-xs bg-transparent w-full"
                    />
                    <Button size="sm" variant="ghost" onClick={addColumn} disabled={!newColName.trim()} className="h-7 px-1.5 shrink-0"><Plus className="w-3.5 h-3.5" /></Button>
                  </div>
                </th>
              </tr>
            </thead>

            <DndContext sensors={rowSensors} collisionDetection={closestCenter} onDragEnd={handleRowDragEnd}>
              <tbody>
                <SortableContext items={displayRows.map(r => r.id)} strategy={verticalListSortingStrategy}>
                  {displayRows.map(row => (
                    <SortableRow
                      key={row.id}
                      row={row}
                      columns={grid.columns}
                      mode={grid.mode || 'interconnected'}
                      onDelete={deleteRow}
                      onCellChange={handleCellChange}
                    />
                  ))}
                </SortableContext>
                {displayRows.length === 0 && (
                  <tr>
                    <td colSpan={grid.columns.length + 2} className="p-8 text-center text-text-secondary border-b border-border">
                      {grid.mode === 'interconnected' ? 'Sube archivos al proyecto para empezar a cobrar por ellos.' : 'Añade filas para empezar.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </DndContext>
          </table>
        </DndContext>
      </div>

      <div className="flex items-center gap-6 justify-center pt-2 text-xs text-text-secondary">
        {Object.entries(PAYMENT_STATUS_CONFIG).map(([key, cfg]) => {
          const Icon = cfg.icon;
          return (
            <div key={key} className="flex items-center gap-1.5">
              <Icon className={`w-4 h-4 ${cfg.color}`} />
              <span>{cfg.label}</span>
            </div>
          );
        })}
        <span className="text-text-secondary/50 italic">· Mantén pulsado para menú rápido</span>
      </div>
    </div>
  );
}
