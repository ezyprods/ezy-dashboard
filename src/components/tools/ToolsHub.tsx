'use client';

import Link from 'next/link';
import { Download, RefreshCw, Scissors, Tags, Activity, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';

const TOOLS = [
  {
    id: 'downloader',
    name: 'Descargador MP3',
    description: 'Descarga audios de YouTube, Spotify y SoundCloud.',
    icon: Download,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10'
  },
  {
    id: 'converter',
    name: 'Conversor de Audio',
    description: 'Convierte archivos a MP3, WAV, FLAC, OGG y M4A.',
    icon: RefreshCw,
    color: 'text-purple-500',
    bg: 'bg-purple-500/10'
  },
  {
    id: 'trimmer',
    name: 'Recortador de Audio',
    description: 'Corta fragmentos de canciones con precisión.',
    icon: Scissors,
    color: 'text-pink-500',
    bg: 'bg-pink-500/10'
  },
  {
    id: 'tags',
    name: 'Editor de Metadatos',
    description: 'Añade carátulas, títulos y artistas a tus MP3.',
    icon: Tags,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10'
  },
  {
    id: 'detector',
    name: 'Detector BPM & Key',
    description: 'Analiza el tempo y tonalidad de cualquier audio.',
    icon: Activity,
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10'
  },
  {
    id: 'stems',
    name: 'Separador de Stems',
    description: 'Aísla la voz y los instrumentos con IA (Demucs v4).',
    icon: Layers,
    color: 'text-indigo-500',
    bg: 'bg-indigo-500/10'
  }
] as const;

export function ToolsHub() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6 animate-in fade-in zoom-in-95 duration-300">
        {TOOLS.map(tool => (
          <Link
            key={tool.id}
            href={`/tools/${tool.id}`}
            className="group relative flex flex-col items-start p-6 rounded-[24px] border border-border/60 bg-surface/50 backdrop-blur-xl hover:bg-surface-elevated hover:border-accent/50 transition-all duration-300 text-left overflow-hidden h-full"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            
            <div className={cn("p-3 rounded-2xl mb-4 transition-transform duration-300 group-hover:scale-110", tool.bg, tool.color)}>
              <tool.icon className="w-6 h-6" />
            </div>
            
            <h3 className="text-lg font-bold text-text-primary mb-2 group-hover:text-accent transition-colors">
              {tool.name}
            </h3>
            
            <p className="text-sm text-text-secondary leading-relaxed">
              {tool.description}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
