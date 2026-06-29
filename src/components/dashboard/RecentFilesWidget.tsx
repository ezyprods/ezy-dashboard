'use client';

import { useState, useEffect } from 'react';
import { Play, Pause, Download, ExternalLink, FileAudio, Loader2 } from 'lucide-react';
import { useAudio } from '@/lib/contexts/AudioContext';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdTime: string;
  modifiedTime: string;
  webViewLink?: string;
  webContentLink?: string;
  url?: string;
}

export function RecentFilesWidget() {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { currentTrack, isPlaying, playTrack, togglePlay } = useAudio();

  useEffect(() => {
    fetch('/api/dashboard/recent-files')
      .then(res => res.json())
      .then(data => {
        if (data.files) {
          setFiles(data.files);
        }
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Failed to load recent files', err);
        setIsLoading(false);
      });
  }, []);

  const handlePlay = (file: DriveFile) => {
    const isCurrentTrack = currentTrack?.id === file.id;
    if (isCurrentTrack) {
      togglePlay();
    } else {
      if (file.url) {
        playTrack({
          id: file.id,
          title: file.name,
          artist: 'Archivo Reciente',
          url: file.url,
          coverUrl: undefined,
          source: 'drive',
        });
      }
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `hace ${diffDays} d`;
    if (diffHours > 0) return `hace ${diffHours} h`;
    if (diffMins > 0) return `hace ${diffMins} m`;
    return 'ahora mismo';
  };

  return (
    <div className="relative bg-surface/80 backdrop-blur-xl border border-border/60 rounded-[20px] overflow-hidden shadow-lg h-full flex flex-col group hover:border-emerald-500/30 transition-colors">
      <div className="px-4 py-2.5 border-b border-border/50 bg-gradient-to-b from-surface-elevated/50 to-surface/50 flex items-center gap-2 shrink-0">
        <div className="p-1 rounded-md bg-emerald-500/10 text-emerald-500">
          <FileAudio className="w-3.5 h-3.5" />
        </div>
        <h3 className="font-bold text-sm text-text-primary tracking-tight">Archivos recientes</h3>
      </div>
      
      <div className="flex-1 overflow-y-auto min-h-0 p-2 space-y-1 custom-scrollbar">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-text-secondary/50 space-y-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-xs font-medium">Buscando audios...</span>
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-secondary/50 p-4 text-center">
            <FileAudio className="w-6 h-6 mb-2 opacity-50" />
            <p className="text-xs font-medium">No hay archivos recientes</p>
          </div>
        ) : (
          files.map(file => {
            const isThisTrackPlaying = currentTrack?.id === file.id && isPlaying;
            
            return (
              <div 
                key={file.id}
                className="group/item flex items-center gap-3 p-2 rounded-xl hover:bg-surface-elevated/50 border border-transparent hover:border-border/50 transition-all cursor-default"
              >
                {/* Play Button */}
                <button
                  onClick={() => handlePlay(file)}
                  className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center transition-all shadow-sm ${
                    isThisTrackPlaying 
                      ? 'bg-emerald-500 text-black shadow-[0_0_15px_rgba(16,185,129,0.3)]' 
                      : 'bg-surface-elevated text-emerald-500 border border-border/60 hover:bg-emerald-500 hover:text-black hover:border-emerald-500 hover:scale-105'
                  }`}
                >
                  {isThisTrackPlaying ? (
                    <Pause className="w-3.5 h-3.5 fill-current" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                  )}
                </button>
                
                {/* File Info */}
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <p className="text-[13px] font-bold text-text-primary truncate" title={file.name}>
                    {file.name}
                  </p>
                  <p className="text-[10px] text-text-secondary font-medium">
                    {formatTimeAgo(file.createdTime)}
                  </p>
                </div>
                
                {/* Actions (Download / Link) */}
                <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                  {file.webContentLink && (
                    <a
                      href={file.webContentLink}
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-surface hover:bg-surface-elevated text-text-secondary hover:text-text-primary transition-colors border border-border/40"
                      title="Descargar"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Download className="w-3 h-3" />
                    </a>
                  )}
                  {file.webViewLink && (
                    <a
                      href={file.webViewLink}
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-surface hover:bg-surface-elevated text-text-secondary hover:text-text-primary transition-colors border border-border/40"
                      title="Abrir ubicación"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
