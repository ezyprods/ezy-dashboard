'use client';

import { useState, useEffect } from 'react';
import { Play, Pause, Download, ExternalLink, FileAudio, Loader2, FolderOpen } from 'lucide-react';
import { useAudio } from '@/lib/contexts/AudioContext';
import { FolderExplorerModal } from './FolderExplorerModal';

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
  parents?: string[];
}

export function RecentFilesWidget() {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [explorerFolderId, setExplorerFolderId] = useState<string | null>(null);
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
          name: file.name,
          artistName: 'Archivo Reciente',
          url: file.url,
          coverArt: undefined,
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
    <div className="relative bg-surface/80 backdrop-blur-xl border border-border/60 rounded-[24px] overflow-hidden h-full flex flex-col group hover:border-emerald-500/30 transition-colors min-h-0">
      <div className="px-4 py-2.5 border-b border-border/50 bg-gradient-to-b from-surface-elevated/50 to-surface/50 flex items-center gap-2 shrink-0">
        <div className="p-1 rounded-md bg-emerald-500/10 text-emerald-500">
          <FileAudio className="w-3.5 h-3.5" />
        </div>
        <h3 className="font-bold text-sm text-text-primary tracking-tight">Archivos recientes</h3>
      </div>
      
      <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-2 custom-scrollbar scroll-smooth">
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
                className="group/item relative flex items-center gap-3 p-2 rounded-xl hover:bg-surface-elevated/50 border border-transparent hover:border-border/50 transition-all cursor-default overflow-hidden"
              >
                {/* Play Button */}
                <button
                  onClick={() => handlePlay(file)}
                  className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center transition-all shadow-sm z-10 relative ${
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
                <div className="flex-1 min-w-0 flex flex-col justify-center pr-1">
                  <p className="text-[13px] font-bold text-text-primary truncate transition-all duration-300 group-hover/item:text-text-primary/70" title={file.name}>
                    {file.name}
                  </p>
                  <p className="text-[10px] text-text-secondary font-medium">
                    {formatTimeAgo(file.createdTime)}
                  </p>
                </div>
                
                {/* Actions (Download / Link) */}
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 opacity-0 group-hover/item:opacity-100 pointer-events-none group-hover/item:pointer-events-auto transition-all duration-300 translate-x-4 group-hover/item:translate-x-0 z-20">
                  {/* Optional gradient mask behind buttons for better readability */}
                  <div className="absolute -inset-y-3 -left-8 -right-2 bg-gradient-to-r from-transparent via-surface/90 to-surface pointer-events-none -z-10 dark:via-surface-elevated/90 dark:to-surface-elevated" />
                  
                  {file.webContentLink && (
                    <a
                      href={file.webContentLink}
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-surface hover:bg-surface-elevated text-text-secondary hover:text-text-primary transition-all border border-border/60 shadow-sm hover:shadow-md hover:scale-105"
                      title="Descargar"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  )}
                  {file.parents && file.parents.length > 0 && (
                    <button
                      onClick={() => setExplorerFolderId(file.parents![0])}
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-surface hover:bg-surface-elevated text-emerald-500 hover:text-emerald-400 transition-all border border-border/60 shadow-sm hover:shadow-md hover:scale-105"
                      title="Abrir ubicación en la plataforma"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {file.webViewLink && (
                    <a
                      href={file.webViewLink}
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-surface hover:bg-surface-elevated text-text-secondary hover:text-text-primary transition-all border border-border/60 shadow-sm hover:shadow-md hover:scale-105"
                      title="Abrir en Google Drive"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <FolderExplorerModal 
        isOpen={!!explorerFolderId}
        onClose={() => setExplorerFolderId(null)}
        folderId={explorerFolderId}
      />
    </div>
  );
}
