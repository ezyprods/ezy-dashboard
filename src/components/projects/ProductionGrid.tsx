'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, Plus, Trash2, CheckCircle2, Clock, Eye, Circle, GripVertical, Calendar, MessageSquare, Paperclip, Settings, Play, Download, X, Link } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { ProductionGrid, FlexTaskStatus } from '@/types';
import { useAudio } from '@/lib/contexts/AudioContext';
import { customConfirm, customAlert } from '@/lib/dialog';

import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, horizontalListSortingStrategy, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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

const STATUSES: FlexTaskStatus[] = ['todo', 'in_progress', 'review', 'done'];

interface GridCellData {
  status: FlexTaskStatus;
  fileId?: string;
  fileName?: string;
  notes?: string;
  dueDate?: string;
}

// --- Radial Status Picker cell ---
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

  const cfg = STATUS_CONFIG[status];
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
      ['in_progress', 0],      // right
      ['review', -Math.PI / 2], // top
      ['done', Math.PI],        // left
      ['todo', Math.PI / 2],    // bottom
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
      className="relative flex items-center justify-center select-none w-full"
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
            const scfg = STATUS_CONFIG[s];
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

// --- Sortable Column Header ---
function SortableColHeader({ col, onDelete }: { col: { id: string; name: string }; onDelete: (id: string) => void; }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <th
      ref={setNodeRef}
      style={style}
      className="p-3 border-b border-r border-border bg-surface/50 min-w-[150px] group relative"
    >
      <div className="flex items-center justify-center gap-1">
        <button {...attributes} {...listeners} className="cursor-grab text-text-secondary opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity shrink-0">
          <GripVertical className="w-3.5 h-3.5" />
        </button>
        <span className="font-semibold text-sm text-center">{col.name}</span>
        <button onClick={() => onDelete(col.id)} className="opacity-0 group-hover:opacity-100 text-error hover:bg-error/10 p-0.5 rounded transition-opacity">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </th>
  );
}

