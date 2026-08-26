'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { 
  Play, 
  Pause, 
  MoreVertical, 
  Music, 
  Mic, 
  Layers, 
  Users2, 
  Disc3, 
  ExternalLink, 
  Edit3, 
  Trash2, 
  Share2, 
  Activity, 
  ChevronDown,
  ListMusic,
  RefreshCw,
  UploadCloud
} from 'lucide-react';
import { useAudio } from '@/lib/contexts/AudioContext';
import { 
  PERSONAL_PROJECT_CATEGORIES, 
  PERSONAL_PROJECT_STATUS_CONFIG 
} from '@/lib/constants';
import type { PersonalProject, PackTrack } from '@/types';
import { cn } from '@/lib/utils';

interface PersonalProjectListItemProps {
  project: PersonalProject;
  onEdit?: (project: PersonalProject) => void;
  onDelete?: (project: PersonalProject) => void;
  onCloneToArtist?: (project: PersonalProject) => void;
  onReplaceAudio?: (project: PersonalProject, file: File) => void;
}

const getCategoryIcon = (category: string) => {
  switch (category) {
    case 'beat': return Music;
    case 'grabacion': return Mic;
    case 'loop_pack': return Layers;
    case 'colaboracion': return Users2;
    case 'mashup': return Disc3;
    default: return Music;
  }
};

const getBpmBadgeColor = (bpm: number) => {
  if (bpm < 80) return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
  if (bpm < 110) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
  if (bpm < 140) return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
  return 'text-red-400 bg-red-500/10 border-red-500/20';
};

const MONTH_NAMES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
];

