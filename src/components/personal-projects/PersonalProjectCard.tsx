'use client';

import React from 'react';
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
  Sparkles,
  Calendar,
  Clock
} from 'lucide-react';
import { useAudio } from '@/lib/contexts/AudioContext';
import { 
  PERSONAL_PROJECT_CATEGORIES, 
  PERSONAL_PROJECT_STATUS_CONFIG 
} from '@/lib/constants';
import type { PersonalProject } from '@/types';
import { cn } from '@/lib/utils';

interface PersonalProjectCardProps {
  project: PersonalProject;
  onEdit?: (project: PersonalProject) => void;
  onDelete?: (project: PersonalProject) => void;
  onCloneToArtist?: (project: PersonalProject) => void;
}

const getCategoryIcon = (category: string) => {
  switch (category) {
    case 'beat':
      return Music;
    case 'grabacion':
      return Mic;
    case 'loop_pack':
      return Layers;
    case 'colaboracion':
      return Users2;
    case 'mashup':
      return Disc3;
    default:
      return Music;
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
}: PersonalProjectCardProps) {
  const { currentTrack, isPlaying, playTrack, togglePlay } = useAudio();
  const [showMenu, setShowMenu] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const categoryConfig = PERSONAL_PROJECT_CATEGORIES[project.category] || PERSONAL_PROJECT_CATEGORIES.beat;
  const statusConfig = PERSONAL_PROJECT_STATUS_CONFIG[project.status] || PERSONAL_PROJECT_STATUS_CONFIG.idea;
  const CategoryIcon = getCategoryIcon(project.category);

  const isCurrentTrack = currentTrack?.id === project.latestBounceFileId;
  const isThisPlaying = isCurrentTrack && isPlaying;

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  const handlePlayBounce = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!project.latestBounceFileId) return;

    if (isCurrentTrack) {
      togglePlay();
    } else {
      playTrack({
        id: project.latestBounceFileId,
        name: project.latestBounceName || project.title,
        artistName: `Proyecto Personal · ${categoryConfig.shortLabel}`,
        url: `/api/audio/${project.latestBounceFileId}`,
      });
    }
  };

  return (
    <div className="group relative bg-surface/80 hover:bg-surface border border-border/70 hover:border-accent/40 rounded-2xl p-5 flex flex-col justify-between transition-all duration-300 shadow-sm hover:shadow-[0_8px_30px_rgba(108,92,231,0.12)]">
      {/* Top row: Category Badge & Menu */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <span 
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors"
          style={{ 
            color: categoryConfig.color, 
            backgroundColor: categoryConfig.bgColor,
            borderColor: `${categoryConfig.color}30` 
          }}
        >
          <CategoryIcon className="w-3.5 h-3.5" />
          {categoryConfig.shortLabel}
        </span>

        <div className="flex items-center gap-1">
          {/* Status Badge */}
          <span 
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border"
            style={{ 
              color: statusConfig.color, 
              backgroundColor: statusConfig.bgColor,
              borderColor: `${statusConfig.color}30` 
            }}
            title={statusConfig.label}
          >
            <span>{statusConfig.icon}</span>
            <span className="truncate max-w-[100px]">{statusConfig.label}</span>
          </span>

          {/* Action Menu */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="p-1 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {showMenu && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-surface-elevated border border-border rounded-xl shadow-xl z-30 py-1.5 animate-in fade-in-50 zoom-in-95">
                {onEdit && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                      onEdit(project);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-text-primary hover:bg-surface transition-colors text-left"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-text-secondary" />
                    Editar detalles
                  </button>
                )}

                {onCloneToArtist && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                      onCloneToArtist(project);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-accent hover:bg-accent/10 transition-colors text-left"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    Ceder a artista...
                  </button>
                )}

                {project.driveUrl && (
                  <a
                    href={project.driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Ver en Google Drive
                  </a>
                )}

                <div className="my-1 border-t border-border/50" />

                {onDelete && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                      onDelete(project);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-danger hover:bg-danger/10 transition-colors text-left"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Eliminar proyecto
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Center: Visual Header + Title */}
      <Link href={`/personal-projects/${project.id}`} className="block flex-1 group/title">
        <div className="flex items-start gap-3.5 mb-3">
          {/* Avatar / Category Visual */}
          <div 
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border relative overflow-hidden transition-transform duration-300 group-hover:scale-105 shadow-inner"
            style={{ 
              backgroundColor: categoryConfig.bgColor,
              borderColor: `${categoryConfig.color}40`
            }}
          >
            {project.coverArtUrl ? (
              <img src={project.coverArtUrl} alt={project.title} className="w-full h-full object-cover" />
            ) : (
              <CategoryIcon className="w-6 h-6" style={{ color: categoryConfig.color }} />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-base text-text-primary group-hover/title:text-accent transition-colors truncate">
              {project.title}
            </h3>

            {/* Collaborators or Notes preview */}
            {project.collaborators && project.collaborators.length > 0 ? (
              <p className="text-xs text-text-secondary truncate mt-0.5 flex items-center gap-1">
                <Users2 className="w-3 h-3 text-pink-400 shrink-0" />
                <span>con {project.collaborators.join(', ')}</span>
              </p>
            ) : project.notes ? (
              <p className="text-xs text-text-secondary/80 truncate mt-0.5 line-clamp-1">
                {project.notes}
              </p>
            ) : (
              <p className="text-[11px] text-text-secondary/60 mt-0.5">
                {project.year ? `${project.month ? MONTH_NAMES[project.month - 1] + ' ' : ''}${project.year}` : 'Sin fecha asignada'}
              </p>
            )}
          </div>
        </div>

        {/* BPM & Key Badges + Tags */}
        <div className="flex items-center gap-1.5 flex-wrap my-2.5">
          {project.bpm && (
            <span className={cn("text-xs border px-2 py-0.5 rounded-md font-bold font-mono flex items-center gap-1", getBpmBadgeColor(project.bpm))}>
              <Activity className="w-3 h-3" />
              {project.bpm} BPM
            </span>
          )}

          {project.key && (
            <span className="text-xs bg-violet-500/10 text-violet-400 border border-violet-500/20 px-2 py-0.5 rounded-md font-bold font-mono">
              {project.key}
            </span>
          )}

          {project.tags?.slice(0, 3).map((tag, idx) => (
            <span 
              key={idx} 
              className="text-[11px] bg-surface-elevated text-text-secondary px-2 py-0.5 rounded-md border border-border/50 truncate max-w-[110px]"
            >
              #{tag}
            </span>
          ))}

          {(project.tags?.length || 0) > 3 && (
            <span className="text-[10px] text-text-secondary/70">
              +{project.tags!.length - 3}
            </span>
          )}
        </div>
      </Link>

      {/* Bottom row: Play button & Linked Artist status / Date */}
      <div className="pt-3 mt-1 border-t border-border/50 flex items-center justify-between gap-2">
        {project.latestBounceFileId ? (
          <button
            type="button"
            onClick={handlePlayBounce}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shadow-sm",
              isThisPlaying 
                ? "bg-accent text-white shadow-[0_0_15px_rgba(108,92,231,0.4)]" 
                : "bg-surface-elevated hover:bg-accent hover:text-white text-text-primary border border-border/60 hover:border-accent"
            )}
          >
            {isThisPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>Pausar Demo</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                <span>Reproducir</span>
              </>
            )}
          </button>
        ) : (
          <span className="text-[11px] text-text-secondary/60 italic flex items-center gap-1">
            <Music className="w-3 h-3 opacity-40" /> Sin bounce
          </span>
        )}

        {/* Linked Artist notice */}
        {project.linkedArtistId ? (
          <Link
            href={`/artists/${project.linkedArtistId}`}
            onClick={(e) => e.stopPropagation()}
            className="text-[11px] text-accent hover:underline font-medium flex items-center gap-1 truncate max-w-[150px]"
            title={`Cedido a ${project.linkedArtistName || 'Artista'}`}
          >
            <span>🤝 {project.linkedArtistName || 'Artista'}</span>
          </Link>
        ) : project.year ? (
          <span className="text-[11px] text-text-secondary font-mono flex items-center gap-1">
            <Calendar className="w-3 h-3 opacity-50" />
            {project.month ? `${MONTH_NAMES[project.month - 1]} ` : ''}{project.year}
          </span>
        ) : null}
      </div>
    </div>
  );
}
