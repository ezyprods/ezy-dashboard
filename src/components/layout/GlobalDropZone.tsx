'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
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
  const searchParams = useSearchParams();
  const { isDraggingFiles, droppedFiles, preselectedArtistId, preselectedFolderId, clearDroppedFiles, triggerUploadForArtist } = useGlobalDragDrop();
  const { activeArtists } = useArtists();
  const [hoveredZone, setHoveredZone] = useState(false);
  const zoneCounter = useRef(0);

  // Detect if we're in a context where DriveExplorer handles its own drops
  const isInsideArtistFolder = pathname.startsWith('/artists/') && pathname !== '/artists';
  const activeTab = searchParams.get('tab') || 'files';
  const isFilesTab = isInsideArtistFolder && activeTab === 'files';
  const isArtistsList = pathname === '/artists';

  // Don't show global overlay when on the artists list page (Cards handle it)
  // DriveExplorer will handle its own drops by appearing above this overlay (z-index)
  // Also, disable in the Preview Editor so users can drag cover images without triggering global upload
  const isPreviewEditor = pathname.includes('/releases/') && pathname.includes('/editor');
  const shouldShowOverlay = isDraggingFiles && !isArtistsList && !isPreviewEditor;

  const handleGenericDrop = (e: React.DragEvent) => {
    e.preventDefault();
    zoneCounter.current = 0;
    setHoveredZone(false);
    const files = Array.from(e.dataTransfer.files);
    
    let targetArtistId = preselectedArtistId;
    if (!targetArtistId && isInsideArtistFolder) {
      targetArtistId = pathname.split('/')[2];
    }
    
    if (files.length > 0) {
      triggerUploadForArtist(files, targetArtistId || (activeArtists[0]?.id ?? ''));
    }
  };

  if (typeof document === 'undefined') return null;

  const overlay = shouldShowOverlay ? (
    <>
      {/* 1. INVISIBLE DROP TARGET (z-[400]) */}
      {/* It covers the screen but lets DriveExplorer (z-[500]) stay on top to receive its own drops */}
      <div
        className="fixed inset-0 z-[400] pointer-events-auto"
        onDragEnter={(e) => { e.preventDefault(); setHoveredZone(true); }}
        onDragLeave={(e) => {
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
        {/* Soft background dimming that sits behind DriveExplorer */}
        <div className={`absolute inset-0 transition-colors duration-150 ${hoveredZone ? 'bg-background/80 backdrop-blur-sm' : 'bg-background/60 backdrop-blur-sm'}`} />
      </div>

      {/* 2. VISUAL OVERLAY (z-[9999]) */}
      {/* Placed at the top so it's never occluded by DriveExplorer */}
      <div className="fixed top-24 left-0 right-0 z-[9999] pointer-events-none flex justify-center px-4 animate-in fade-in slide-in-from-top-10 duration-200">
        <div className={`flex items-center gap-4 px-8 py-5 rounded-2xl border bg-surface/90 backdrop-blur-xl shadow-2xl transition-all duration-200 ${hoveredZone ? 'border-accent bg-accent/10 scale-105 shadow-[0_20px_60px_-15px_rgba(108,92,231,0.6)]' : 'border-accent/30 shadow-[0_20px_60px_-15px_rgba(108,92,231,0.2)]'}`}>
          <div className={`w-12 h-12 rounded-xl border-2 flex items-center justify-center transition-all ${hoveredZone ? 'border-accent bg-accent/20' : 'border-accent/30 bg-accent/5'}`}>
            <UploadCloud className={`w-6 h-6 transition-colors ${hoveredZone ? 'text-accent' : 'text-accent/60'}`} />
          </div>
          <div>
            <h2 className={`text-xl font-bold transition-colors ${hoveredZone ? 'text-accent' : 'text-text-primary'}`}>
              {hoveredZone ? '¡Suelta donde quieras!' : 'Suelta para subir'}
            </h2>
            <p className="text-text-secondary text-sm">
              Arrastra aquí o sobre los archivos del artista
            </p>
          </div>
        </div>
      </div>
    </>
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
          preselectedFolderId={preselectedFolderId ?? undefined}
        />
      )}
    </>
  );
}
