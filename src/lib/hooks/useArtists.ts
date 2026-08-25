'use client';

import { useAppData } from '@/lib/contexts/AppDataContext';
import type { CreateArtistInput } from '@/types';

export function useArtists() {
  const appData = useAppData();

  return {
    artists: appData.artists,
    isLoading: appData.artistsLoading,
    error: appData.artistsError,
    fetchArtists: appData.fetchArtists,
    createArtist: appData.createArtist,
    updateArtist: appData.updateArtist,
    activeArtists: appData.activeArtists,
    archivedArtists: appData.archivedArtists,
    deleteArtistFromState: appData.deleteArtistFromState,
  };
}
