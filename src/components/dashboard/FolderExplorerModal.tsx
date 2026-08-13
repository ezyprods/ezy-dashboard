'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X, FolderOpen, Folder, FileAudio, FileImage, FileText, Film, File as FileIcon,
  ChevronRight, Loader2, Play, Pause, Download, Search, LayoutGrid, List,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAudio } from '@/lib/contexts/AudioContext';

interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
  webViewLink?: string;
  webContentLink?: string;
  bpm?: string | number | null;
  key?: string | null;
}

interface Breadcrumb {
  id: string;
  name: string;
}

export interface FolderExplorerModalProps {
  isOpen: boolean;
  onClose: () => void;
  folderId: string | null;
  folderName?: string;
  highlightFileId?: string;
  highlightFileName?: string;
}

type SortOption = 'date-desc' | 'date-asc' | 'name-asc' | 'name-desc';

const getIcon = (mimeType?: string, name?: string) => {
  const m = mimeType || '';
  const n = (name || '').toLowerCase();
  if (n.endsWith('.flp')) return <FileAudio className="w-4 h-4 text-orange-400" />;
  if (m === 'application/vnd.google-apps.folder') return <Folder className="w-4 h-4 text-accent" />;
  if (m.startsWith('audio/')) return <FileAudio className="w-4 h-4 text-purple-400" />;
  if (m.startsWith('image/')) return <FileImage className="w-4 h-4 text-green-400" />;
  if (m.startsWith('video/')) return <Film className="w-4 h-4 text-red-400" />;
  if (m.includes('pdf') || m.includes('document') || m === 'application/vnd.google-apps.document') return <FileText className="w-4 h-4 text-blue-400" />;
  if (m.includes('sheet') || m === 'application/vnd.google-apps.spreadsheet') return <FileText className="w-4 h-4 text-emerald-400" />;
  return <FileIcon className="w-4 h-4 text-text-secondary" />;
};

const formatDate = (t?: string) => {
  if (!t) return '';
  const d = new Date(t);
  const time = d.getTime();
  if (isNaN(time)) return '';
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
};

const parseTime = (t?: string) => {
  if (!t) return 0;
  const time = new Date(t).getTime();
  return isNaN(time) ? 0 : time;
};

