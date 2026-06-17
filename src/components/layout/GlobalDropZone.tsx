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
  const shouldShowOverlay = isDraggingFiles && !isInsideArtistFolder;

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
    <div className="fixed inset-0 z-[400] pointer-events-none">
      {/* Semi-transparent backdrop */}
      <div className="absolute inset-0 bg-background/85 backdrop-blur-md" />

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center p-8 gap-6">
        
        {/* Title */}
        <div className="text-center mb-2 pointer-events-none">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-4">
            <UploadCloud className="w-8 h-8 text-accent animate-pulse" />
          </div>
          <h2 className="text-2xl font-bold text-text-primary">Subir Archivos</h2>
          <p className="text-text-secondary mt-1 text-sm">
            {isArtistsList
              ? 'Suelta los archivos encima del artista al que pertenecen'
              : 'Suelta los archivos aquí para procesarlos con Subida Inteligente'}
          </p>
        </div>

        {isArtistsList ? (
          /* Artist cards grid — each is a drop target */
          <div className="pointer-events-auto w-full max-w-2xl">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-1">
              {activeArtists.map(artist => (
                <ArtistDropCard
                  key={artist.id}
                  artist={artist}
                  onDrop={(files, artistId) => triggerUploadForArtist(files, artistId)}
                />
              ))}
              {activeArtists.length === 0 && (
                <div className="col-span-2 text-center text-text-secondary text-sm py-8">
                  No tienes artistas. Crea uno primero.
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Generic drop zone */
          <div
            className="pointer-events-auto"
            onDragEnter={(e) => { e.preventDefault(); zoneCounter.current++; setHoveredZone(true); }}
            onDragLeave={() => { zoneCounter.current--; if (zoneCounter.current <= 0) { zoneCounter.current = 0; setHoveredZone(false); } }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleGenericDrop}
          >
            <div className={`
              w-80 h-48 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-3 transition-all duration-200
              ${hoveredZone
                ? 'border-accent bg-accent/15 scale-105 shadow-2xl shadow-accent/20'
                : 'border-accent/40 bg-accent/5'}
            `}>
              <UploadCloud className={`w-10 h-10 transition-colors ${hoveredZone ? 'text-accent' : 'text-accent/60'}`} />
              <div className="text-center">
                <p className={`font-semibold text-sm transition-colors ${hoveredZone ? 'text-accent' : 'text-text-primary'}`}>
                  {hoveredZone ? '¡Suelta aquí!' : 'Zona de subida'}
                </p>
                <p className="text-xs text-text-secondary mt-0.5">Audio, imágenes, vídeos y más</p>
              </div>
            </div>
          </div>
        )}

        {/* Press Escape hint */}
        <p className="text-xs text-text-secondary pointer-events-none opacity-60 mt-2">
          Pulsa Escape para cancelar
        </p>
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
          artists={activeArtists}
          preselectedArtistId={preselectedArtistId ?? undefined}
        />
      )}
    </>
  );
}
