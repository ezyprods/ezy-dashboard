import React from 'react';
import { cn } from '@/lib/utils';

export interface ArtistAvatarProps {
  name: string;
  photoUrl?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export function ArtistAvatar({ name, photoUrl, size = 'md', className }: ArtistAvatarProps) {
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-14 h-14 text-base',
    xl: 'w-24 h-24 text-2xl',
  };

  const getInitials = (name: string) => {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <div
      className={cn(
        "relative rounded-full flex items-center justify-center overflow-hidden shrink-0",
        "bg-surface-elevated border border-border shadow-sm group-hover:border-accent/40 transition-colors duration-300",
        sizeClasses[size],
        className
      )}
    >
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={name}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
        />
      ) : (
        <div className="relative w-full h-full flex items-center justify-center bg-surface-elevated overflow-hidden group-hover:bg-accent/5 transition-colors duration-300">
          <div className="absolute inset-0 bg-gradient-to-br from-accent/10 to-transparent opacity-50" />
          <span className="relative z-10 font-bold text-text-primary/90 group-hover:text-accent transition-colors duration-300 tracking-wider">
            {getInitials(name)}
          </span>
        </div>
      )}
    </div>
  );
}
