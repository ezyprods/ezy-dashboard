'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, Plus, Trash2, CheckCircle2, Clock, Eye, Circle, GripVertical, Calendar, MessageSquare, Paperclip, Settings, Play, Pause, Download, X, ExternalLink, UploadCloud, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { ProductionGrid, FlexTaskStatus } from '@/types';
import { useAudio } from '@/lib/contexts/AudioContext';

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

      {/* Radial menu */}
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
      className="p-3 border-b border-r border-border bg-surface/50 min-w-[150px] group relative"
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

// --- Interactive Cell Component with Attachments, Deadlines & Notes ---
function CellComponent({
  rowId,
  colId,
  cellData,
  projectTitle,
  files,
  onUpdate,
  projectId,
  fetchGrid,
}: {
  rowId: string;
  colId: string;
  cellData: GridCellData;
  projectTitle: string;
  files: any[];
  onUpdate: (rowId: string, colId: string, updates: Partial<GridCellData>) => void;
  projectId: string;
  fetchGrid: () => void;
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const { currentTrack, isPlaying, playTrack, togglePlay } = useAudio();

  const handleStatusChange = (status: FlexTaskStatus) => {
    onUpdate(rowId, colId, { status });
  };

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
        artistName: projectTitle,
      });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('parentId', projectId); // upload directly to the main folder

    try {
      const res = await fetch('/api/files', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('Error al subir el archivo');
      const json = await res.json();
      
      onUpdate(rowId, colId, {
        fileId: json.file.id,
        fileName: json.file.name,
        status: 'done', // auto-completes the cell status when file is uploaded
      });
      
      setIsModalOpen(false);
      await fetchGrid(); // reload grid to refresh files list
    } catch (err) {
      alert('Error subiendo archivo');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <td className="p-2 border-b border-r border-border text-center relative group/cell min-w-[160px] max-w-[240px]">
      <div className="flex flex-col items-center gap-1 w-full">
        {/* Radial Status Cell */}
        <StatusCell
          status={cellData.status || 'todo'}
          onStatusChange={handleStatusChange}
        />

        {/* Small metadata row (file name, note icon, due date) */}
        {(cellData.fileId || cellData.notes || cellData.dueDate) && (
          <div className="flex items-center gap-2 mt-1 px-1 py-0.5 rounded bg-surface/40 border border-border/30 w-full justify-center text-[10px] text-text-secondary select-none">
            {cellData.fileId && (
              <div className="flex items-center gap-1 truncate max-w-[90px]" title={cellData.fileName}>
                {isAudioFile ? (
                  <button 
                    onClick={handlePlayClick} 
                    className={`p-0.5 rounded-full ${isCurrentAudioPlaying ? 'bg-success/20 text-success' : 'bg-accent/10 text-accent'} hover:scale-105 transition-transform`}
                  >
                    {isCurrentAudioPlaying ? (
                      <span className="flex items-center justify-center w-3 h-3 text-[8px] font-bold">||</span>
                    ) : (
                      <Play className="w-2.5 h-2.5 fill-current ml-0.5" />
                    )}
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
              <div 
                className={`flex items-center gap-0.5 font-mono text-[9px] px-1 rounded-sm ${
                  new Date(cellData.dueDate) < new Date() && cellData.status !== 'done'
                    ? 'bg-error/10 text-error' 
                    : 'bg-surface border border-border/55'
                }`}
              >
                <Calendar className="w-2 h-2 shrink-0" />
                <span>{new Date(cellData.dueDate).toLocaleDateString(undefined, {month: 'numeric', day: 'numeric'})}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Settings gear on hover */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsModalOpen(true);
        }}
        className="absolute top-1 right-1 opacity-0 group-hover/cell:opacity-100 p-1 rounded bg-surface-elevated hover:bg-surface border border-border transition-all shadow-md z-10"
        title="Detalles y Vinculación"
      >
        <Settings className="w-3.5 h-3.5 text-text-secondary hover:text-text-primary" />
      </button>

      {/* Beautiful Modal for Cell Details */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[150] flex items-center justify-center p-4"
          onClick={() => setIsModalOpen(false)}
        >
          <div 
            className="glass rounded-xl border border-border bg-surface w-full max-w-md p-6 space-y-6 shadow-2xl relative animate-fade-in text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-text-secondary hover:text-text-primary p-1"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <h4 className="text-lg font-bold text-text-primary">Detalles de la Celda</h4>
              <p className="text-xs text-text-secondary mt-1">Interconexión de archivos y tareas en tiempo real.</p>
            </div>

            {/* Status Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-text-secondary uppercase tracking-wider">Estado</label>
              <div className="grid grid-cols-4 gap-2">
                {STATUSES.map(s => {
                  const cfg = STATUS_CONFIG[s];
                  const SIcon = cfg.icon;
                  const isSelected = (cellData.status || 'todo') === s;
                  return (
                    <button
                      key={s}
                      onClick={() => handleStatusChange(s)}
                      className={`flex flex-col items-center justify-center p-2 rounded-lg border text-xs font-medium transition-colors ${
                        isSelected 
                          ? 'border-accent bg-accent/10 text-text-primary' 
                          : 'border-border bg-surface/50 text-text-secondary hover:border-accent-light'
                      }`}
                    >
                      <SIcon className={`w-4 h-4 mb-1 ${cfg.color}`} />
                      <span>{cfg.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Linked file info / selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-text-secondary uppercase tracking-wider block">Archivo Vinculado de Google Drive</label>
              {cellData.fileId ? (
                <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface-elevated/50">
                  <div className="flex items-center gap-3 truncate flex-1 mr-4">
                    <Paperclip className="w-4 h-4 text-accent shrink-0" />
                    <span className="text-sm font-medium truncate" title={cellData.fileName}>{cellData.fileName}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isAudioFile && (
                      <Button size="icon" variant="ghost" className="w-8 h-8 rounded-full" onClick={handlePlayClick}>
                        {isCurrentAudioPlaying ? (
                          <span className="font-bold text-xs text-success">||</span>
                        ) : (
                          <Play className="w-3.5 h-3.5 fill-current text-accent" />
                        )}
                      </Button>
                    )}
                    <a 
                      href={`/api/audio/${cellData.fileId}`} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="p-1.5 rounded-lg border border-border hover:bg-surface hover:text-accent-light transition-colors text-text-secondary"
                      title="Descargar"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    <button 
                      onClick={() => onUpdate(rowId, colId, { fileId: undefined, fileName: undefined })}
                      className="text-error hover:bg-error/10 p-1.5 rounded-lg"
                      title="Desvincular"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Select file dropdown */}
                  <div className="relative">
                    <select
                      className="w-full bg-surface border border-border rounded-lg text-sm px-3 py-2 focus:outline-none focus:border-accent text-text-primary appearance-none cursor-pointer"
                      onChange={(e) => {
                        const file = files.find(f => f.id === e.target.value);
                        if (file) {
                          onUpdate(rowId, colId, {
                            fileId: file.id,
                            fileName: file.name,
                            status: 'done'
                          });
                        }
                      }}
                      defaultValue=""
                    >
                      <option value="" disabled>Seleccionar archivo de la carpeta...</option>
                      {files.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-text-secondary">
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>

                  {/* Or upload direct uploader */}
                  <div className="relative">
                    <input 
                      type="file" 
                      id={`cell-upload-${rowId}-${colId}`} 
                      className="hidden" 
                      onChange={handleFileUpload}
                      disabled={isUploading}
                    />
                    <label 
                      htmlFor={`cell-upload-${rowId}-${colId}`}
                      className="flex flex-col items-center justify-center border border-dashed border-border hover:border-accent/40 rounded-lg p-4 cursor-pointer hover:bg-surface-elevated/30 transition-colors"
                    >
                      {isUploading ? (
                        <Loader2 className="w-6 h-6 animate-spin text-accent" />
                      ) : (
                        <UploadCloud className="w-6 h-6 text-text-secondary mb-1" />
                      )}
                      <span className="text-xs text-text-primary font-medium">{isUploading ? 'Subiendo...' : 'Subir archivo a la celda'}</span>
                      <span className="text-[10px] text-text-secondary mt-0.5">Se subirá directamente a Drive</span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Date input */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-text-secondary uppercase tracking-wider block">Fecha de Entrega (Deadline)</label>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={cellData.dueDate || ''}
                  onChange={(e) => onUpdate(rowId, colId, { dueDate: e.target.value || undefined })}
                  className="bg-surface/50"
                />
                {cellData.dueDate && (
                  <Button variant="ghost" size="icon" onClick={() => onUpdate(rowId, colId, { dueDate: undefined })}>
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Note input */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-text-secondary uppercase tracking-wider block">Notas de la Fase</label>
              <textarea
                value={cellData.notes || ''}
                onChange={(e) => onUpdate(rowId, colId, { notes: e.target.value })}
                placeholder="Añadir notas sobre esta fase de producción..."
                className="w-full bg-surface/50 border border-border rounded-lg p-2.5 text-sm focus:outline-none focus:border-accent text-text-primary min-h-[80px]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button size="sm" onClick={() => setIsModalOpen(false)}>Aceptar</Button>
            </div>
          </div>
        </div>
      )}
    </td>
  );
}

// --- Sortable Row ---
function SortableRow({
  row,
  columns,
  mode,
  onDelete,
  onCellUpdate,
  projectTitle,
  files,
  projectId,
  fetchGrid,
}: {
  row: { id: string; name: string; cells: Record<string, GridCellData> };
  columns: { id: string; name: string }[];
  mode: 'simple' | 'interconnected';
  onDelete: (id: string) => void;
  onCellUpdate: (rowId: string, colId: string, updates: Partial<GridCellData>) => void;
  projectTitle: string;
  files: any[];
  projectId: string;
  fetchGrid: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <tr ref={setNodeRef} style={style} className="group/row hover:bg-surface/30 transition-colors">
      <td className="p-3 border-b border-r border-border font-medium text-sm w-56 max-w-[200px]">
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
          <CellComponent
            key={col.id}
            rowId={row.id}
            colId={col.id}
            cellData={cell}
            projectTitle={projectTitle}
            files={files}
            onUpdate={onCellUpdate}
            projectId={projectId}
            fetchGrid={fetchGrid}
          />
        );
      })}
      <td className="p-3 border-b border-border bg-surface/10" />
    </tr>
  );
}

export function ProductionGridBoard({ projectId, projectTitle = 'Proyecto' }: { projectId: string; projectTitle?: string }) {
  const [grid, setGrid] = useState<ProductionGrid>({ columns: [], rows: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newRowName, setNewRowName] = useState('');
  const [files, setFiles] = useState<any[]>([]);
  const [isModeLoading, setIsModeLoading] = useState(false);

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
      
      const g: ProductionGrid = data.productionGrid || { columns: [], rows: [] };
      if (!g.mode) g.mode = 'simple';
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

  const handleCellUpdate = (rowId: string, colId: string, updates: Partial<GridCellData>) => {
    const newRows = grid.rows.map(r => {
      if (r.id !== rowId) return r;
      const currentCell = r.cells[colId] || { status: 'todo' };
      
      const updatedCell = { ...currentCell };
      if (updates.status !== undefined) updatedCell.status = updates.status;
      
      if ('fileId' in updates) {
        if (updates.fileId === undefined || updates.fileId === null) {
          delete (updatedCell as any).fileId;
        } else {
          (updatedCell as any).fileId = updates.fileId;
        }
      }
      if ('fileName' in updates) {
        if (updates.fileName === undefined || updates.fileName === null) {
          delete (updatedCell as any).fileName;
        } else {
          (updatedCell as any).fileName = updates.fileName;
        }
      }
      if (updates.notes !== undefined) {
        (updatedCell as any).notes = updates.notes;
      }
      if (updates.dueDate !== undefined) {
        if (updates.dueDate === undefined) {
          delete (updatedCell as any).dueDate;
        } else {
          (updatedCell as any).dueDate = updates.dueDate;
        }
      }
      
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
    if (grid.mode === 'interconnected') return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = grid.rows.findIndex(r => r.id === active.id);
    const newIdx = grid.rows.findIndex(r => r.id === over.id);
    saveGrid({ ...grid, rows: arrayMove(grid.rows, oldIdx, newIdx) });
  };

  const toggleMode = async () => {
    const newMode: 'simple' | 'interconnected' = grid.mode === 'simple' ? 'interconnected' : 'simple';
    setIsModeLoading(true);
    const newGrid = { ...grid, mode: newMode };
    await saveGrid(newGrid);
    setIsModeLoading(false);
  };

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-accent" /></div>;

  const displayRows = grid.mode === 'interconnected' 
    ? files.map(f => {
        const existing = grid.rows.find(r => r.id === f.id);
        return { id: f.id, name: f.name, cells: existing ? existing.cells : {} };
      })
    : grid.rows;

  const totalCells = grid.columns.length * displayRows.length;
  const doneCells = displayRows.reduce((acc, row) => {
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
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-3 bg-surface-elevated px-3 py-1.5 rounded-lg border border-border">
            <span className={`text-xs font-medium ${grid.mode === 'simple' ? 'text-text-primary' : 'text-text-secondary'}`}>Simple</span>
            <button 
              onClick={toggleMode}
              disabled={isModeLoading}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${grid.mode === 'interconnected' ? 'bg-accent' : 'bg-surface'} border border-border`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${grid.mode === 'interconnected' ? 'translate-x-4' : 'translate-x-1'}`} />
            </button>
            <span className={`text-xs font-medium ${grid.mode === 'interconnected' ? 'text-accent' : 'text-text-secondary'}`}>Interconectado</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-text-secondary">{progress}% Completado</div>
            {isSaving && <Loader2 className="w-4 h-4 animate-spin text-accent" />}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto bg-surface-elevated/30 rounded-xl border border-border">
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
                    <div className="text-xs text-text-secondary font-medium uppercase tracking-wider">Archivos del Proyecto</div>
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
                      placeholder="+ Fase..."
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
                      mode={grid.mode || 'simple'}
                      onDelete={deleteRow}
                      onCellUpdate={handleCellUpdate}
                      projectTitle={projectTitle}
                      files={files}
                      projectId={projectId}
                      fetchGrid={fetchGrid}
                    />
                  ))}
                </SortableContext>
                {displayRows.length === 0 && (
                  <tr>
                    <td colSpan={grid.columns.length + 2} className="p-8 text-center text-text-secondary border-b border-border">
                      Empieza añadiendo columnas (fases) y filas (canciones).
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
