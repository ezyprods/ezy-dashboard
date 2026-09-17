'use client';

import { useEffect, useState } from 'react';
import { NewArtistModal } from '@/components/artists/NewArtistModal';

/**
 * Global modals opened from anywhere in the dashboard through window events:
 *  - 'ezy:new-artist'   → "Nuevo Artista"
 * ('ezy:quick-upload' is handled by GlobalDropZone, which opens the Smart Upload.)
 */
export function GlobalActionModals() {
  const [isNewArtistOpen, setIsNewArtistOpen] = useState(false);

  useEffect(() => {
    const openNewArtist = () => setIsNewArtistOpen(true);
    window.addEventListener('ezy:new-artist', openNewArtist);
    return () => window.removeEventListener('ezy:new-artist', openNewArtist);
  }, []);

  return <NewArtistModal isOpen={isNewArtistOpen} onClose={() => setIsNewArtistOpen(false)} />;
}
