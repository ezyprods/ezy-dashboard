'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, Plus, Trash2, CheckCircle2, Clock, Eye, Circle, GripVertical, Calendar, MessageSquare, Paperclip, Settings, Play, Download, X, Link, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { ProductionGrid, FlexTaskStatus, GridCell } from '@/types';
import { useAudio } from '@/lib/contexts/AudioContext';
import { customConfirm, customAlert } from '@/lib/dialog';
import { useContextMenu } from '@/lib/contexts/ContextMenuContext';

import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, horizontalListSortingStrategy, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { MemoizedCellComponent as CellComponent, COL_TYPES, STATUS_CONFIG } from './GridCells';
import { CampaignSelector } from './CampaignSelector';
import type { ColumnType } from '@/types';

// --- Sortable Column Header ---
function SortableColHeader({ col, onDelete, onRename }: { col: { id: string; name: string; type?: ColumnType }; onDelete: (id: string) => void; onRename: (id: string, name: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const typeCfg = COL_TYPES.find(t => t.id === (col.type || 'status'));
  const Icon = typeCfg ? typeCfg.icon : Circle;

  const [localName, setLocalName] = useState(col.name);
  useEffect(() => { setLocalName(col.name); }, [col.name]);

  return (
    <th
      ref={setNodeRef}
      style={style}
      className={`p-1 sm:p-3 border-b border-r border-border bg-surface/50 group relative ${col.type === 'status' ? 'min-w-[70px] sm:min-w-[130px]' : 'min-w-[90px] sm:min-w-[150px]'}`}
    >
      <div className="flex items-center justify-center gap-1.5">
        <button {...attributes} {...listeners} className="cursor-grab text-text-secondary opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity shrink-0">
          <GripVertical className="w-3.5 h-3.5" />
        </button>
        <input
          value={localName}
          onChange={e => setLocalName(e.target.value)}
          onBlur={() => { if(localName.trim() && localName !== col.name) onRename(col.id, localName.trim()); else setLocalName(col.name); }}
          onKeyDown={e => { if(e.key === 'Enter') e.currentTarget.blur(); }}
          className="font-semibold text-sm text-center bg-transparent border-none outline-none w-full truncate focus:ring-0 text-text-primary px-1 hover:bg-surface-elevated/50 focus:bg-surface-elevated rounded transition-colors"
          title={localName}
        />
        <button onClick={() => onDelete(col.id)} className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-error hover:bg-error/10 p-0.5 rounded transition-opacity shrink-0" title="Eliminar columna">
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
  onRename,
  onCellUpdate,
  artistName,
  files,
  uploadTargetId,
  artistId,
  projectId,
  projects,
  selectedCells,
  onToggleSelect,
}: {
  row: { id: string; name: string; cells: Record<string, GridCell>; linkedFile?: { id: string; name: string; webViewLink?: string; webContentLink?: string; mimeType?: string; sourceProjectId?: string } };
  columns: { id: string; name: string; type?: ColumnType }[];
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onCellUpdate: (rowId: string, colId: string, updates: Partial<any>) => void;
  artistName: string;
  files: any[];
  uploadTargetId: string;
  artistId: string;
  projectId?: string;
  projects: any[];
  selectedCells: Set<string>;
  onToggleSelect: (rowId: string, colId: string, e: React.MouseEvent | React.PointerEvent) => void;
}) {
  const { playTrack } = useAudio();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, position: 'relative' as const, zIndex: isDragging ? 50 : 1 };

  const [localName, setLocalName] = useState(row.name);
  useEffect(() => { setLocalName(row.name); }, [row.name]);

  const { showMenu } = useContextMenu();

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    showMenu(e.clientX, e.clientY, [
      {
        label: row.linkedFile ? 'Cambiar archivo vinculado' : 'Vincular archivo manual',
        icon: 'Link',
        action: () => {
          // Trigger file link modal
          const customEvent = new CustomEvent('open-link-modal', { detail: { rowId: row.id } });
          window.dispatchEvent(customEvent);
        }
      },
      ...(row.linkedFile ? [{
        label: 'Desvincular archivo',
        icon: 'Trash2',
        action: () => {
          const customEvent = new CustomEvent('unlink-row-file', { detail: { rowId: row.id } });
          window.dispatchEvent(customEvent);
        }
      }] : [])
    ]);
  };

  return (
    <tr ref={setNodeRef} style={style} className={`group/row transition-colors ${isDragging ? 'bg-surface-elevated shadow-lg' : 'hover:bg-surface/30'}`}>
      <td className="p-1 sm:p-3 border-b border-r border-border font-medium text-sm text-text-primary bg-surface/10 w-40 sm:w-64 min-w-[160px] sm:min-w-[250px] max-w-[160px] sm:max-w-[400px]">
        <div className="flex items-center gap-1 sm:gap-2 min-w-0">
          <button {...attributes} {...listeners} className="cursor-grab text-text-secondary opacity-40 sm:opacity-0 sm:group-hover/row:opacity-60 hover:opacity-100 transition-opacity shrink-0"><GripVertical className="w-3.5 h-3.5" /></button>
          <input
            value={localName}
            onChange={e => setLocalName(e.target.value)}
            onBlur={() => { if(localName.trim() && localName !== row.name) onRename(row.id, localName.trim()); else setLocalName(row.name); }}
            onKeyDown={e => { if(e.key === 'Enter') e.currentTarget.blur(); }}
            onContextMenu={handleContextMenu}
            data-context="ignore"
            className="font-medium text-sm bg-transparent border-none outline-none flex-1 min-w-0 truncate focus:ring-0 text-text-primary px-1 hover:bg-surface-elevated/50 focus:bg-surface-elevated rounded transition-colors cursor-context-menu"
            title={localName}
          />
          {row.linkedFile?.sourceProjectId && (() => {
             const p = projects.find((x:any) => x.id === row.linkedFile!.sourceProjectId);
             if (!p) return null;
             return (
               <span
                 className="text-[9px] px-1.5 py-0.5 rounded bg-surface-elevated border border-border/50 text-text-secondary truncate max-w-[100px] shrink-0"
                 title={`Archivo del proyecto: ${p.title}`}
               >
                 {p.title}
               </span>
             );
          })()}
          <div className="flex items-center gap-1 shrink-0 opacity-100 sm:opacity-0 sm:group-hover/row:opacity-100 transition-opacity">
            {row.linkedFile && (
              <div className="flex items-center gap-1 shrink-0 bg-surface-elevated px-1 py-0.5 rounded border border-border/50">
                {(row.linkedFile.mimeType?.includes('audio/') || /\.(wav|mp3|m4a|flac|aiff|ogg)$/i.test(row.linkedFile.name)) && (
                  <button onClick={(e) => {
                    e.stopPropagation();
                    const pathSegs: { name: string; url?: string }[] = [
                      { name: 'Artistas', url: '/artists' },
                      { name: artistName, url: `/artists/${artistId}` }
                    ];
                    if (projectId) {
                      const p = projects.find((x:any) => x.id === projectId);
                      if (p) pathSegs.push({ name: p.title, url: `/artists/${artistId}?project=${projectId}` });
                    }
                    pathSegs.push({ name: row.name || row.linkedFile!.name });

                    playTrack({ id: row.linkedFile!.id, name: row.name || row.linkedFile!.name, url: `/api/audio/${row.linkedFile!.id}`, artistName, pathSegments: pathSegs });
                  }} className="text-accent hover:text-accent-light transition-colors" title="Reproducir audio">
                    <Play className="w-3.5 h-3.5" />
                  </button>
                )}
                {row.linkedFile.webViewLink && (
                  <a href={row.linkedFile.webViewLink} target="_blank" rel="noopener noreferrer" className="text-text-secondary hover:text-text-primary transition-colors" title="Abrir en Drive">
                    <Link className="w-3.5 h-3.5" />
                  </a>
                )}
                {row.linkedFile.webContentLink && (
                  <a href={row.linkedFile.webContentLink} className="text-text-secondary hover:text-text-primary transition-colors" title="Descargar archivo">
                    <Download className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            )}
            <button
              onClick={() => {
                const customEvent = new CustomEvent('open-comments-modal', { detail: { rowId: row.id, name: row.name } });
                window.dispatchEvent(customEvent);
              }}
              className="text-text-secondary hover:text-accent p-1 rounded transition-colors shrink-0"
              title="Observaciones"
            >
              <MessageSquare className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onDelete(row.id)} className="text-error hover:bg-error/10 p-1 rounded transition-opacity shrink-0" title="Eliminar fila"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      </td>
      {columns.map(col => (
        <CellComponent
          key={col.id} rowId={row.id} colId={col.id} colType={col.type as ColumnType} cellData={row.cells[col.id] || { status: 'todo' }}
          artistName={artistName} files={files} onUpdate={onCellUpdate} uploadTargetId={uploadTargetId}
          artistId={artistId} projectId={projectId} projects={projects} rowName={row.name}
          isSelected={selectedCells.has(`${row.id}:${col.id}`)}
          onToggleSelect={(e) => onToggleSelect(row.id, col.id, e)}
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
  artistName = 'Artista',
  initialGrid,
  initialProjectId
}: {
  artistId: string;
  matrixId: string;
  matrixName?: string;
  artistName?: string;
  initialGrid?: ProductionGrid;
  initialProjectId?: string;
}) {
  const [grid, setGrid] = useState<ProductionGrid>(initialGrid || { columns: [], rows: [], mode: 'simple' });
  const [isLoading, setIsLoading] = useState(!initialGrid);
  const [isSaving, setIsSaving] = useState(false);
  const [newRowName, setNewRowName] = useState('');
  const { showMenu } = useContextMenu();

  // Modals state
  const [linkingRowId, setLinkingRowId] = useState<string | null>(null);
  const [commentingRow, setCommentingRow] = useState<{id: string, name: string} | null>(null);
  const [commentsText, setCommentsText] = useState('');

  // Projects, Campaigns and Files logic
  const [projects, setProjects] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [linkedProjectId, setLinkedProjectId] = useState<string>(initialProjectId || '');
  const [files, setFiles] = useState<any[]>([]);

  // Selection logic
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [lastSelectedCellId, setLastSelectedCellId] = useState<string | null>(null);
  const [selectionBox, setSelectionBox] = useState<{ start: {x:number, y:number}, end: {x:number, y:number}, active: boolean }>({ start:{x:0,y:0}, end:{x:0,y:0}, active: false });
  const containerRef = useRef<HTMLTableElement>(null);
  const selectionInitialSet = useRef<Set<string>>(new Set());

  // Refs for callbacks to avoid stale closures
  const gridRef = useRef(grid);
  useEffect(() => { gridRef.current = grid; }, [grid]);

  const selectedCellsRef = useRef(selectedCells);
  useEffect(() => { selectedCellsRef.current = selectedCells; }, [selectedCells]);

  const linkedProjectIdRef = useRef(linkedProjectId);
  useEffect(() => { linkedProjectIdRef.current = linkedProjectId; }, [linkedProjectId]);

  const lastSelectedCellIdRef = useRef<string | null>(null);
  useEffect(() => { lastSelectedCellIdRef.current = lastSelectedCellId; }, [lastSelectedCellId]);

  const selectionBoxActiveRef = useRef(false);
  useEffect(() => { selectionBoxActiveRef.current = selectionBox.active; }, [selectionBox.active]);

  // ── Serialized save queue ────────────────────────────────────────────────
  // Every save sends the whole grid. Requests could finish out of order (each one also
  // syncs Google Calendar), so an older grid could overwrite a newer one. Saves are sent
  // one at a time and intermediate states are coalesced: only the latest grid is sent next.
  const pendingSaveRef = useRef<{ grid: ProductionGrid; projectId: string } | null>(null);
  const isSavingRef = useRef(false);

  const flushSaves = useCallback(async () => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    setIsSaving(true);
    try {
      while (pendingSaveRef.current) {
        const job = pendingSaveRef.current;
        pendingSaveRef.current = null;
        try {
          const res = await fetch(`/api/artists/${artistId}/matrices/${matrixId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productionGrid: job.grid, projectId: job.projectId })
          });
          if (!res.ok) throw new Error('save failed');
        } catch (e) {
          console.error(e);
          customAlert('Error guardando en Drive. Los cambios podrían no haberse sincronizado.');
        }
      }
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [artistId, matrixId]);

  const saveGrid = useCallback((newGrid: ProductionGrid, newLinkedProjectId?: string) => {
    // Optimistic UI update (the ref is updated immediately so consecutive edits build on it)
    gridRef.current = newGrid;
    setGrid(newGrid);
    pendingSaveRef.current = {
      grid: newGrid,
      projectId: newLinkedProjectId !== undefined ? newLinkedProjectId : linkedProjectIdRef.current,
    };
    flushSaves();
  }, [flushSaves]);

  // DND sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  useEffect(() => {
    const handleOpenLink = (e: any) => setLinkingRowId(e.detail.rowId);
    const handleUnlink = (e: any) => {
      const current = gridRef.current;
      const newRows = current.rows.map(r => r.id === e.detail.rowId ? { ...r, linkedFile: undefined } : r);
      saveGrid({ ...current, rows: newRows });
    };
    const handleOpenComments = (e: any) => {
      const row = gridRef.current.rows.find(r => r.id === e.detail.rowId);
      setCommentsText(row?.cells?.['_comments']?.textValue || '');
      setCommentingRow({ id: e.detail.rowId, name: e.detail.name });
    };

    const handleGlobalUp = () => {
      if (selectionBoxActiveRef.current) setSelectionBox(prev => ({ ...prev, active: false }));
    };
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedCells(new Set());
        setLastSelectedCellId(null);
        setSelectionBox(prev => ({ ...prev, active: false }));
      }
    };

    window.addEventListener('open-link-modal', handleOpenLink);
    window.addEventListener('unlink-row-file', handleUnlink);
    window.addEventListener('open-comments-modal', handleOpenComments);
    window.addEventListener('pointerup', handleGlobalUp);
    window.addEventListener('keydown', handleGlobalKeyDown);

    return () => {
      window.removeEventListener('open-link-modal', handleOpenLink);
      window.removeEventListener('unlink-row-file', handleUnlink);
      window.removeEventListener('open-comments-modal', handleOpenComments);
      window.removeEventListener('pointerup', handleGlobalUp);
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [saveGrid]);

  useEffect(() => {
    if (artistId && matrixId) {
      fetchGrid();
      fetchProjects();
      fetchCampaigns();
    }
  }, [artistId, matrixId]);

  useEffect(() => {
    if (artistId) {
      fetchFiles(linkedProjectId);
    }
    // campaigns: a matrix linked to a campaign needs the campaign list to resolve its folders
  }, [artistId, linkedProjectId, campaigns]);

  const fetchGrid = async () => {
    if (!grid.rows.length && !grid.columns.length) {
      setIsLoading(true);
    }
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

  const fetchCampaigns = async () => {
    try {
      const res = await fetch(`/api/artists/${artistId}/campaigns`);
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns || []);
      }
    } catch (e) { console.error(e); }
  };

  const fetchFiles = async (projId: string) => {
    try {
      // ── 1. Deep-fetch all files from the linked project or campaign ─────────
      let projectAudioFiles: any[] = [];
      const campaign = campaigns.find(c => c.id === projId);

      const fetchFromProject = async (id: string) => {
        const projectRes = await fetch(`/api/projects/${id}`);
        if (projectRes.ok) {
          const data = await projectRes.json();
          // Flatten: root files + all files from every recursive sub-folder
          const allProjectFiles = [
            ...(data.rootFiles || []),
            ...(data.folders ? data.folders.flatMap((f: any) => f.files || []) : [])
          ];
          return allProjectFiles.filter((f: any) =>
            f.mimeType?.startsWith('audio/') ||
            /\.(wav|mp3|m4a|flac|aiff|ogg)$/i.test(f.name || '')
          ).map(f => ({ ...f, sourceProjectId: id }));
        }
        return [];
      };

      if (campaign) {
        const results = await Promise.all(campaign.driveFolderIds.map((id: string) => fetchFromProject(id)));
        projectAudioFiles = results.flat();
      } else if (projId) {
        projectAudioFiles = await fetchFromProject(projId);
      }

      // ── 2. Deep-fetch all audio from artist root (covers bounces etc.) ───
      const artistRes = await fetch(`/api/artists/${artistId}/files`);
      let artistAudioFiles: any[] = [];
      if (artistRes.ok) {
        const data = await artistRes.json();
        artistAudioFiles = (data.files || []).filter((f: any) =>
          f.mimeType?.startsWith('audio/') ||
          /\.(wav|mp3|m4a|flac|aiff|ogg)$/i.test(f.name || '')
        );
      }

      // ── 3. Merge, deduplicate by file id ────────────────────────────────
      const seen = new Set<string>();
      const allFiles: any[] = [];
      for (const f of [...projectAudioFiles, ...artistAudioFiles]) {
        if (!seen.has(f.id)) {
          seen.add(f.id);
          allFiles.push(f);
        }
      }

      setFiles(allFiles);

      // ── 4. Intelligent Auto-Match Logic ─────────────────────────────────
      const prevGrid = gridRef.current;
      let hasChanges = false;
      const audioFiles = allFiles;

      const normalize = (str: string) => {
        if (!str) return '';
        return str.toLowerCase().normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/\b(master|mix|24bits|16bits|48khz|44khz|instrumental|vocal|acapella|beat|final|bounce|ft|feat|prod)\b/g, "")
          .replace(/[^a-z0-9]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      };

      const checkMatch = (fileName: string, rowName: string) => {
        const fileNameNorm = normalize(fileName.replace(/\.(wav|mp3|m4a|flac|aiff|ogg)$/i, ''));
        const rowNameNorm = normalize(rowName);
        if (!fileNameNorm || !rowNameNorm) return 0;

        // Token-based match with heavy penalty for non-matching long tokens
        const rowTokens = rowNameNorm.split(' ').filter(t => t.length > 1);
        const fileTokens = fileNameNorm.split(' ').filter(t => t.length > 1);

        if (rowTokens.length === 0 || fileTokens.length === 0) return 0;

        let matchCount = 0;
        for (const rt of rowTokens) {
          if (fileTokens.includes(rt)) matchCount += 2; // Exact word match is stronger
          else if (fileTokens.some(ft => ft.includes(rt) || rt.includes(ft))) matchCount += 1;
        }

        if (matchCount > 0 && (matchCount / (rowTokens.length * 2)) >= 0.5) {
          return 1000 + matchCount * 10 - Math.abs(fileNameNorm.length - rowNameNorm.length);
        }
        return 0;
      };

      const newRows = prevGrid.rows.map(row => {
        if (!row.name?.trim()) return row;
        let rowModified = false;
        const newCells = { ...row.cells };
        let newLinkedFile = row.linkedFile;

        // Find best matching audio file for this row
        let bestMatch: any = null;
        let bestScore = 0;
        for (const file of audioFiles) {
          const score = checkMatch(file.name, row.name);
          if (score > bestScore) {
            bestScore = score;
            bestMatch = file;
          }
        }

        // Apply to file-type columns if not already set
        for (const col of prevGrid.columns) {
          if (col.type === 'file') {
            const cell = newCells[col.id] || { status: 'todo' };
            if (!cell.fileId && bestMatch) {
              newCells[col.id] = { ...cell, fileId: bestMatch.id, fileName: bestMatch.name, status: 'done' };
              rowModified = true;
            }
          }
        }

        // Always attach linkedFile for the play button
        if (!row.linkedFile && bestMatch) {
          newLinkedFile = {
            id: bestMatch.id,
            name: bestMatch.name,
            webViewLink: bestMatch.webViewLink,
            webContentLink: bestMatch.webContentLink,
            mimeType: bestMatch.mimeType,
            sourceProjectId: bestMatch.sourceProjectId
          } as any;
          rowModified = true;
        }

        if (rowModified) {
          hasChanges = true;
          return { ...row, cells: newCells, linkedFile: newLinkedFile };
        }
        return row;
      });

      // Only save if the grid did not change meanwhile and the project is still the same
      if (hasChanges && gridRef.current === prevGrid && linkedProjectIdRef.current === projId) {
        saveGrid({ ...prevGrid, rows: newRows }, projId);
      }
    } catch (e) { console.error(e); }
  };

  const handleLinkProject = (projId: string) => {
    setLinkedProjectId(projId);
    linkedProjectIdRef.current = projId;
    saveGrid(gridRef.current, projId);
  };



  const handleToggleSelect = useCallback((rowId: string, colId: string, e: React.MouseEvent | React.PointerEvent) => {
    const cellId = `${rowId}:${colId}`;
    const currentGrid = gridRef.current;
    const currentSelected = selectedCellsRef.current;

    const lastId = lastSelectedCellIdRef.current;
    if (e.shiftKey && lastId) {
      const [lastRowId, lastColId] = lastId.split(':');
      const rIdx1 = currentGrid.rows.findIndex(r => r.id === lastRowId);
      const cIdx1 = currentGrid.columns.findIndex(c => c.id === lastColId);
      const rIdx2 = currentGrid.rows.findIndex(r => r.id === rowId);
      const cIdx2 = currentGrid.columns.findIndex(c => c.id === colId);

      if (rIdx1 !== -1 && cIdx1 !== -1 && rIdx2 !== -1 && cIdx2 !== -1) {
        const minR = Math.min(rIdx1, rIdx2);
        const maxR = Math.max(rIdx1, rIdx2);
        const minC = Math.min(cIdx1, cIdx2);
        const maxC = Math.max(cIdx1, cIdx2);

        const newSet = new Set(currentSelected);
        for (let r = minR; r <= maxR; r++) {
          for (let c = minC; c <= maxC; c++) {
            newSet.add(`${currentGrid.rows[r].id}:${currentGrid.columns[c].id}`);
          }
        }
        setSelectedCells(newSet);
      }
    } else {
      setSelectedCells(prev => {
        const newSet = new Set(prev);
        if (newSet.has(cellId)) newSet.delete(cellId);
        else newSet.add(cellId);
        return newSet;
      });
    }
    setLastSelectedCellId(cellId);
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLTableElement>) => {
    if (e.button !== 0 || (!e.ctrlKey && !e.metaKey && !e.shiftKey)) return;
    if (e.ctrlKey || e.metaKey) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setSelectionBox({ start: {x,y}, end: {x,y}, active: true });
      selectionInitialSet.current = new Set(selectedCells);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLTableElement>) => {
    if (!selectionBox.active) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setSelectionBox(prev => ({ ...prev, end: {x,y} }));

    const boxRect = {
      left: Math.min(selectionBox.start.x, x) + rect.left,
      right: Math.max(selectionBox.start.x, x) + rect.left,
      top: Math.min(selectionBox.start.y, y) + rect.top,
      bottom: Math.max(selectionBox.start.y, y) + rect.top,
    };

    const newSelection = new Set(selectionInitialSet.current);
    const cellElements = document.querySelectorAll('[data-cell-id]');

    cellElements.forEach(el => {
      const cellRect = el.getBoundingClientRect();
      if (
        cellRect.left < boxRect.right &&
        cellRect.right > boxRect.left &&
        cellRect.top < boxRect.bottom &&
        cellRect.bottom > boxRect.top
      ) {
        const id = el.getAttribute('data-cell-id');
        if (id) newSelection.add(id);
      }
    });
    setSelectedCells(newSelection);
    if (newSelection.size > 0) {
      const last = Array.from(newSelection).pop();
      if (last) setLastSelectedCellId(last);
    }
  };

  useEffect(() => {
    const handlePointerUp = () => {
      if (selectionBox.active) {
        setSelectionBox(prev => ({ ...prev, active: false }));
      }
    };
    if (selectionBox.active) {
      window.addEventListener('pointerup', handlePointerUp);
    }
    return () => window.removeEventListener('pointerup', handlePointerUp);
  }, [selectionBox.active]);

  const addRow = () => {
    if (!newRowName.trim()) return;
    const current = gridRef.current;
    const newRow = { id: Math.random().toString(36).substring(2, 11), name: newRowName.trim(), cells: {} };
    saveGrid({ ...current, rows: [...current.rows, newRow] });
    setNewRowName('');
  };

  const renameColumn = (id: string, newName: string) => {
    if (!newName.trim()) return;
    const current = gridRef.current;
    saveGrid({ ...current, columns: current.columns.map(c => c.id === id ? { ...c, name: newName } : c) });
  };

  const renameRow = (id: string, newName: string) => {
    if (!newName.trim()) return;
    const current = gridRef.current;
    saveGrid({ ...current, rows: current.rows.map(r => r.id === id ? { ...r, name: newName } : r) });
  };

  const deleteColumn = async (id: string) => {
    if (!await customConfirm('¿Eliminar columna y sus datos?')) return;
    const current = gridRef.current;
    // Remove the column's cells too (otherwise they stayed as "ghost" pending tasks)
    saveGrid({
      ...current,
      columns: current.columns.filter(c => c.id !== id),
      rows: current.rows.map(r => {
        if (!r.cells || !(id in r.cells)) return r;
        const { [id]: _removed, ...rest } = r.cells;
        return { ...r, cells: rest };
      }),
    });
  };

  const deleteRow = async (id: string) => {
    if (!await customConfirm('¿Eliminar fila?')) return;
    const current = gridRef.current;
    saveGrid({ ...current, rows: current.rows.filter(r => r.id !== id) });
  };

  const handleCellUpdate = useCallback((rowId: string, colId: string, updates: Partial<any>) => {
    const currentGrid = gridRef.current;
    const currentSelected = selectedCellsRef.current;
    const cellId = `${rowId}:${colId}`;
    const isSelected = currentSelected.has(cellId);

    const newRows = currentGrid.rows.map(r => {
      if (isSelected && updates.status) {
         let rowChanged = false;
         const newCells = { ...r.cells };
         for (const c of currentGrid.columns) {
           const id = `${r.id}:${c.id}`;
           if (currentSelected.has(id)) {
             newCells[c.id] = { ...(r.cells[c.id] || { status: 'todo' }), status: updates.status };
             rowChanged = true;
           }
         }
         if (rowChanged) return { ...r, cells: newCells };
      }

      if (r.id !== rowId) return r;
      const updatedCell = { ...(r.cells[colId] || { status: 'todo' }), ...updates };
      return { ...r, cells: { ...r.cells, [colId]: updatedCell } };
    });
    saveGrid({ ...currentGrid, rows: newRows });
  }, [saveGrid]);

  const handleUnifiedDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const isCol = grid.columns.some(c => c.id === active.id);
    if (isCol) {
      const oldIdx = grid.columns.findIndex(c => c.id === active.id);
      const newIdx = grid.columns.findIndex(c => c.id === over.id);
      if (oldIdx !== -1 && newIdx !== -1) {
        saveGrid({ ...gridRef.current, columns: arrayMove(gridRef.current.columns, oldIdx, newIdx) });
      }
    } else {
      const oldIdx = grid.rows.findIndex(r => r.id === active.id);
      const newIdx = grid.rows.findIndex(r => r.id === over.id);
      if (oldIdx !== -1 && newIdx !== -1) {
        saveGrid({ ...gridRef.current, rows: arrayMove(gridRef.current.rows, oldIdx, newIdx) });
      }
    }
  };

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-accent" /></div>;

  // Progress only counts trackable columns that still exist (ignores notes/_comments and deleted columns)
  const trackableCols = grid.columns.filter(c => !c.type || c.type === 'status' || c.type === 'file');
  const totalCells = trackableCols.length * grid.rows.length;
  const doneCells = grid.rows.reduce((acc, row) => acc + trackableCols.filter(c => row.cells?.[c.id]?.status === 'done').length, 0);
  const progress = totalCells === 0 ? 0 : Math.round((doneCells / totalCells) * 100);

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between items-start gap-3 sm:gap-4">
        <div className="block">
          <h3 className="text-lg sm:text-xl font-bold text-text-primary">{matrixName}</h3>
          <p className="text-xs sm:text-sm text-text-secondary">Trackeo modular por canción y fase.</p>
        </div>
        <div className="w-full sm:w-auto flex flex-col sm:items-end items-start gap-2 sm:gap-3">
          <CampaignSelector
            linkedProjectId={linkedProjectId}
            campaigns={campaigns}
            projects={projects}
            onLinkProject={handleLinkProject}
            onOpenCampaignModal={() => customAlert('Funcionalidad de crear campaña en desarrollo. Ve a Artistas > Campañas por ahora.')}
          />
          <div className="flex items-center gap-4 w-full justify-between sm:justify-end">
            <div className="text-xs sm:text-sm font-bold text-text-secondary">{progress}% Completado</div>
            {isSaving && <Loader2 className="w-4 h-4 animate-spin text-accent" />}
          </div>
        </div>
      </div>

      {/* Mobile scroll hint */}
      <div className="relative">
        {/* Fade indicator for horizontal scroll */}
        <div className="pointer-events-none absolute top-0 right-0 bottom-0 w-8 bg-gradient-to-l from-background/80 to-transparent z-10 md:hidden rounded-r-xl" />
        <div className="overflow-x-auto bg-surface-elevated/30 rounded-xl border border-border shadow-sm relative" style={{ touchAction: 'pan-x pan-y' }}>
          {selectionBox.active && (
            <div
              className="absolute bg-accent/20 border border-accent pointer-events-none z-50 rounded"
              style={{
                left: Math.min(selectionBox.start.x, selectionBox.end.x),
                top: Math.min(selectionBox.start.y, selectionBox.end.y),
                width: Math.abs(selectionBox.end.x - selectionBox.start.x),
                height: Math.abs(selectionBox.end.y - selectionBox.start.y),
              }}
            />
          )}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleUnifiedDragEnd}>
            <table
              ref={containerRef}
              className="w-full text-left border-collapse select-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
            >
              <thead>
                <tr>
                  <th className="p-1.5 sm:p-3 border-b border-r border-border bg-surface/50 w-40 sm:w-64 min-w-[160px] sm:min-w-[250px] max-w-[160px] sm:max-w-[400px]">
                    <div className="flex items-center gap-1">
                      <Input placeholder="Nueva fila..." value={newRowName} onChange={e => setNewRowName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addRow()} className="h-7 text-xs bg-transparent w-full" />
                      <Button size="sm" variant="ghost" onClick={addRow} disabled={!newRowName.trim()} className="h-7 px-1.5 shrink-0"><Plus className="w-3.5 h-3.5" /></Button>
                    </div>
                  </th>

                  <SortableContext items={grid.columns.map(c => c.id)} strategy={horizontalListSortingStrategy}>
                    {grid.columns.map(col => <SortableColHeader key={col.id} col={col} onDelete={deleteColumn} onRename={renameColumn} />)}
                  </SortableContext>

                  <th className="p-1 sm:p-2 border-b border-border bg-surface/50 w-10 min-w-[40px] max-w-[40px] shrink-0 text-center">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.preventDefault();
                        showMenu(e.clientX, e.clientY, COL_TYPES.map(t => ({
                          label: t.label,
                          icon: t.id === 'status' ? 'Circle' : t.id === 'file' ? 'Paperclip' : t.id === 'checklist' ? 'CheckSquare' : t.id === 'text' ? 'AlignLeft' : 'Calendar',
                          action: () => {
                            const current = gridRef.current;
                            const id = Math.random().toString(36).substring(2, 11);
                            const updatedRows = current.rows.map(r => ({ ...r, cells: { ...r.cells, [id]: { status: 'todo' as FlexTaskStatus } } }));
                            saveGrid({ ...current, columns: [...current.columns, { id, name: t.label, type: t.id }], rows: updatedRows });
                          }
                        })));
                      }}
                      className="h-7 w-7 p-0 shrink-0 text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
                      title="Añadir Columna"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </th>
                </tr>
              </thead>

              <tbody>
                <SortableContext items={grid.rows.map(r => r.id)} strategy={verticalListSortingStrategy}>
                  {grid.rows.map(row => (
                    <SortableRow
                      key={row.id} row={row} columns={grid.columns} onDelete={deleteRow} onRename={renameRow} onCellUpdate={handleCellUpdate}
                      artistName={artistName} files={files} uploadTargetId={linkedProjectId || artistId}
                      artistId={artistId} projectId={linkedProjectId} projects={projects}
                      selectedCells={selectedCells} onToggleSelect={handleToggleSelect}
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
            </table>
          </DndContext>
        </div>
      </div>{/* end scroll wrapper */}

      {linkingRowId && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4" onClick={() => setLinkingRowId(null)}>
          <div className="glass rounded-xl border border-border bg-surface w-full max-w-md p-6 shadow-2xl relative animate-fade-in" onClick={e => e.stopPropagation()}>
            <button onClick={() => setLinkingRowId(null)} className="absolute top-4 right-4 text-text-secondary hover:text-text-primary p-1"><X className="w-5 h-5" /></button>
            <h4 className="text-lg font-bold text-text-primary mb-4 flex items-center gap-2"><Link className="w-5 h-5 text-accent"/> Vincular Archivo</h4>
            <p className="text-sm text-text-secondary mb-4">Selecciona un archivo de audio para vincular a esta fila manualmente.</p>
            <div className="max-h-[50vh] overflow-y-auto space-y-1 pr-2">
              {files.filter(f => f.mimeType?.includes('audio') || /\.(wav|mp3|m4a|flac|aiff|ogg)$/i.test(f.name)).map(f => (
                <button
                  key={f.id}
                  onClick={() => {
                    const current = gridRef.current;
                    const updatedGrid = {
                      ...current,
                      rows: current.rows.map(r => r.id === linkingRowId ? {
                        ...r,
                        linkedFile: { id: f.id, name: f.name, webViewLink: f.webViewLink, webContentLink: f.webContentLink, mimeType: f.mimeType, sourceProjectId: f.sourceProjectId } as any
                      } : r)
                    };
                    saveGrid(updatedGrid);
                    setLinkingRowId(null);
                  }}
                  className="w-full flex items-center justify-between text-left p-2 rounded hover:bg-surface-elevated text-sm transition-colors border border-transparent hover:border-border"
                >
                  <div className="flex flex-col min-w-0 pr-4">
                    <span className="truncate text-text-primary">{f.name}</span>
                    {f.sourceProjectId && (
                      <span className="text-[10px] text-text-secondary truncate mt-0.5">
                        Del proyecto: {projects.find(p => p.id === f.sourceProjectId)?.title || 'Desconocido'}
                      </span>
                    )}
                  </div>
                </button>
              ))}
              {files.length === 0 && <p className="text-xs text-text-secondary italic text-center py-4">No se encontraron archivos de audio.</p>}
            </div>
          </div>
        </div>
      )}

      {commentingRow && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[200] flex flex-col items-end justify-end sm:justify-center p-0 sm:p-4" onClick={() => setCommentingRow(null)}>
          <div className="glass rounded-t-2xl sm:rounded-xl border border-border bg-surface w-full sm:max-w-lg shadow-2xl animate-slide-up flex flex-col h-[70vh] sm:h-[60vh]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <div>
                <h4 className="text-lg font-bold text-text-primary flex items-center gap-2"><MessageSquare className="w-5 h-5 text-accent"/> Observaciones</h4>
                <p className="text-xs text-text-secondary mt-0.5">{commentingRow.name}</p>
              </div>
              <button onClick={() => setCommentingRow(null)} className="text-text-secondary hover:text-text-primary p-1"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 flex-1 flex flex-col min-h-0">
              <textarea
                value={commentsText}
                onChange={e => setCommentsText(e.target.value)}
                placeholder="Añade observaciones, letras o notas sobre esta canción aquí..."
                className="flex-1 w-full bg-surface-elevated border border-border rounded-lg p-3 text-sm text-text-primary resize-none outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/50"
              />
            </div>
            <div className="p-4 border-t border-border flex justify-end shrink-0">
              <Button onClick={() => {
                const current = gridRef.current;
                const newRows = current.rows.map(r => r.id === commentingRow.id ? {
                  ...r,
                  cells: { ...r.cells, _comments: { status: 'todo' as FlexTaskStatus, textValue: commentsText } }
                } : r);
                saveGrid({ ...current, rows: newRows });
                setCommentingRow(null);
              }}>Guardar Observaciones</Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pt-2 px-2 text-xs text-text-secondary">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
          const Icon = cfg.icon;
          return <div key={key} className="flex items-center gap-1.5"><Icon className={`w-4 h-4 ${cfg.color}`} /><span>{cfg.label}</span></div>;
        })}
      </div>
    </div>
  );
}
