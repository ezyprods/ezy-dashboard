'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { NewArtistModal } from '@/components/artists/NewArtistModal';
import { COMPOSE_EVENT, type ComposeRequest } from '@/components/instagram/igClient';

// El formulario de Instagram (y mediabunny) solo se descarga al abrirlo
const InstagramComposer = dynamic(() => import('@/components/instagram/Composer').then(m => m.InstagramComposer), { ssr: false });

/**
 * Global modals opened from anywhere in the dashboard through window events:
 *  - 'ezy:new-artist'          → "Nuevo Artista"
 *  - 'ezy:instagram-compose'   → publicar o programar en Instagram (ver components/instagram/igClient.ts)
 * ('ezy:quick-upload' is handled by GlobalDropZone, which opens the Smart Upload.)
 */
export function GlobalActionModals() {
  const [isNewArtistOpen, setIsNewArtistOpen] = useState(false);
  const [compose, setCompose] = useState<{ n: number; req: ComposeRequest } | null>(null);

  useEffect(() => {
    const openNewArtist = () => setIsNewArtistOpen(true);
    const openCompose = (e: Event) => setCompose(c => ({ n: (c?.n || 0) + 1, req: (e as CustomEvent<ComposeRequest>).detail || {} }));
    window.addEventListener('ezy:new-artist', openNewArtist);
    window.addEventListener(COMPOSE_EVENT, openCompose);
    return () => {
      window.removeEventListener('ezy:new-artist', openNewArtist);
      window.removeEventListener(COMPOSE_EVENT, openCompose);
    };
  }, []);

  return (
    <>
      <NewArtistModal isOpen={isNewArtistOpen} onClose={() => setIsNewArtistOpen(false)} />
      {compose && <InstagramComposer key={compose.n} request={compose.req} onClose={() => setCompose(null)} />}
    </>
  );
}
