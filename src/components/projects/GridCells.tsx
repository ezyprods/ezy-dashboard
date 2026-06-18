'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Circle, Clock, Eye, CheckCircle2, Paperclip, Calendar, MessageSquare, Play, Loader2, X, ListTodo, FileText, AlignLeft, CheckSquare, Plus, Trash2, UploadCloud, Pause } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { DatePicker } from '@/components/ui/DatePicker';
import type { GridCell, FlexTaskStatus, ColumnType } from '@/types';
import { useAudio } from '@/lib/contexts/AudioContext';
import { customAlert } from '@/lib/dialog';
import { useContextMenu } from '@/lib/contexts/ContextMenuContext';

export const STATUS_CONFIG: Record<FlexTaskStatus, { label: string; icon: typeof Circle; color: string; bgColor: string }> = {
  todo: { label: 'Pendiente', icon: Circle, color: 'text-text-secondary', bgColor: 'bg-surface' },
  in_progress: { label: 'En progreso', icon: Clock, color: 'text-accent', bgColor: 'bg-accent/10' },
  review: { label: 'Revisión', icon: Eye, color: 'text-warning', bgColor: 'bg-warning/10' },
  done: { label: 'Hecho', icon: CheckCircle2, color: 'text-success', bgColor: 'bg-success/10' },
};

export const NEXT_STATUS: Record<FlexTaskStatus, FlexTaskStatus> = {
  todo: 'in_progress',
  in_progress: 'review',
  review: 'done',
  done: 'todo'
};

export const COL_TYPES: { id: ColumnType; label: string; icon: any }[] = [
  { id: 'status', label: 'Estado', icon: Circle },
  { id: 'file', label: 'Archivo', icon: Paperclip },
  { id: 'checklist', label: 'Checklist', icon: CheckSquare },
  { id: 'text', label: 'Texto', icon: AlignLeft },
  { id: 'date', label: 'Fecha', icon: Calendar },
];

function MiniWaveform({ fileId, isPlaying }: { fileId: string; isPlaying: boolean }) {
  // Simple CSS-based mini waveform animation to simulate audio playing
  return (
    <div className="flex items-center gap-0.5 h-4 mx-2">
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className={`w-1 rounded-full bg-current transition-all duration-150 ${isPlaying ? 'animate-pulse' : ''}`}
          style={{ 
            height: isPlaying ? `${Math.max(30, Math.random() * 100)}%` : '30%',
            animationDelay: `${i * 0.1}s` 
          }}
        />
      ))}
    </div>
  );
}