// --- Interactive Cell Component ---
function CellComponent({
  rowId,
  colId,
  cellData,
  artistName,
  files,
  onUpdate,
  uploadTargetId,
}: {
  rowId: string;
  colId: string;
  cellData: GridCellData;
  artistName: string;
  files: any[];
  onUpdate: (rowId: string, colId: string, updates: Partial<GridCellData>) => void;
  uploadTargetId: string;
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const { currentTrack, isPlaying, playTrack, togglePlay } = useAudio();

  const handleStatusChange = (status: FlexTaskStatus) => onUpdate(rowId, colId, { status });

  const isAudioFile = cellData.fileName?.match(/\.(mp3|wav|m4a|aac|flac|ogg)$/i);
  const isCurrentAudioPlaying = isPlaying && currentTrack?.id === cellData.fileId;

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!cellData.fileId || !cellData.fileName) return;

    if (currentTrack?.id === cellData.fileId) {
      togglePlay();
    } else {
      playTrack({
        id: cellData.fileId,
        name: cellData.fileName.replace(/\.[^/.]+$/, ''),
        url: `/api/audio/${cellData.fileId}`,
        artistName: artistName,
      });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('parentId', uploadTargetId);

    try {
      const res = await fetch('/api/files', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Error al subir el archivo');
      const json = await res.json();
      
      onUpdate(rowId, colId, {
        fileId: json.file.id,
        fileName: json.file.name,
        status: 'done',
      });
      setIsModalOpen(false);
    } catch (err) { customAlert('Error subiendo archivo'); } finally { setIsUploading(false); }
  };

  return (
    <td className="p-2 border-b border-r border-border text-center relative group/cell min-w-[160px] max-w-[240px]">
      <div className="flex flex-col items-center gap-1 w-full">
        <StatusCell status={cellData.status || 'todo'} onStatusChange={handleStatusChange} />

        {(cellData.fileId || cellData.notes || cellData.dueDate) && (
          <div className="flex items-center gap-2 mt-1 px-1 py-0.5 rounded bg-surface/40 border border-border/30 w-full justify-center text-[10px] text-text-secondary select-none">
            {cellData.fileId && (
              <div className="flex items-center gap-1 truncate max-w-[90px]" title={cellData.fileName}>
                {isAudioFile ? (
                  <button onClick={handlePlayClick} className={`p-0.5 rounded-full ${isCurrentAudioPlaying ? 'bg-success/20 text-success' : 'bg-accent/10 text-accent'} hover:scale-105 transition-transform`}>
                    {isCurrentAudioPlaying ? <span className="flex items-center justify-center w-3 h-3 text-[8px] font-bold">||</span> : <Play className="w-2.5 h-2.5 fill-current ml-0.5" />}
                  </button>
                ) : (
                  <Paperclip className="w-2.5 h-2.5 shrink-0" />
                )}
                <span className="truncate">{cellData.fileName}</span>
              </div>
            )}
            {cellData.notes && (
              <span title={cellData.notes} className="shrink-0 flex items-center">
                <MessageSquare className="w-2.5 h-2.5 text-accent-light" />
              </span>
            )}
            {cellData.dueDate && (
              <div className={`flex items-center gap-0.5 font-mono text-[9px] px-1 rounded-sm ${new Date(cellData.dueDate) < new Date() && cellData.status !== 'done' ? 'bg-error/10 text-error' : 'bg-surface border border-border/55'}`}>
                <Calendar className="w-2 h-2 shrink-0" />
                <span>{new Date(cellData.dueDate).toLocaleDateString(undefined, {month: 'numeric', day: 'numeric'})}</span>
              </div>
            )}
          </div>
        )}
      </div>

      <button onClick={(e) => { e.stopPropagation(); setIsModalOpen(true); }} className="absolute top-1 right-1 opacity-0 group-hover/cell:opacity-100 p-1 rounded bg-surface-elevated hover:bg-surface border border-border transition-all shadow-md z-10" title="Detalles y Vinculación">
        <Settings className="w-3.5 h-3.5 text-text-secondary hover:text-text-primary" />
      </button>

      {isModalOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[150] flex items-center justify-center p-4" onClick={() => setIsModalOpen(false)}>
          <div className="glass rounded-xl border border-border bg-surface w-full max-w-md p-6 space-y-6 shadow-2xl relative animate-fade-in text-left" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setIsModalOpen(false)} className="absolute top-4 right-4 text-text-secondary hover:text-text-primary p-1"><X className="w-5 h-5" /></button>

            <div>
              <h4 className="text-lg font-bold text-text-primary">Detalles de la Celda</h4>
              <p className="text-xs text-text-secondary mt-1">Vincula archivos y establece plazos.</p>
            </div>

            {/* Status */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-text-secondary uppercase tracking-wider">Estado</label>
              <div className="grid grid-cols-4 gap-2">
                {STATUSES.map(s => {
                  const cfg = STATUS_CONFIG[s];
                  const SIcon = cfg.icon;
                  const isSelected = (cellData.status || 'todo') === s;
                  return (
                    <button key={s} onClick={() => handleStatusChange(s)} className={`flex flex-col items-center justify-center p-2 rounded-lg border text-xs font-medium transition-colors ${isSelected ? 'border-accent bg-accent/10 text-text-primary' : 'border-border bg-surface/50 text-text-secondary hover:border-accent-light'}`}>
                      <SIcon className={`w-4 h-4 mb-1 ${cfg.color}`} />
                      <span>{cfg.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* File Selection */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-text-secondary uppercase tracking-wider">Archivo Vinculado</label>
              <select 
                value={cellData.fileId || ''} 
                onChange={(e) => {
                  const id = e.target.value;
                  if (!id) { onUpdate(rowId, colId, { fileId: '', fileName: '' }); return; }
                  const file = files.find(f => f.id === id);
                  if (file) onUpdate(rowId, colId, { fileId: file.id, fileName: file.name });
                }}
                className="w-full bg-surface-elevated text-sm text-text-primary border border-border rounded-lg p-2.5 outline-none focus:border-accent"
              >
                <option value="">-- Ningún archivo vinculado --</option>
                {files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>

              <div className="flex items-center gap-2 pt-2">
                <div className="h-px bg-border flex-1"></div>
                <span className="text-xs text-text-secondary">O</span>
                <div className="h-px bg-border flex-1"></div>
              </div>

              <div className="flex gap-2 items-center">
                <Input
                  type="file"
                  onChange={handleFileUpload}
                  className="hidden"
                  id={`file-upload-${rowId}-${colId}`}
                />
                <label
                  htmlFor={`file-upload-${rowId}-${colId}`}
                  className="flex-1 flex items-center justify-center gap-2 bg-surface-elevated hover:bg-surface border border-border rounded-lg p-2.5 cursor-pointer text-sm text-text-primary transition-colors"
                >
                  {isUploading ? <Loader2 className="w-4 h-4 animate-spin text-accent" /> : <Link className="w-4 h-4 text-accent" />}
                  {isUploading ? 'Subiendo...' : 'Subir nuevo archivo'}
                </label>
              </div>
            </div>

            {/* Calendar & Notes */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Plazo / Evento</label>
                <Input type="date" className="h-9 text-sm" value={cellData.dueDate || ''} onChange={(e) => onUpdate(rowId, colId, { dueDate: e.target.value || undefined })} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5" /> Notas</label>
                <Input placeholder="Escribe algo..." className="h-9 text-sm" value={cellData.notes || ''} onChange={(e) => onUpdate(rowId, colId, { notes: e.target.value })} />
              </div>
            </div>

          </div>
        </div>
      )}
    </td>
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
  row: { id: string; name: string; cells: Record<string, GridCellData> };
  columns: { id: string; name: string }[];
  onDelete: (id: string) => void;
  onCellUpdate: (rowId: string, colId: string, updates: Partial<GridCellData>) => void;
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
          key={col.id} rowId={row.id} colId={col.id} cellData={row.cells[col.id] || { status: 'todo' }}
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
      setGrid(newGrid);
    } catch (e) { console.error(e); } finally { setIsSaving(false); }
  };

  const handleLinkProject = async (projId: string) => {
    setLinkedProjectId(projId);
    await saveGrid(grid, projId);
  };

  const addColumn = () => {
    if (!newColName.trim()) return;
    const newCol = { id: Math.random().toString(36).substring(7), name: newColName.trim() };
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

  const handleCellUpdate = (rowId: string, colId: string, updates: Partial<GridCellData>) => {
    const newRows = grid.rows.map(r => {
      if (r.id !== rowId) return r;
      const updatedCell: GridCellData = { ...(r.cells[colId] || { status: 'todo' }) };
      if (updates.status !== undefined) updatedCell.status = updates.status;
      if (updates.fileId !== undefined) updatedCell.fileId = updates.fileId;
      if (updates.fileName !== undefined) updatedCell.fileName = updates.fileName;
      if (updates.notes !== undefined) updatedCell.notes = updates.notes;
      if (updates.dueDate !== undefined) updatedCell.dueDate = updates.dueDate;
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

                <th className="p-2 border-b border-border bg-surface/50 min-w-[140px] max-w-[160px]">
                  <div className="flex items-center gap-1">
                    <Input placeholder="+ Fase..." value={newColName} onChange={e => setNewColName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addColumn()} className="h-7 text-xs bg-transparent w-full" />
                    <Button size="sm" variant="ghost" onClick={addColumn} disabled={!newColName.trim()} className="h-7 px-1.5 shrink-0"><Plus className="w-3.5 h-3.5" /></Button>
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