export function PersonalProjectListItem({
  project,
  onEdit,
  onDelete,
  onCloneToArtist,
  onReplaceAudio,
}: PersonalProjectListItemProps) {
  const { currentTrack, isPlaying, playTrack, togglePlay } = useAudio();
  const [showMenu, setShowMenu] = useState(false);
  const [showPackMenu, setShowPackMenu] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<PackTrack | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  
  const menuRef = useRef<HTMLDivElement>(null);
  const packMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const categoryConfig = PERSONAL_PROJECT_CATEGORIES[project.category] || PERSONAL_PROJECT_CATEGORIES.beat;
  const statusConfig = PERSONAL_PROJECT_STATUS_CONFIG[project.status] || PERSONAL_PROJECT_STATUS_CONFIG.idea;
  const CategoryIcon = getCategoryIcon(project.category);

  // Active audio file ID to play
  const activeFileId = selectedTrack?.fileId || project.latestBounceFileId;
  const activeFileName = selectedTrack?.fileName || project.latestBounceName || project.title;

  const isCurrentTrack = Boolean(currentTrack?.id && activeFileId && currentTrack.id === activeFileId);
  const isThisPlaying = isCurrentTrack && isPlaying;

  const hasPackTracks = Boolean(project.packTracks && project.packTracks.length > 1);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
      if (packMenuRef.current && !packMenuRef.current.contains(e.target as Node)) {
        setShowPackMenu(false);
      }
    };
    if (showMenu || showPackMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu, showPackMenu]);

  const handlePlay = (e: React.MouseEvent, trackToPlay?: PackTrack) => {
    e.preventDefault();
    e.stopPropagation();

    const targetId = trackToPlay?.fileId || activeFileId;
    const targetName = trackToPlay?.fileName || activeFileName;

    if (!targetId) return;

    if (currentTrack?.id === targetId) {
      togglePlay();
    } else {
      if (trackToPlay) setSelectedTrack(trackToPlay);
      playTrack({
        id: targetId,
        name: targetName,
        artistName: `Proyecto Personal · ${categoryConfig.shortLabel}`,
        url: `/api/audio/${targetId}`,
      });
    }
  };

  // Drag & Drop audio handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const isAudio = file.type.startsWith('audio/') || /\.(mp3|wav|flac|m4a|ogg|aiff)$/i.test(file.name);
      if (isAudio && onReplaceAudio) {
        onReplaceAudio(project, file);
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (onReplaceAudio) {
        onReplaceAudio(project, file);
      }
      e.target.value = '';
    }
  };

  return (
    <div 
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "group relative flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border border-border/60 hover:border-accent/40 bg-surface/60 hover:bg-surface transition-all duration-150 shadow-sm",
        isThisPlaying && "border-accent/50 bg-accent/5 shadow-[0_0_15px_rgba(108,92,231,0.08)]",
        isDragOver && "border-accent ring-2 ring-accent/40 bg-accent/15 scale-[1.008] shadow-[0_0_20px_rgba(108,92,231,0.25)]"
      )}
    >
      {/* Dragging Overlay Badge */}
      {isDragOver && (
        <div className="absolute inset-0 z-20 rounded-xl bg-accent/20 backdrop-blur-xs flex items-center justify-center gap-2 border-2 border-dashed border-accent pointer-events-none animate-in fade-in-50">
          <UploadCloud className="w-5 h-5 text-accent animate-bounce" />
          <span className="text-xs font-bold text-accent bg-surface-elevated/90 px-2.5 py-1 rounded-lg shadow-md">
            Soltar audio para sustituir en &quot;{project.title}&quot;
          </span>
        </div>
      )}

      {/* Hidden File Input for Replace Audio */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        accept="audio/*,.wav,.mp3,.flac,.m4a,.ogg,.aiff"
        className="hidden"
      />

      {/* Left side: Play button, Title, Category */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Play / Audio Button */}
        <div className="relative shrink-0 flex items-center">
          {activeFileId ? (
            <button
              type="button"
              onClick={(e) => handlePlay(e)}
              title={isThisPlaying ? "Pausar" : `Reproducir: ${activeFileName}`}
              className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 shadow-sm cursor-pointer",
                isThisPlaying 
                  ? "bg-accent text-white shadow-accent/30 scale-105" 
                  : "bg-surface-elevated hover:bg-accent hover:text-white text-text-secondary hover:scale-105 border border-border/80"
              )}
            >
              {isThisPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>
          ) : (
            <div 
              className="w-8 h-8 rounded-lg bg-surface-elevated/40 border border-border/40 flex items-center justify-center text-text-secondary/30"
              title="Sin audio exportado (.flp / boceto)"
            >
              <CategoryIcon className="w-3.5 h-3.5" />
            </div>
          )}

          {/* Pack Multiple Tracks Selector Dropdown Button */}
          {hasPackTracks && (
            <div className="relative" ref={packMenuRef}>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowPackMenu(!showPackMenu);
                }}
                className="ml-1 p-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-elevated border border-border/50 text-[10px] flex items-center gap-0.5"
                title={`${project.packTracks!.length} pistas en este Sound Kit`}
              >
                <ListMusic className="w-3 h-3 text-accent" />
                <span className="font-mono">{project.packTracks!.length}</span>
                <ChevronDown className="w-2.5 h-2.5 opacity-60" />
              </button>

              {showPackMenu && (
                <div className="absolute left-0 top-full mt-1.5 w-64 bg-surface-elevated border border-border rounded-xl shadow-2xl z-50 py-1.5 animate-in fade-in-50 zoom-in-95">
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-text-secondary border-b border-border/40">
                    Pistas del Pack ({project.packTracks!.length})
                  </div>
                  <div className="max-h-56 overflow-y-auto custom-scrollbar">
                    {project.packTracks!.map((track, idx) => {
                      const isCurrent = (currentTrack?.id === track.fileId) || (activeFileId === track.fileId);
                      const isPlayingThis = isCurrent && isPlaying;
                      return (
                        <button
                          key={track.fileId || idx}
                          type="button"
                          onClick={(e) => {
                            setShowPackMenu(false);
                            handlePlay(e, track);
                          }}
                          className={cn(
                            "w-full flex items-center justify-between px-3 py-2 text-xs transition-colors text-left",
                            isCurrent ? "bg-accent/15 text-accent font-semibold" : "text-text-primary hover:bg-surface"
                          )}
                        >
                          <span className="truncate pr-2">{track.fileName}</span>
                          {isPlayingThis ? (
                            <Pause className="w-3 h-3 text-accent shrink-0" />
                          ) : (
                            <Play className="w-3 h-3 text-text-secondary shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Title */}
        <Link
          href={`/personal-projects/${project.id}`}
          className="font-semibold text-sm text-text-primary hover:text-accent transition-colors truncate max-w-[280px] sm:max-w-md md:max-w-xs lg:max-w-sm xl:max-w-md"
          title={project.title}
        >
          {project.title}
        </Link>

        {/* Linked Artist Badge if transferred */}
        {project.linkedArtistId && (
          <span 
            className="hidden xl:inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0"
            title={`Cedido a ${project.linkedArtistName || 'Artista'}`}
          >
            🤝 {project.linkedArtistName || 'Artista'}
          </span>
        )}
      </div>

      {/* Middle & Right side: Category, BPM/Key, Status, Date, Actions */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Category Icon */}
        <div 
          className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium border shrink-0"
          style={{ 
            color: categoryConfig.color, 
            backgroundColor: categoryConfig.bgColor,
            borderColor: `${categoryConfig.color}25` 
          }}
          title={`Categoría: ${categoryConfig.label}`}
        >
          <CategoryIcon className="w-3 h-3" />
          <span className="hidden md:inline">{categoryConfig.shortLabel}</span>
        </div>

        {/* BPM & Key Badges */}
        <div className="flex items-center gap-1.5 shrink-0 font-mono">
          {project.bpm ? (
            <span className={cn("text-[11px] border px-2 py-0.5 rounded-md font-bold flex items-center gap-1", getBpmBadgeColor(project.bpm))}>
              <Activity className="w-3 h-3" />
              <span>{project.bpm}</span>
            </span>
          ) : (
            <span className="text-[11px] text-text-secondary/40 font-mono px-1">-- BPM</span>
          )}

          {project.key && (
            <span className="text-[11px] bg-violet-500/10 text-violet-400 border border-violet-500/20 px-2 py-0.5 rounded-md font-bold">
              {project.key}
            </span>
          )}
        </div>

        {/* Status Badge */}
        <span 
          className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border shrink-0"
          style={{ 
            color: statusConfig.color, 
            backgroundColor: statusConfig.bgColor,
            borderColor: `${statusConfig.color}30` 
          }}
          title={statusConfig.label}
        >
          <span>{statusConfig.icon}</span>
          <span className="hidden lg:inline">{statusConfig.label}</span>
        </span>

        {/* Date (Month & Year) */}
        {project.year && (
          <span className="hidden md:inline text-xs text-text-secondary/80 font-medium shrink-0 min-w-[65px] text-right">
            {project.month ? `${MONTH_NAMES[project.month - 1]} ` : ''}{project.year}
          </span>
        )}

        {/* Action Menu (···) */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="p-1 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
            title="Opciones del proyecto"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {showMenu && (
            <div className="absolute right-0 top-full mt-1.5 w-48 bg-surface-elevated border border-border rounded-xl shadow-2xl z-50 py-1 animate-in fade-in-50 zoom-in-95">
              <Link
                href={`/personal-projects/${project.id}`}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-text-primary hover:bg-surface transition-colors"
                onClick={() => setShowMenu(false)}
              >
                <CategoryIcon className="w-3.5 h-3.5 text-accent" />
                <span>Abrir Proyecto</span>
              </Link>

              {/* Sustituir Audio Option */}
              {onReplaceAudio && (
                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false);
                    fileInputRef.current?.click();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-accent hover:bg-accent/10 transition-colors text-left"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-accent" />
                  <span>Sustituir Audio</span>
                </button>
              )}

              {onEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false);
                    onEdit(project);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-text-primary hover:bg-surface transition-colors text-left"
                >
                  <Edit3 className="w-3.5 h-3.5 text-text-secondary" />
                  <span>Editar Metadatos</span>
                </button>
              )}

              {onCloneToArtist && !project.linkedArtistId && (
                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false);
                    onCloneToArtist(project);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-text-primary hover:bg-surface transition-colors text-left"
                >
                  <Share2 className="w-3.5 h-3.5 text-accent" />
                  <span>Ceder a Artista</span>
                </button>
              )}

              {project.driveUrl && (
                <a
                  href={project.driveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-text-primary hover:bg-surface transition-colors"
                  onClick={() => setShowMenu(false)}
                >
                  <ExternalLink className="w-3.5 h-3.5 text-text-secondary" />
                  <span>Ver en Drive</span>
                </a>
              )}

              {onDelete && (
                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false);
                    onDelete(project);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-danger hover:bg-danger/10 transition-colors text-left border-t border-border/40 mt-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Eliminar Proyecto</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
