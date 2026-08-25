'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  ChevronLeft, 
  Share2, 
  ExternalLink, 
  Edit3, 
  Trash2, 
  Activity, 
  Music, 
  Mic, 
  Layers, 
  Users2, 
  Disc3, 
  Calendar, 
  Users,
  Check,
  ChevronDown
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { 
  PERSONAL_PROJECT_CATEGORIES, 
  PERSONAL_PROJECT_STATUS_CONFIG 
} from '@/lib/constants';
import type { 
  PersonalProject, 
  PersonalProjectCategory, 
  PersonalProjectStatus 
} from '@/types';
import { cn } from '@/lib/utils';

interface PersonalProjectHeaderProps {
  project: PersonalProject;
  onUpdateStatus: (newStatus: PersonalProjectStatus) => Promise<void>;
  onEdit: () => void;
  onDelete: () => void;
  onCloneToArtist: () => void;
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
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export function PersonalProjectHeader({
  project,
  onUpdateStatus,
  onEdit,
  onDelete,
  onCloneToArtist,
}: PersonalProjectHeaderProps) {
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const statusMenuRef = React.useRef<HTMLDivElement>(null);

  const categoryConfig = PERSONAL_PROJECT_CATEGORIES[project.category] || PERSONAL_PROJECT_CATEGORIES.beat;
  const statusConfig = PERSONAL_PROJECT_STATUS_CONFIG[project.status] || PERSONAL_PROJECT_STATUS_CONFIG.idea;
  const CategoryIcon = getCategoryIcon(project.category);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) {
        setIsStatusMenuOpen(false);
      }
    };
    if (isStatusMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isStatusMenuOpen]);

  return (
    <div className="space-y-4">
      {/* Breadcrumb / Back button */}
      <div className="flex items-center justify-between">
        <Link
          href="/personal-projects"
          className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors group"
        >
          <div className="p-1 rounded-lg bg-surface-elevated border border-border group-hover:border-accent/50 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </div>
          <span>Volver a Proyectos Personales</span>
        </Link>

        {/* Linked Artist Notification Banner / Button */}
        {project.linkedArtistId ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-xs font-semibold text-cyan-400">
            <span>🤝 Cedido a {project.linkedArtistName || 'Artista'}</span>
            <Link
              href={`/artists/${project.linkedArtistId}`}
              className="hover:underline flex items-center gap-1 text-cyan-300 ml-1"
            >
              <span>Ver versión de artista</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={onCloneToArtist}
            className="text-xs bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30"
          >
            <Share2 className="w-3.5 h-3.5 mr-1.5" />
            Ceder a Artista...
          </Button>
        )}
      </div>

      {/* Main Header Card */}
      <div className="glass p-6 rounded-2xl border border-border/80 shadow-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          {/* Left: Info */}
          <div className="flex items-start gap-4">
            {/* Category Icon / Avatar */}
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 border relative overflow-hidden shadow-inner"
              style={{
                backgroundColor: categoryConfig.bgColor,
                borderColor: `${categoryConfig.color}40`,
              }}
            >
              {project.coverArtUrl ? (
                <img src={project.coverArtUrl} alt={project.title} className="w-full h-full object-cover" />
              ) : (
                <CategoryIcon className="w-8 h-8" style={{ color: categoryConfig.color }} />
              )}
            </div>

            <div className="space-y-1.5 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Category Badge */}
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border"
                  style={{
                    color: categoryConfig.color,
                    backgroundColor: categoryConfig.bgColor,
                    borderColor: `${categoryConfig.color}30`,
                  }}
                >
                  <CategoryIcon className="w-3.5 h-3.5" />
                  {categoryConfig.label}
                </span>

                {/* Status Selector Dropdown */}
                <div className="relative" ref={statusMenuRef}>
                  <button
                    type="button"
                    onClick={() => setIsStatusMenuOpen(!isStatusMenuOpen)}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all hover:opacity-90 cursor-pointer shadow-sm"
                    style={{
                      color: statusConfig.color,
                      backgroundColor: statusConfig.bgColor,
                      borderColor: `${statusConfig.color}40`,
                    }}
                  >
                    <span>{statusConfig.icon}</span>
                    <span>{statusConfig.label}</span>
                    <ChevronDown className="w-3 h-3 ml-0.5 opacity-70" />
                  </button>

                  {isStatusMenuOpen && (
                    <div className="absolute left-0 top-full mt-1.5 w-56 bg-surface-elevated border border-border rounded-xl shadow-2xl z-40 py-1.5 animate-in fade-in-50 zoom-in-95">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-text-secondary px-3 py-1">
                        Cambiar Estado
                      </p>
                      {(Object.entries(PERSONAL_PROJECT_STATUS_CONFIG) as [PersonalProjectStatus, any][]).map(([sKey, sConf]) => {
                        const isCurrent = project.status === sKey;
                        return (
                          <button
                            key={sKey}
                            type="button"
                            onClick={() => {
                              setIsStatusMenuOpen(false);
                              onUpdateStatus(sKey);
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium transition-colors text-left ${
                              isCurrent ? 'bg-accent/15 text-accent font-bold' : 'text-text-primary hover:bg-surface'
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <span>{sConf.icon}</span>
                              <span>{sConf.label}</span>
                            </span>
                            {isCurrent && <Check className="w-3.5 h-3.5 text-accent" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* BPM & Key Badges */}
                {project.bpm && (
                  <span className={cn("text-xs border px-2.5 py-1 rounded-lg font-bold font-mono flex items-center gap-1", getBpmBadgeColor(project.bpm))}>
                    <Activity className="w-3.5 h-3.5" />
                    {project.bpm} BPM
                  </span>
                )}

                {project.key && (
                  <span className="text-xs bg-violet-500/10 text-violet-400 border border-violet-500/20 px-2.5 py-1 rounded-lg font-bold font-mono">
                    {project.key}
                  </span>
                )}
              </div>

              <h1 className="text-xl sm:text-2xl font-bold text-text-primary tracking-tight">
                {project.title}
              </h1>

              {/* Sub-info: Date, Collaborators, Tags */}
              <div className="flex items-center gap-4 text-xs text-text-secondary flex-wrap pt-1">
                {project.year && (
                  <span className="flex items-center gap-1 font-medium">
                    <Calendar className="w-3.5 h-3.5 opacity-60" />
                    {project.month ? `${MONTH_NAMES[project.month - 1]} ` : ''}{project.year}
                  </span>
                )}

                {project.collaborators && project.collaborators.length > 0 && (
                  <span className="flex items-center gap-1 font-medium text-pink-400">
                    <Users2 className="w-3.5 h-3.5 shrink-0" />
                    Colaboradores: {project.collaborators.join(', ')}
                  </span>
                )}

                {project.tags && project.tags.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {project.tags.map((tag, idx) => (
                      <span key={idx} className="bg-surface-elevated text-text-secondary px-2 py-0.5 rounded text-[11px] border border-border/50">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 self-end lg:self-center shrink-0">
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Edit3 className="w-3.5 h-3.5 mr-1.5" />
              Editar
            </Button>

            {project.driveUrl && (
              <Button variant="outline" size="sm" asChild>
                <a href={project.driveUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                  Drive
                </a>
              </Button>
            )}

            <Button variant="ghost" size="sm" onClick={onDelete} className="text-danger hover:bg-danger/10 hover:text-danger">
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Eliminar
            </Button>
          </div>
        </div>

        {/* Notes preview if present */}
        {project.notes && (
          <div className="mt-4 pt-3 border-t border-border/40 text-xs text-text-secondary bg-surface-elevated/40 p-3 rounded-xl">
            <p className="font-semibold text-text-primary text-[11px] uppercase tracking-wider mb-1">Notas del Proyecto:</p>
            <p className="whitespace-pre-line leading-relaxed">{project.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