// --- Specialized Cells ---
function StatusCellUI({ status, onStatusChange }: { status: FlexTaskStatus; onStatusChange: (s: FlexTaskStatus) => void }) {
  const [showRadial, setShowRadial] = useState(false);
  const [hovered, setHovered] = useState<FlexTaskStatus | null>(null);
  const [center, setCenter] = useState({ x: 0, y: 0 });
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const startPos = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);
  const startTime = useRef(0);
  
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.todo;
  const Icon = cfg.icon;

  const isRadialOpenRef = useRef(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.currentTarget;
    startPos.current = { x: e.clientX, y: e.clientY };
    hasMoved.current = false;
    startTime.current = Date.now();
    isRadialOpenRef.current = false;

    const cleanup = () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      window.removeEventListener('pointerup', cleanup);
      window.removeEventListener('pointercancel', cleanup);
    };

    window.addEventListener('pointerup', cleanup);
    window.addEventListener('pointercancel', cleanup);

    longPressTimer.current = setTimeout(() => {
      cleanup();
      if (!hasMoved.current) {
        const rect = target.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        setCenter({ x: cx, y: cy });
        setShowRadial(true);
        isRadialOpenRef.current = true;
      }
    }, 550);
  };

  const handleLocalPointerMove = (e: React.PointerEvent) => {
    if (showRadial) return;
    const dx = e.clientX - startPos.current.x;
    const dy = e.clientY - startPos.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > 5) {
      hasMoved.current = true;
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    }
  };

  useEffect(() => {
    if (!showRadial) return;

    const handleGlobalPointerMove = (e: PointerEvent) => {
      const dx = e.clientX - center.x;
      const dy = e.clientY - center.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 15) {
        setHovered(null);
        return;
      }
      const angle = Math.atan2(dy, dx);
      const positions: [FlexTaskStatus, number][] = [
        ['in_progress', 0],
        ['review', -Math.PI / 2],
        ['done', Math.PI],
        ['todo', Math.PI / 2]
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

    const handleGlobalPointerUp = (e: PointerEvent) => {
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

    window.addEventListener('pointermove', handleGlobalPointerMove);
    window.addEventListener('pointerup', handleGlobalPointerUp);
    return () => {
      window.removeEventListener('pointermove', handleGlobalPointerMove);
      window.removeEventListener('pointerup', handleGlobalPointerUp);
    };
  }, [showRadial, center, hovered, onStatusChange]);

  const handlePointerLeave = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    hasMoved.current = true;
  };

  const handlePointerCancel = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    hasMoved.current = true;
  };

  const handleClick = (e: React.MouseEvent) => {
    // If radial opened via long press, ignore this click
    if (isRadialOpenRef.current || showRadial) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // If pointer moved significantly, ignore
    if (hasMoved.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onStatusChange(NEXT_STATUS[status] || 'in_progress');
  };

  const radialItems: { s: FlexTaskStatus; x: number; y: number }[] = [
    { s: 'in_progress', x: 52, y: 0 },
    { s: 'review', x: 0, y: -52 },
    { s: 'done', x: -52, y: 0 },
    { s: 'todo', x: 0, y: 52 },
  ];

  const { showMenu } = useContextMenu();

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    showMenu(e.clientX, e.clientY, [
      {
        label: 'Pendiente',
        icon: 'Circle',
        action: () => onStatusChange('todo')
      },
      {
        label: 'En progreso',
        icon: 'Clock',
        action: () => onStatusChange('in_progress')
      },
      {
        label: 'Revisión',
        icon: 'Eye',
        action: () => onStatusChange('review')
      },
      {
        label: 'Hecho',
        icon: 'CheckCircle2',
        action: () => onStatusChange('done')
      }
    ]);
  };

  return (
    <div 
      ref={containerRef} 
      className="relative flex items-center justify-center w-full cursor-context-menu" 
      style={{ userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', touchAction: showRadial ? 'none' : 'pan-x pan-y' }} 
      onPointerDown={handlePointerDown} 
      onPointerMove={handleLocalPointerMove}
      onPointerLeave={handlePointerLeave} 
      onPointerCancel={handlePointerCancel}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      <button 
        className={`w-full py-2 flex justify-center items-center rounded transition-colors ${cfg.bgColor} hover:brightness-110`} 
        title={cfg.label} 
        type="button" 
        style={{ pointerEvents: 'none' }}
      >
        <Icon className={`w-5 h-5 ${cfg.color}`} />
      </button>

      {showRadial && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[999] pointer-events-none flex items-center justify-center">
          <div 
            className="absolute w-3 h-3 bg-accent rounded-full animate-ping" 
            style={{ left: center.x - 6, top: center.y - 6 }}
          />
          {radialItems.map(({ s, x, y }) => {
            const scfg = STATUS_CONFIG[s];
            const isHov = hovered === s;
            return (
              <div 
                key={s} 
                className={`absolute flex items-center justify-center rounded-full border-2 transition-all duration-100 ${
                  isHov 
                    ? 'w-12 h-12 border-accent shadow-lg shadow-accent/40 bg-surface-elevated scale-110' 
                    : 'w-10 h-10 border-border bg-surface shadow-md'
                }`} 
                style={{ left: center.x + x - (isHov ? 24 : 20), top: center.y + y - (isHov ? 24 : 20) }}
              >
                <scfg.icon className={`w-5 h-5 ${scfg.color}`} />
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}

function FileCellUI({ fileId, fileName, artistName, isUploading, onPlay, isPlaying, onUploadClick }: any) {
  const isAudioFile = fileName?.match(/\.(mp3|wav|m4a|aac|flac|ogg)$/i);
  
  if (isUploading) {
    return (
      <div className="flex flex-col items-center justify-center py-2 bg-surface/50 rounded border border-border border-dashed opacity-50">
        <Loader2 className="w-4 h-4 animate-spin text-accent mb-1" />
        <span className="text-[9px] text-text-secondary uppercase">Subiendo...</span>
      </div>
    );
  }

  if (fileId) {
    return (
      <div 
        onClick={isAudioFile ? onPlay : onUploadClick} 
        className={`flex items-center justify-between p-1.5 rounded border transition-all cursor-pointer ${isPlaying ? 'bg-success/10 border-success/30 text-success' : 'bg-surface-elevated border-border text-text-primary hover:border-accent/50'}`}
        title={fileName}
      >
        <div className="flex items-center gap-1.5 overflow-hidden">
          {isAudioFile ? <Play className={`w-3.5 h-3.5 shrink-0 ${isPlaying ? 'fill-current' : ''}`} /> : <Paperclip className="w-3.5 h-3.5 shrink-0 text-text-secondary" />}
          <span className="text-xs truncate">{fileName}</span>
        </div>
        {isAudioFile && <MiniWaveform fileId={fileId} isPlaying={isPlaying} />}
      </div>
    );
  }

  return (
    <div onClick={onUploadClick} className="flex flex-col items-center justify-center py-2 bg-surface/30 hover:bg-surface-elevated rounded border border-border border-dashed cursor-pointer transition-colors text-text-secondary hover:text-accent group">
      <Plus className="w-4 h-4 mb-0.5 opacity-50 group-hover:opacity-100" />
      <span className="text-[9px] uppercase font-medium">Soltar Archivo</span>
    </div>
  );
}

function ChecklistCellUI({ checklist = [], onOpenManager }: any) {
  const total = checklist.length;
  const done = checklist.filter((c:any) => c.done).length;
  const hasFiles = checklist.some((c:any) => c.fileId);
  const progress = total === 0 ? 0 : Math.round((done / total) * 100);
  
  return (
    <div onClick={onOpenManager} className="cursor-pointer group flex flex-col gap-1 w-full p-1.5 rounded bg-surface border border-border hover:border-accent/50 transition-colors">
      <div className="flex justify-between items-center text-[10px] font-bold text-text-secondary group-hover:text-text-primary">
        <span className="flex items-center gap-1">
          <ListTodo className="w-3 h-3" /> Tareas
          {hasFiles && <span title="Tiene archivos adjuntos"><Paperclip className="w-2.5 h-2.5 text-accent opacity-75 animate-pulse" /></span>}
        </span>
        <span>{done}/{total}</span>
      </div>
      <div className="h-1.5 w-full bg-surface-elevated rounded-full overflow-hidden">
        <div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

function TextCellUI({ textValue, onUpdate }: any) {
  return (
    <Input 
      value={textValue || ''} 
      onChange={e => onUpdate({ textValue: e.target.value })} 
      placeholder="Notas / Letra..." 
      className="h-8 text-xs bg-surface border-border text-center placeholder:text-center" 
    />
  );
}

function DateCellUI({ dueDate, status, onUpdate }: any) {
  const isOverdue = dueDate && new Date(dueDate) < new Date() && status !== 'done';
  return (
    <DatePicker
      value={dueDate || ''}
      onChange={val => onUpdate({ dueDate: val || undefined })}
      className={isOverdue ? 'border-error/50 text-error' : 'border-border'}
    />
  );
}

// --- Main Cell Component ---

export function CellComponent({
  rowId, colId, colType = 'status', cellData, artistName, files, onUpdate, uploadTargetId
}: {
  rowId: string; colId: string; colType?: ColumnType; cellData: GridCell; artistName: string; files: any[];
  onUpdate: (rowId: string, colId: string, updates: Partial<GridCell>) => void; uploadTargetId: string;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [isChecklistOpen, setIsChecklistOpen] = useState(false);
  const { currentTrack, isPlaying, playTrack, togglePlay } = useAudio();

  const handleUpdate = (updates: Partial<GridCell>) => onUpdate(rowId, colId, updates);
  const isCurrentAudioPlaying = isPlaying && currentTrack?.id === cellData.fileId;

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!cellData.fileId || !cellData.fileName) return;
    if (currentTrack?.id === cellData.fileId) togglePlay();
    else playTrack({ id: cellData.fileId, name: cellData.fileName.replace(/\.[^/.]+$/, ''), url: `/api/audio/${cellData.fileId}`, artistName });
  };

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    handleUpdate({ status: 'in_progress' });
    const formData = new FormData();
    formData.append('file', file);
    formData.append('parentId', uploadTargetId);
    try {
      const res = await fetch('/api/files', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Error al subir');
      const json = await res.json();
      handleUpdate({ fileId: json.file.id, fileName: json.file.name, status: 'done' });
    } catch (err) { customAlert('Error subiendo archivo'); } 
    finally { setIsUploading(false); }
  };

  const uploadFileForChecklistItem = async (file: File, idx: number, overwrite = false, targetFileId?: string, skipSimilarity = false) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('parentId', uploadTargetId);
    if (overwrite && targetFileId) {
      formData.append('overwrite', 'true');
      formData.append('targetFileId', targetFileId);
    }
    if (skipSimilarity) {
      formData.append('skipSimilarity', 'true');
    }

    try {
      const res = await fetch('/api/files', { method: 'POST', body: formData });
      if (res.status === 409) {
        const conflictData = await res.json();
        const choice = window.confirm(
          `Se ha detectado un archivo similar: "${conflictData.similarFile.name}".\n\n¿Quieres sobrescribir este archivo existente (creando una nueva versión)?\n\nPresiona [Aceptar] para sobrescribir o [Cancelar] para guardarlo por separado.`
        );
        if (choice) {
          await uploadFileForChecklistItem(file, idx, true, conflictData.similarFile.id);
        } else {
          await uploadFileForChecklistItem(file, idx, false, undefined, true);
        }
        return;
      }

      if (!res.ok) throw new Error('Error al subir');
      const json = await res.json();
      
      const newC = [...(cellData.checklist || [])];
      newC[idx].fileId = json.file.id;
      newC[idx].fileName = json.file.name;
      handleUpdate({ checklist: newC });
      customAlert('Archivo adjuntado correctamente');
    } catch (err) {
      customAlert('Error subiendo archivo');
    }
  };

  const handleNativeDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  return (
    <td 
      className="p-1 sm:p-2 border-b border-r border-border text-center relative group/cell min-w-[120px] sm:min-w-[160px] max-w-[240px] align-middle"
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onDrop={handleNativeDrop}
    >
      <div className="w-full relative">
        {colType === 'status' && <StatusCellUI status={cellData.status || 'todo'} onStatusChange={s => handleUpdate({ status: s })} />}
        {colType === 'file' && (
          <FileCellUI 
            fileId={cellData.fileId} fileName={cellData.fileName} isUploading={isUploading}
            onPlay={handlePlayClick} isPlaying={isCurrentAudioPlaying}
            onUploadClick={() => document.getElementById(`file-${rowId}-${colId}`)?.click()} 
          />
        )}
        {colType === 'checklist' && <ChecklistCellUI checklist={cellData.checklist} onOpenManager={() => setIsChecklistOpen(true)} />}
        {colType === 'text' && <TextCellUI textValue={cellData.textValue || cellData.notes} onUpdate={handleUpdate} />}
        {colType === 'date' && <DateCellUI dueDate={cellData.dueDate} status={cellData.status} onUpdate={handleUpdate} />}
      </div>

      <input type="file" id={`file-${rowId}-${colId}`} className="hidden" onChange={e => { const f = e.target.files?.[0]; if(f) uploadFile(f); }} />

      {isChecklistOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[150] flex items-center justify-center p-4" onClick={() => setIsChecklistOpen(false)}>
          <div className="glass rounded-xl border border-border bg-surface w-full max-w-lg p-6 shadow-2xl relative animate-fade-in text-left" onClick={e => e.stopPropagation()}>
            <button onClick={() => setIsChecklistOpen(false)} className="absolute top-4 right-4 text-text-secondary hover:text-text-primary p-1"><X className="w-5 h-5" /></button>
            <h4 className="text-lg font-bold text-text-primary mb-4 flex items-center gap-2"><CheckSquare className="w-5 h-5 text-accent"/> Checklist de Fase</h4>
            
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
              {(cellData.checklist || []).map((item, i) => (
                <div key={item.id} className="flex flex-col gap-2 bg-surface-elevated p-3 rounded-lg border border-border/80 hover:border-accent/20 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <input type="checkbox" checked={item.done} onChange={e => {
                        const newC = [...(cellData.checklist||[])];
                        newC[i].done = e.target.checked;
                        handleUpdate({ checklist: newC });
                      }} className="w-4 h-4 accent-accent shrink-0 rounded cursor-pointer" />
                      
                      <Input value={item.text} onChange={e => {
                        const newC = [...(cellData.checklist||[])];
                        newC[i].text = e.target.value;
                        handleUpdate({ checklist: newC });
                      }} className="h-8 text-sm bg-transparent border-none focus-visible:ring-0 p-0 text-text-primary placeholder:text-text-secondary/50 flex-1 min-w-0" />
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-2 pl-6 sm:pl-0 shrink-0">
                      <div className="flex items-center gap-1">
                        <input 
                          type="date" 
                          value={item.dueDate || ''} 
                          onChange={e => {
                            const newC = [...(cellData.checklist||[])];
                            newC[i].dueDate = e.target.value || undefined;
                            handleUpdate({ checklist: newC });
                          }} 
                          className="bg-surface text-[10px] text-text-secondary border border-border/50 rounded px-1.5 py-0.5 outline-none max-w-[110px] cursor-pointer"
                        />
                      </div>

                      <button onClick={() => {
                        const newC = (cellData.checklist||[]).filter(c => c.id !== item.id);
                        handleUpdate({ checklist: newC });
                      }} className="text-error hover:bg-error/10 p-1.5 rounded transition-colors shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>

                  <div className="pl-6 flex items-center justify-between gap-2 border-t border-border/20 pt-2 text-xs">
                    {item.fileId ? (
                      <div className="flex items-center justify-between w-full bg-surface/40 px-2 py-1 rounded border border-border/50">
                        <div className="flex items-center gap-1.5 overflow-hidden">
                          <Paperclip className="w-3 h-3 text-text-secondary shrink-0" />
                          <a 
                            href={`https://drive.google.com/file/d/${item.fileId}/view`} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-accent hover:underline truncate max-w-[180px]"
                          >
                            {item.fileName}
                          </a>
                          
                          {item.fileName?.match(/\.(mp3|wav|m4a|aac|flac|ogg)$/i) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="w-6 h-6 rounded-full bg-accent/10 text-accent hover:bg-accent/20 flex items-center justify-center p-0 ml-1 shrink-0"
                              onClick={() => {
                                const isCurrent = currentTrack?.id === item.fileId;
                                if (isCurrent) togglePlay();
                                else playTrack({ id: item.fileId!, name: item.fileName!.replace(/\.[^/.]+$/, ''), url: `/api/audio/${item.fileId}`, artistName });
                              }}
                            >
                              {isPlaying && currentTrack?.id === item.fileId ? (
                                <Pause className="w-2.5 h-2.5 fill-current" />
                              ) : (
                                <Play className="w-2.5 h-2.5 fill-current ml-0.5" />
                              )}
                            </Button>
                          )}
                        </div>
                        
                        <button 
                          onClick={() => {
                            const newC = [...(cellData.checklist || [])];
                            delete newC[i].fileId;
                            delete newC[i].fileName;
                            handleUpdate({ checklist: newC });
                          }}
                          className="text-text-secondary hover:text-error text-[10px]"
                        >
                          Quitar
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 w-full">
                        <span className="text-[10px] text-text-secondary">Adjuntar:</span>
                        
                        <label className="text-[10px] text-accent hover:underline cursor-pointer flex items-center gap-0.5">
                          <UploadCloud className="w-3 h-3" /> Subir local
                          <input 
                            type="file" 
                            className="hidden" 
                            onChange={e => {
                              const f = e.target.files?.[0];
                              if (f) uploadFileForChecklistItem(f, i);
                            }}
                          />
                        </label>
                        
                        {files && files.length > 0 && (
                          <div className="relative">
                            <select
                              onChange={e => {
                                if (e.target.value) {
                                  const selectedFile = files.find(f => f.id === e.target.value);
                                  if (selectedFile) {
                                    const newC = [...(cellData.checklist || [])];
                                    newC[i].fileId = selectedFile.id;
                                    newC[i].fileName = selectedFile.name;
                                    handleUpdate({ checklist: newC });
                                  }
                                  e.target.value = '';
                                }
                              }}
                              className="bg-surface text-[10px] text-text-secondary border border-border/50 rounded outline-none py-0.5 px-1 cursor-pointer max-w-[140px]"
                              defaultValue=""
                            >
                              <option value="" disabled>Elegir de Drive...</option>
                              {files.map(f => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <Button variant="outline" className="w-full mt-2 border-dashed" onClick={() => {
                const newC = [...(cellData.checklist||[]), { id: Math.random().toString(36).substring(7), text: 'Nueva tarea', done: false }];
                handleUpdate({ checklist: newC });
              }}><Plus className="w-4 h-4 mr-2"/> Añadir Tarea</Button>
            </div>
          </div>
        </div>
      )}
    </td>
  );
}
