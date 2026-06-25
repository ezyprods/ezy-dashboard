'use client';

import { useState, useRef, useEffect } from 'react';
import { Target, Folder, Plus, ChevronDown, Music, Check, ExternalLink } from 'lucide-react';
import { Project, Campaign } from '@/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

interface CampaignSelectorProps {
  linkedProjectId: string;
  campaigns: Campaign[];
  projects: Project[];
  onLinkProject: (id: string) => void;
  onOpenCampaignModal: () => void;
}

export function CampaignSelector({ linkedProjectId, campaigns, projects, onLinkProject, onOpenCampaignModal }: CampaignSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const selectedCampaign = campaigns.find(c => c.id === linkedProjectId);
  const selectedProject = projects.find(p => p.id === linkedProjectId);
  const isCampaign = !!selectedCampaign;

  const displayTitle = selectedCampaign?.name || selectedProject?.title || '-- Sin Vincular --';
  const displayIcon = selectedCampaign ? (selectedCampaign.emoji || '🎯') : (selectedProject ? <Folder className="w-4 h-4" /> : null);

  return (
    <div className="relative" ref={containerRef}>
      <div className="flex items-center gap-2 bg-surface-elevated px-3 py-1.5 rounded-lg border border-border cursor-pointer hover:border-accent/50 transition-colors" onClick={() => setIsOpen(!isOpen)}>
        <span className="text-xs font-bold text-text-secondary uppercase shrink-0">Origen:</span>
        <div className="flex items-center gap-2 text-sm font-medium text-accent">
          {displayIcon && <span className="flex items-center justify-center">{displayIcon}</span>}
          <span>{displayTitle}</span>
          <ChevronDown className={cn("w-4 h-4 transition-transform", isOpen && "rotate-180")} />
        </div>
        {selectedProject?.driveFolderId && (
          <a
            href={`https://drive.google.com/drive/folders/${selectedProject.driveFolderId}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-text-secondary hover:text-accent transition-colors p-1 ml-2 border-l border-border pl-3"
            title="Abrir carpeta en Google Drive"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-72 bg-surface-elevated border border-border rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col max-h-[400px] animate-in slide-in-from-top-2">
          
          <div className="p-2 border-b border-border flex items-center justify-between bg-surface/50">
            <span className="text-xs font-bold text-text-secondary uppercase">Fuentes Disponibles</span>
            <button onClick={() => { setIsOpen(false); onOpenCampaignModal(); }} className="text-xs flex items-center gap-1 text-accent hover:text-accent/80 transition-colors font-medium">
              <Plus className="w-3 h-3" /> Nueva Campaña
            </button>
          </div>

          <div className="overflow-y-auto custom-scrollbar flex-1 p-2 space-y-4">
            
            <div 
              className={cn("flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors text-sm", !linkedProjectId ? "bg-accent/10 text-accent font-bold" : "hover:bg-surface text-text-secondary")}
              onClick={() => { onLinkProject(''); setIsOpen(false); }}
            >
              <span>-- Sin Vincular --</span>
              {!linkedProjectId && <Check className="w-4 h-4" />}
            </div>

            {campaigns.length > 0 && (
              <div>
                <div className="px-2 mb-1 text-[10px] font-bold text-text-secondary uppercase tracking-widest flex items-center gap-1">
                  <Target className="w-3 h-3" /> Campañas
                </div>
                <div className="space-y-1">
                  {campaigns.map(c => (
                    <div 
                      key={c.id} 
                      onClick={() => { onLinkProject(c.id); setIsOpen(false); }}
                      className={cn("flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors text-sm", linkedProjectId === c.id ? "bg-accent/10 text-accent font-bold" : "hover:bg-surface")}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span>{c.emoji || '🎯'}</span>
                        <span className="truncate">{c.name}</span>
                      </div>
                      {linkedProjectId === c.id && <Check className="w-4 h-4 shrink-0" />}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {projects.length > 0 && (
              <div>
                <div className="px-2 mb-1 text-[10px] font-bold text-text-secondary uppercase tracking-widest flex items-center gap-1">
                  <Folder className="w-3 h-3" /> Proyectos Individuales
                </div>
                <div className="space-y-1">
                  {projects.map(p => (
                    <div 
                      key={p.id} 
                      onClick={() => { onLinkProject(p.id); setIsOpen(false); }}
                      className={cn("flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors text-sm", linkedProjectId === p.id ? "bg-accent/10 text-accent font-bold" : "hover:bg-surface")}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="truncate">{p.title}</span>
                      </div>
                      {linkedProjectId === p.id && <Check className="w-4 h-4 shrink-0" />}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
          </div>
        </div>
      )}

      {/* Campaign Info Panel - Rendered below the selector natively via absolute if we wanted, but let's just make it a nice card underneath the grid header */}
    </div>
  );
}
