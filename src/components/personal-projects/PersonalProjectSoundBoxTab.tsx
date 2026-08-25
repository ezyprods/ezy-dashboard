'use client';

import React, { useState } from 'react';
import { 
  Download, 
  Scissors, 
  Activity, 
  Layers, 
  Music, 
  Sparkles,
  ExternalLink 
} from 'lucide-react';
import { MusicDownloader } from '@/components/tools/MusicDownloader';
import { StemsSplitter } from '@/components/tools/StemsSplitter';
import { BpmKeyDetector } from '@/components/tools/BpmKeyDetector';
import type { PersonalProject } from '@/types';

interface PersonalProjectSoundBoxTabProps {
  project: PersonalProject;
}

export function PersonalProjectSoundBoxTab({ project }: PersonalProjectSoundBoxTabProps) {
  const [activeTool, setActiveTool] = useState<'downloader' | 'stems' | 'detector'>('downloader');

  return (
    <div className="space-y-6">
      {/* Tool Selector Bar */}
      <div className="glass p-2 rounded-2xl border border-border/80 flex items-center justify-center gap-2 max-w-xl mx-auto shadow-sm">
        <button
          type="button"
          onClick={() => setActiveTool('downloader')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            activeTool === 'downloader'
              ? 'bg-accent text-white shadow-md shadow-accent/20'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
          }`}
        >
          <Download className="w-4 h-4" />
          <span>YouTube Downloader</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTool('stems')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            activeTool === 'stems'
              ? 'bg-accent text-white shadow-md shadow-accent/20'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
          }`}
        >
          <Scissors className="w-4 h-4" />
          <span>Separador Stems</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTool('detector')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
            activeTool === 'detector'
              ? 'bg-accent text-white shadow-md shadow-accent/20'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Detector BPM/Key</span>
        </button>
      </div>

      {/* Active Tool View */}
      <div className="animate-in fade-in-50 duration-200">
        {activeTool === 'downloader' && (
          <div className="space-y-4">
            <div className="text-center max-w-md mx-auto mb-2">
              <h3 className="font-bold text-sm text-text-primary">Descargar Referencias & Backing Tracks</h3>
              <p className="text-xs text-text-secondary">
                Descarga audios de YouTube en alta calidad para samplear o usar como base en tus grabaciones.
              </p>
            </div>
            <MusicDownloader />
          </div>
        )}

        {activeTool === 'stems' && (
          <div className="space-y-4">
            <div className="text-center max-w-md mx-auto mb-2">
              <h3 className="font-bold text-sm text-text-primary">Separar Pistas con Inteligencia Artificial</h3>
              <p className="text-xs text-text-secondary">
                Aísla voces, baterías, bajos y melodías para remixar, crear sound kits o mashups.
              </p>
            </div>
            <StemsSplitter />
          </div>
        )}

        {activeTool === 'detector' && (
          <div className="space-y-4">
            <div className="text-center max-w-md mx-auto mb-2">
              <h3 className="font-bold text-sm text-text-primary">Analizador de BPM y Tonalidad</h3>
              <p className="text-xs text-text-secondary">
                Analiza cualquier sample, acapella o melodía externa antes de incorporarla al beat.
              </p>
            </div>
            <BpmKeyDetector />
          </div>
        )}
      </div>
    </div>
  );
}
