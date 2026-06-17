import { useState, useEffect, useCallback } from 'react';
import type { Artist, CreateArtistInput } from '@/types';
import { customAlert } from '@/lib/dialog';

export function useArtists() {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchArtists = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/artists');
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch artists');
      }
      const data = await res.json();
      if (data.needsAuth) {
        customAlert('Tu sesión de Google Drive ha expirado por seguridad. Redirigiendo para reconectar...');
        setTimeout(() => {
          window.location.href = '/api/auth/google';
        }, 2000);
        throw new Error(data.error || 'Token de Google expirado.');
      }
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

  return {
    artists,
    isLoading,
    error,
    fetchArtists,
    createArtist,
    updateArtist,
    // Add computed properties
    activeArtists: artists.filter(a => a.status === 'active'),
    archivedArtists: artists.filter(a => a.status === 'archived'),
  };
}
