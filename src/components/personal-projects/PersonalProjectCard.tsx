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
  ListMusic,
  ChevronDown,
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

interface PersonalProjectCardProps {
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

export function PersonalProjectCard({
  project,
  onEdit,
  onDelete,
  onCloneToArtist,
  onReplaceAudio,
}: PersonalProjectCardProps) {
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

  // Drag & drop handlers
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
        "group relative bg-surface/70 hover:bg-surface border border-border/70 hover:border-accent/40 rounded-2xl p-3.5 flex flex-col justify-between transition-all duration-200 shadow-sm hover:shadow-[0_8px_25px_rgba(108,92,231,0.12)] min-h-[160px]",
        isThisPlaying && "border-accent/50 bg-accent/5",
        isDragOver && "border-accent ring-2 ring-accent/40 bg-accent/15 scale-[1.02] shadow-[0_0_20px_rgba(108,92,231,0.25)]"
      )}
    >
      {/* Dragging Overlay Badge */}
      {isDragOver && (
        <div className="absolute inset-0 z-20 rounded-2xl bg-accent/20 backdrop-blur-xs flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-accent pointer-events-none animate-in fade-in-50">
          <UploadCloud className="w-6 h-6 text-accent animate-bounce" />
          <span className="text-xs font-bold text-accent bg-surface-elevated/90 px-2.5 py-1 rounded-lg shadow-md text-center">
            Soltar audio para sustituir
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

      {/* Top Header inside Card: Category, Status & Menu */}
      <div className="flex items-center justify-between gap-1.5 mb-2">
        <span 
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border transition-colors shrink-0"
          style={{ 
            color: categoryConfig.color, 
            backgroundColor: categoryConfig.bgColor,
            borderColor: `${categoryConfig.color}30` 
          }}
        >
          <CategoryIcon className="w-3 h-3" />
          <span>{categoryConfig.shortLabel}</span>
        </span>

        <div className="flex items-center gap-1">
          {/* Status Badge */}
          <span 
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border shrink-0"
            style={{ 
              color: statusConfig.color, 
              backgroundColor: statusConfig.bgColor,
              borderColor: `${statusConfig.color}30` 
            }}
            title={statusConfig.label}
          >
            <span>{statusConfig.icon}</span>
            <span className="truncate max-w-[80px] hidden sm:inline">{statusConfig.label}</span>
          </span>

          {/* Action Menu (···) */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="p-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>

            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-surface-elevated border border-border rounded-xl shadow-xl z-30 py-1 text-xs animate-in fade-in-50 zoom-in-95">
                <Link
                  href={`/personal-projects/${project.id}`}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-text-primary hover:bg-surface transition-colors"
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
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-accent hover:bg-accent/10 transition-colors text-left"
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
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-text-primary hover:bg-surface transition-colors text-left"
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
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-text-primary hover:bg-surface transition-colors text-left"
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
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-text-primary hover:bg-surface transition-colors"
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
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-danger hover:bg-danger/10 transition-colors text-left border-t border-border/40 mt-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Eliminar</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Center: Title & Transfer Note */}
      <div className="space-y-1 mb-2.5">
        <Link 
          href={`/personal-projects/${project.id}`} 
          className="font-bold text-sm text-text-primary hover:text-accent transition-colors line-clamp-2 leading-snug block"
          title={project.title}
        >
          {project.title}
        </Link>

        {project.linkedArtistId && (
          <p className="text-[10px] text-cyan-400 font-semibold truncate flex items-center gap-1">
            🤝 <span>{project.linkedArtistName || 'Artista'}</span>
          </p>
        )}
      </div>

      {/* Bottom Section: BPM/Key & Play row */}
      <div className="pt-2 border-t border-border/50 flex items-center justify-between gap-2">
        {/* BPM & Key / Date */}
        <div className="flex items-center gap-1.5 flex-wrap min-w-0 font-mono">
          {project.bpm ? (
            <span className={cn("text-[10px] border px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5", getBpmBadgeColor(project.bpm))}>
              <Activity className="w-2.5 h-2.5" />
              {project.bpm}
            </span>
          ) : null}

          {project.key ? (
            <span className="text-[10px] bg-violet-500/10 text-violet-400 border border-violet-500/20 px-1.5 py-0.5 rounded font-bold">
              {project.key}
            </span>
          ) : null}

          {project.year && !project.bpm && !project.key && (
            <span className="text-[10px] text-text-secondary/70 font-sans">
              {project.month ? `${MONTH_NAMES[project.month - 1]} ` : ''}{project.year}
            </span>
          )}
        </div>

        {/* Right side: Pack Tracks Count / Play Button */}
        <div className="flex items-center gap-1 shrink-0">
          {hasPackTracks && (
            <div className="relative" ref={packMenuRef}>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowPackMenu(!showPackMenu);
                }}
                className="px-1.5 py-0.5 rounded bg-surface-elevated hover:bg-surface border border-border/70 text-[10px] font-mono text-text-secondary hover:text-text-primary flex items-center gap-0.5"
                title={`${project.packTracks!.length} pistas en el pack`}
              >
                <ListMusic className="w-3 h-3 text-accent" />
                <span>{project.packTracks!.length}</span>
                <ChevronDown className="w-2 h-2 opacity-60" />
              </button>

              {showPackMenu && (
                <div className="absolute right-0 bottom-full mb-1.5 w-56 bg-surface-elevated border border-border rounded-xl shadow-2xl z-50 py-1.5 animate-in fade-in-50 zoom-in-95">
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-text-secondary border-b border-border/40">
                    Pistas ({project.packTracks!.length})
                  </div>
                  <div className="max-h-48 overflow-y-auto custom-scrollbar">
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
                            "w-full flex items-center justify-between px-3 py-1.5 text-xs transition-colors text-left",
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

          {activeFileId ? (
            <button
              type="button"
              onClick={(e) => handlePlay(e)}
              title={isThisPlaying ? "Pausar" : "Reproducir bounce"}
              className={cn(
                "w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200 shadow-sm cursor-pointer",
                isThisPlaying 
                  ? "bg-accent text-white scale-105" 
                  : "bg-surface-elevated hover:bg-accent hover:text-white text-text-secondary hover:scale-105 border border-border/70"
              )}
            >
              {isThisPlaying ? (
                <Pause className="w-3.5 h-3.5 fill-current" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
              )}
            </button>
          ) : (
            <div 
              className="w-7 h-7 rounded-lg bg-surface-elevated/40 border border-border/40 flex items-center justify-center text-text-secondary/30"
              title="Sin bounce exportado"
            >
              <CategoryIcon className="w-3 h-3" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
