'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';
import { UploadCloud, Music, Image as ImageIcon, Film, File as FileIcon, User } from 'lucide-react';
import { useGlobalDragDrop } from '@/lib/contexts/GlobalDragDropContext';
import { useArtists } from '@/lib/hooks/useArtists';
import { SmartUploadModal } from '@/components/layout/SmartUploadModal';
import type { Artist } from '@/types';

function getFileIcon(file: File) {
  if (file.type.startsWith('audio/')) return Music;
  if (file.type.startsWith('image/')) return ImageIcon;
  if (file.type.startsWith('video/')) return Film;
  return FileIcon;
}

function getFileLabel(file: File) {
  if (file.type.startsWith('audio/')) return 'Audio';
  if (file.type.startsWith('image/')) return 'Imagen';
  if (file.type.startsWith('video/')) return 'Video';
  return 'Archivo';
}

/**
 * ArtistDropCard — a hoverable card used when on the artists list page.
 * Dropping files on it triggers the upload modal pre-filled with that artist.
 */
function ArtistDropCard({ artist, onDrop }: { artist: Artist; onDrop: (files: File[], artistId: string) => void }) {
  const [isOver, setIsOver] = useState(false);
  const counter = useRef(0);

  return (
    <div
      onDragEnter={(e) => { e.preventDefault(); counter.current++; setIsOver(true); }}
      onDragLeave={() => { counter.current--; if (counter.current <= 0) { counter.current = 0; setIsOver(false); } }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        counter.current = 0;
        setIsOver(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) onDrop(files, artist.id);
      }}
      className={`
        flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all duration-150
        ${isOver
          ? 'border-accent bg-accent/20 scale-[1.02] shadow-lg shadow-accent/20'
          : 'border-border bg-surface hover:bg-surface-elevated hover:border-accent/40'
        }
      `}
    >
      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border-2 overflow-hidden transition-all ${isOver ? 'border-accent' : 'border-border'}`}>
        {artist.photoUrl ? (
          <img src={artist.photoUrl} alt={artist.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-sm font-bold text-text-secondary">{artist.name.charAt(0)}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-text-primary truncate">{artist.name}</p>
        {artist.genre?.length > 0 && (
          <p className="text-xs text-text-secondary truncate">{artist.genre.slice(0, 2).join(', ')}</p>
        )}
      </div>
      {isOver && (
        <div className="text-xs font-bold text-accent animate-pulse">Soltar aquí</div>
      )}
    </div>
  );
}

/**
 * GlobalDropZone — renders a full-screen overlay whenever files are being dragged.
 * On the artists list page, shows artist cards as drop targets.
 * Everywhere else shows a single generic drop zone.
 */
export function GlobalDropZone() {
  const pathname = usePathname();
  const { isDraggingFiles, droppedFiles, preselectedArtistId, clearDroppedFiles, triggerUploadForArtist } = useGlobalDragDrop();
  const { activeArtists } = useArtists();
  const [hoveredZone, setHoveredZone] = useState(false);
  const zoneCounter = useRef(0);

  // Detect if we're in a context where DriveExplorer handles its own drops
  const isInsideArtistFolder = pathname.startsWith('/artists/') && pathname !== '/artists';
  const isArtistsList = pathname === '/artists';

  // Don't show global overlay when inside an artist folder (DriveExplorer handles it)
  // or when on the artists list page (Cards handle it)
  const shouldShowOverlay = isDraggingFiles && !isInsideArtistFolder && !isArtistsList;

  const handleGenericDrop = (e: React.DragEvent) => {
    e.preventDefault();
    zoneCounter.current = 0;
    setHoveredZone(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      triggerUploadForArtist(files, preselectedArtistId || (activeArtists[0]?.id ?? ''));
    }
  };

  if (typeof document === 'undefined') return null;

  const overlay = shouldShowOverlay ? (
    // The ENTIRE overlay is the drop target — no specific zone
    <div
      className="fixed inset-0 z-[400] pointer-events-auto"
      onDragEnter={(e) => { e.preventDefault(); setHoveredZone(true); }}
      onDragLeave={(e) => {
        // Only clear if leaving the window entirely
        if (e.clientX === 0 && e.clientY === 0) setHoveredZone(false);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        setHoveredZone(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
          triggerUploadForArtist(files, preselectedArtistId || (activeArtists[0]?.id ?? ''));
        }
      }}
    >
      {/* Semi-transparent backdrop */}
      <div className={`absolute inset-0 transition-colors duration-150 ${hoveredZone ? 'bg-background/90 backdrop-blur-md' : 'bg-background/80 backdrop-blur-sm'}`} />

      {/* Centered message only — no box to drop into */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center gap-5 pointer-events-none select-none">
        <div className={`w-20 h-20 rounded-2xl border-2 flex items-center justify-center transition-all duration-200 ${hoveredZone ? 'border-accent bg-accent/20 scale-110' : 'border-accent/30 bg-accent/5'}`}>
          <UploadCloud className={`w-10 h-10 transition-colors ${hoveredZone ? 'text-accent' : 'text-accent/60'}`} />
        </div>
        <div className="text-center">
          <h2 className={`text-2xl font-bold transition-colors ${hoveredZone ? 'text-accent' : 'text-text-primary'}`}>
            {hoveredZone ? '¡Suelta donde quieras!' : 'Suelta en cualquier parte de la pantalla'}
          </h2>
          <p className="text-text-secondary mt-2 text-sm">
            El sistema detectará el tipo de archivo y te pedirá los detalles
          </p>
        </div>
        <p className="text-xs text-text-secondary opacity-50 mt-4">Pulsa Escape para cancelar</p>
      </div>
    </div>
  ) : null;

  return (
    <>
      {createPortal(overlay, document.body)}

      {/* SmartUploadModal (layout version) — opens when files have been dropped */}
      {droppedFiles.length > 0 && (
        <SmartUploadModal
          isOpen={true}
          onClose={clearDroppedFiles}
          initialFiles={droppedFiles}
          preselectedArtistId={preselectedArtistId ?? undefined}
        />
      )}
    </>
  );
}
