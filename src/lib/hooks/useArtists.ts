import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Artist, CreateArtistInput } from '@/types';
import { customAlert } from '@/lib/dialog';

export function useArtists() {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchArtists = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/artists-list?t=${Date.now()}`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch artists');
      }
      const data = await res.json();
        customAlert('El acceso a Google Drive ha caducado. Te redirigimos para que generes un nuevo token.');
        setTimeout(() => {
          window.location.href = '/api/auth/google-token?type=both';
        }, 2000);
        throw new Error('Token de Google expirado.');
      setArtists(data.artists || []);
    } catch (err: any) {
      console.error('Error fetching artists:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchArtists();
  }, [fetchArtists]);

  const createArtist = async (data: CreateArtistInput) => {
    try {
      const res = await fetch('/api/artists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to create artist');
      }
      
      const newArtist = await res.json();
      setArtists(prev => [...prev, newArtist]);
      return { success: true, artist: newArtist };
    } catch (err: any) {
      console.error('Error creating artist:', err);
      return { success: false, error: err.message };
    }
  };

  const updateArtist = async (id: string, data: Partial<CreateArtistInput>) => {
    try {
      const res = await fetch(`/api/artists/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to update artist');
      }
      
      const { artist: updatedArtist } = await res.json();
      setArtists(prev => prev.map(a => a.id === id ? updatedArtist : a));
      return { success: true, artist: updatedArtist };
    } catch (err: any) {
      console.error('Error updating artist:', err);
      return { success: false, error: err.message };
    }
  };

  const activeArtists = useMemo(() => artists.filter(a => a.status === 'active'), [artists]);
  const archivedArtists = useMemo(() => artists.filter(a => a.status === 'archived'), [artists]);

  return {
    artists,
    isLoading,
    error,
    fetchArtists,
    createArtist,
    updateArtist,
    activeArtists,
    archivedArtists,
  };
}