export function FolderExplorerModal({
  isOpen,
  onClose,
  folderId,
  highlightFileId,
  highlightFileName,
}: FolderExplorerModalProps) {
  const [mounted, setMounted] = useState(false);
  const [items, setItems] = useState<DriveItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [sortBy, setSortBy] = useState<SortOption>('date-desc');
  const audio = useAudio();

  useEffect(() => {
    setMounted(true);
  }, []);

  const currentTrack = audio?.currentTrack;
  const isPlaying = audio?.isPlaying ?? false;
  const playTrack = audio?.playTrack;
  const togglePlay = audio?.togglePlay;

  const fetchFolder = useCallback(async (id: string) => {
    if (!id) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/files?folderId=${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error('Error de red');
      const data = await res.json();
      const itemsList = Array.isArray(data.items) ? data.items : [];
      const filtered = itemsList.filter(
        (i: any) => i && typeof i.name === 'string' && !i.name.endsWith('.json') && i.mimeType !== 'application/json'
      );
      setItems(filtered);
    } catch {
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen || !folderId) return;
    const initialName = typeof highlightFileName === 'string' && highlightFileName.trim()
      ? 'Carpeta del archivo'
      : 'Carpeta';
    setBreadcrumbs([{ id: folderId, name: initialName }]);
    setSearchQuery('');
    fetchFolder(folderId);
  }, [isOpen, folderId, highlightFileName, fetchFolder]);

  const navigateTo = (id: string, name: string) => {
    setBreadcrumbs(prev => [...prev, { id, name }]);
    fetchFolder(id);
  };

  const navigateUp = (idx: number) => {
    const newCrumbs = breadcrumbs.slice(0, idx + 1);
    setBreadcrumbs(newCrumbs);
    if (newCrumbs.length > 0) {
      fetchFolder(newCrumbs[newCrumbs.length - 1].id);
    }
  };

  const displayItems = useMemo(() => {
    const list = Array.isArray(items) ? items : [];
    const query = typeof searchQuery === 'string' ? searchQuery.toLowerCase().trim() : '';
    const filtered = query
      ? list.filter(i => i && typeof i.name === 'string' && i.name.toLowerCase().includes(query))
      : list;

    return [...filtered].sort((a, b) => {
      if (!a || !b) return 0;
      const aF = a.mimeType === 'application/vnd.google-apps.folder';
      const bF = b.mimeType === 'application/vnd.google-apps.folder';
      if (aF && !bF) return -1;
      if (!aF && bF) return 1;

      if (sortBy === 'date-desc') {
        const timeA = parseTime(a.createdTime || a.modifiedTime);
        const timeB = parseTime(b.createdTime || b.modifiedTime);
        return timeB - timeA;
      }
      if (sortBy === 'date-asc') {
        const timeA = parseTime(a.createdTime || a.modifiedTime);
        const timeB = parseTime(b.createdTime || b.modifiedTime);
        return timeA - timeB;
      }
      if (sortBy === 'name-desc') {
        return (b.name || '').localeCompare(a.name || '');
      }
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [items, searchQuery, sortBy]);

  if (!mounted || !isOpen || !folderId || typeof document === 'undefined' || !document.body) {
    return null;
  }

  const safeHighlightName = typeof highlightFileName === 'string' && highlightFileName
    ? highlightFileName.replace(/\.[^/.]+$/, '')
    : '';

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 md:p-10 animate-in fade-in duration-150">
      {/* GPU-friendly dark backdrop */}
      <div className="fixed inset-0 bg-black/80 transition-opacity" onClick={onClose} />
      
      {/* Modal Dialog */}
      <div className="relative w-full max-w-4xl h-[85vh] max-h-[780px] bg-surface border border-border shadow-2xl rounded-2xl flex flex-col animate-in zoom-in-95 duration-150 overflow-hidden transform-gpu z-10">

        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center gap-3 shrink-0 bg-surface-elevated/60">
          <div className="w-9 h-9 rounded-xl bg-accent/10 text-accent flex items-center justify-center shrink-0">
            <FolderOpen className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-text-primary truncate leading-tight">
              {safeHighlightName ? `Ubicación de "${safeHighlightName}"` : 'Explorador de archivos'}
            </h2>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {breadcrumbs.map((crumb, idx) => (
                <span key={crumb.id} className="flex items-center gap-1.5 shrink-0">
                  {idx > 0 && <ChevronRight className="w-3 h-3 text-text-secondary/40" />}
                  <button
                    onClick={() => navigateUp(idx)}
                    className={cn(
                      "text-xs px-1.5 py-0.5 rounded transition-colors",
                      idx === breadcrumbs.length - 1 ? "text-accent font-bold" : "text-text-secondary hover:text-text-primary"
                    )}
                  >
                    {crumb.name}
                  </button>
                </span>
              ))}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-surface-elevated text-text-secondary hover:text-text-primary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-6 py-3 border-b border-border/50 flex items-center gap-3 shrink-0 bg-surface/50">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-text-secondary absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Filtrar por nombre..."
              className="w-full bg-surface border border-border/60 rounded-xl pl-9 pr-9 py-2 text-xs text-text-primary placeholder:text-text-secondary/70 focus:outline-none focus:border-accent"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortOption)}
            className="bg-surface border border-border/60 rounded-xl px-3 py-2 text-xs font-semibold text-text-primary focus:outline-none focus:border-accent cursor-pointer"
            title="Ordenar por"
          >
            <option value="date-desc">Recientes primero</option>
            <option value="date-asc">Antiguos primero</option>
            <option value="name-asc">Nombre (A-Z)</option>
            <option value="name-desc">Nombre (Z-A)</option>
          </select>
          <div className="flex bg-surface border border-border/60 rounded-xl p-0.5 gap-0.5">
            <button
              onClick={() => setViewMode('list')}
              className={cn("p-2 rounded-lg transition-colors", viewMode === 'list' ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary")}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={cn("p-2 rounded-lg transition-colors", viewMode === 'grid' ? "bg-accent text-white" : "text-text-secondary hover:text-text-primary")}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-7 h-7 animate-spin text-accent" />
            </div>
          ) : displayItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-text-secondary">
              <Folder className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm font-medium">{searchQuery ? 'Sin resultados' : 'Carpeta vacía'}</p>
            </div>
          ) : viewMode === 'list' ? (
            <div className="divide-y divide-border/30">
              {displayItems.map(item => {
                if (!item) return null;
                const isFolder = item.mimeType === 'application/vnd.google-apps.folder';
                const isAudio = item.mimeType?.startsWith('audio/');
                const isHl = item.id === highlightFileId;
                const isActive = currentTrack?.id === item.id;
                const isPlayingNow = isActive && isPlaying;
                const sizeMb = item.size ? parseInt(item.size, 10) / (1024 * 1024) : 0;
                const sizeText = !isNaN(sizeMb) && sizeMb > 0 ? `${sizeMb.toFixed(1)} MB` : '';

                return (
                  <div
                    key={item.id}
                    onDoubleClick={() => {
                      if (isFolder) navigateTo(item.id, item.name);
                      else window.open(item.webViewLink || `/api/files/${item.id}?inline=true`, '_blank');
                    }}
                    className={cn(
                      "group flex items-center gap-3 px-6 py-3 cursor-pointer transition-colors border-l-2",
                      isHl ? "bg-accent/8 border-l-accent" : "hover:bg-surface-elevated/50 border-l-transparent"
                    )}
                  >
                    <div className="w-8 shrink-0 flex items-center justify-center">
                      {isAudio ? (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            if (isActive && togglePlay) {
                              togglePlay();
                            } else if (playTrack) {
                              playTrack({
                                id: item.id,
                                name: (item.name || '').replace(/\.[^/.]+$/, ''),
                                url: `/api/audio/${item.id}`,
                              });
                            }
                          }}
                          className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center transition-all border",
                            isActive ? "bg-accent border-accent text-white" : "border-border text-text-secondary hover:border-accent hover:text-accent"
                          )}
                        >
                          {isPlayingNow ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-px" />}
                        </button>
                      ) : (
                        getIcon(item.mimeType, item.name)
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm font-semibold truncate", isActive || isHl ? "text-accent" : "text-text-primary")}>
                        {item.name || 'Sin nombre'}
                        {isHl && (
                          <span className="ml-2 text-[9px] font-bold bg-accent/20 text-accent px-2 py-0.5 rounded-full align-middle">
                            este archivo
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-text-secondary mt-0.5 flex items-center gap-2 flex-wrap">
                        {isFolder ? 'Carpeta' : sizeText}
                        {item.bpm && <span className="font-mono text-amber-400 font-bold">{item.bpm} BPM</span>}
                        {item.key && <span className="font-mono text-violet-400">{item.key}</span>}
                        {(item.modifiedTime || item.createdTime) && <span>{formatDate(item.modifiedTime || item.createdTime)}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      {isFolder ? (
                        <button
                          onClick={() => navigateTo(item.id, item.name)}
                          className="p-2 text-text-secondary hover:text-accent hover:bg-surface rounded-lg transition-colors"
                        >
                          <FolderOpen className="w-4 h-4" />
                        </button>
                      ) : (
                        <a
                          href={item.webContentLink || `/api/files/${item.id}?inline=true`}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={item.name}
                          onClick={e => e.stopPropagation()}
                          className="p-2 text-text-secondary hover:text-text-primary hover:bg-surface rounded-lg transition-colors"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5 p-6">
              {displayItems.map(item => {
                if (!item) return null;
                const isFolder = item.mimeType === 'application/vnd.google-apps.folder';
                const isAudio = item.mimeType?.startsWith('audio/');
                const isHl = item.id === highlightFileId;
                const isActive = currentTrack?.id === item.id;
                const isPlayingNow = isActive && isPlaying;
                const sizeMb = item.size ? parseInt(item.size, 10) / (1024 * 1024) : 0;
                const sizeText = !isNaN(sizeMb) && sizeMb > 0 ? `${sizeMb.toFixed(1)} MB` : '';

                return (
                  <div
                    key={item.id}
                    onDoubleClick={() => {
                      if (isFolder) navigateTo(item.id, item.name);
                      else window.open(item.webViewLink || `/api/files/${item.id}?inline=true`, '_blank');
                    }}
                    className={cn(
                      "group flex flex-col p-3.5 rounded-2xl border transition-all cursor-pointer select-none",
                      isHl ? "border-accent bg-accent/10 ring-1 ring-accent/20" : "border-border/60 bg-surface/60 hover:bg-surface-elevated hover:border-accent/30"
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      {isAudio ? (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            if (isActive && togglePlay) {
                              togglePlay();
                            } else if (playTrack) {
                              playTrack({
                                id: item.id,
                                name: (item.name || '').replace(/\.[^/.]+$/, ''),
                                url: `/api/audio/${item.id}`,
                              });
                            }
                          }}
                          className={cn(
                            "w-9 h-9 rounded-full flex items-center justify-center transition-all border",
                            isActive ? "bg-accent border-accent text-white" : "border-border text-text-secondary hover:border-accent hover:text-accent"
                          )}
                        >
                          {isPlayingNow ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-px" />}
                        </button>
                      ) : (
                        <div className="w-9 h-9 flex items-center justify-center">{getIcon(item.mimeType, item.name)}</div>
                      )}
                    </div>
                    <p className={cn("text-xs font-bold truncate", isActive || isHl ? "text-accent" : "text-text-primary")} title={item.name}>
                      {item.name || 'Sin nombre'}
                    </p>
                    {isHl && (
                      <span className="mt-1 text-[9px] font-bold bg-accent/20 text-accent px-2 py-0.5 rounded-full self-start">
                        aquí
                      </span>
                    )}
                    <p className="text-[10px] text-text-secondary mt-1">
                      {isFolder ? 'Carpeta' : sizeText}
                      {item.bpm && ` · ${item.bpm} BPM`}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-border/50 flex items-center justify-between text-xs text-text-secondary shrink-0 bg-surface/50">
          <span>{displayItems.length} elemento{displayItems.length !== 1 ? 's' : ''}</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl hover:bg-surface-elevated transition-colors font-semibold text-text-primary"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export { FolderExplorerModal as FileLocationModal };
export default FolderExplorerModal;
