'use client';

import { useEffect, useState } from 'react';
import { NewArtistModal } from '@/components/artists/NewArtistModal';
import { QuickUploadModal } from '@/components/dashboard/QuickUploadModal';
import { useAppData } from '@/lib/contexts/AppDataContext';

/**
 * Global modals opened from anywhere in the dashboard through window events:
 *  - 'ezy:new-artist'   → "Nuevo Artista"
 *  - 'ezy:quick-upload' → "Subida Rápida"
 * (used by the global right-click menu and the Topbar quick actions).
 */
export function GlobalActionModals() {
  const { artists } = useAppData();
  const [isNewArtistOpen, setIsNewArtistOpen] = useState(false);
  const [isQuickUploadOpen, setIsQuickUploadOpen] = useState(false);

  useEffect(() => {
    const openNewArtist = () => setIsNewArtistOpen(true);
    const openQuickUpload = () => setIsQuickUploadOpen(true);
    window.addEventListener('ezy:new-artist', openNewArtist);
    window.addEventListener('ezy:quick-upload', openQuickUpload);
    return () => {
      window.removeEventListener('ezy:new-artist', openNewArtist);
      window.removeEventListener('ezy:quick-upload', openQuickUpload);
    };
  }, []);

  return (
    <>
      <NewArtistModal isOpen={isNewArtistOpen} onClose={() => setIsNewArtistOpen(false)} />
      {isQuickUploadOpen && (
        <QuickUploadModal isOpen={isQuickUploadOpen} onClose={() => setIsQuickUploadOpen(false)} artists={artists} />
      )}
    </>
  );
}
