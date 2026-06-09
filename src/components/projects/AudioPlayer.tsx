'use client';

import { FileAudio, Play, Pause, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAudio } from '@/lib/contexts/AudioContext';
import { cn } from '@/lib/utils';

interface AudioPlayerProps {
  fileId: string;
  fileName: string;
  artistName?: string;
  onContextMenu?: React.MouseEventHandler<HTMLDivElement>;
}

export function AudioPlayer({ fileId, fileName, artistName, onContextMenu }: AudioPlayerProps) {
  const { currentTrack, isPlaying, playTrack, togglePlay } = useAudio();
  
  const displayName = fileName.replace(/\.[^/.]+$/, '');
  const isThisTrackActive = currentTrack?.id === fileId;
  const isThisTrackPlaying = isThisTrackActive && isPlaying;

  const handlePlayClick = () => {
    if (isThisTrackActive) {
      togglePlay();
    } else {
      playTrack({
        id: fileId,
        name: displayName,
        url: `/api/audio/${fileId}`,
        artistName: artistName,
      });
    }
  };

  return (
    <div 
      onContextMenu={onContextMenu}
      className={cn(
      "p-3 rounded-lg border bg-surface-elevated/50 flex items-center justify-between group transition-colors",
      isThisTrackActive ? "border-accent shadow-[0_0_15px_rgba(108,92,231,0.15)] bg-accent/5" : "border-border hover:border-accent/30"
    )}>
      <div className="flex items-center gap-3">
        {/* Play/Pause Button */}
        <button
          className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all",
            isThisTrackActive ? "bg-accent text-white" : "bg-accent/10 text-accent group-hover:bg-accent group-hover:text-white"
          )}
          onClick={handlePlayClick}
        >
          {isThisTrackPlaying ? (
            <Pause className="w-4 h-4 fill-current" />
          ) : (
            <Play className="w-4 h-4 fill-current ml-0.5" />
          )}
        </button>
        
        <div>
          <span className={cn(
            "text-sm font-medium",
            isThisTrackActive ? "text-accent" : "text-text-primary"
          )}>
            {displayName}
          </span>
          {isThisTrackActive && (
            <div className="flex items-center gap-1 mt-0.5">
              <span className="w-1 h-1 bg-accent rounded-full animate-pulse" />
              <span className="text-[10px] text-accent uppercase tracking-wider font-bold">Reproduciendo</span>
            </div>
          )}
        </div>
      </div>
      
      <a href={`/api/audio/${fileId}`} target="_blank" rel="noopener noreferrer" className="text-xs text-text-secondary hover:text-accent flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <ExternalLink className="w-3.5 h-3.5" />
      </a>
    </div>
  );
}
