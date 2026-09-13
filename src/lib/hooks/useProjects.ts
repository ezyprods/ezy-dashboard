import { useState, useEffect, useCallback, useRef } from 'react';
import type { Project, CreateProjectInput } from '@/types';

export function useProjects(artistId?: string) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Tracks which artistId this hook was last asked to load, so an
  // out-of-order response (e.g. switching between artist pages quickly)
  // can't overwrite the list with another artist's projects.
  const requestedArtistIdRef = useRef<string | undefined>(artistId);

  const fetchProjects = useCallback(async () => {
    requestedArtistIdRef.current = artistId;
    if (!artistId) {
      setProjects([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects?artistId=${artistId}`);
      if (!res.ok) throw new Error('Failed to fetch projects');
      const data = await res.json();
      if (requestedArtistIdRef.current !== artistId) return; // stale: artistId changed meanwhile
      setProjects(data.projects || []);
    } catch (err: any) {
      if (requestedArtistIdRef.current === artistId) setError(err.message);
    } finally {
      if (requestedArtistIdRef.current === artistId) setIsLoading(false);
    }
  }, [artistId]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const createProject = async (data: CreateProjectInput) => {
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create project');
      const newProject = await res.json();
      setProjects(prev => [...prev, newProject.project]);
      return { success: true, project: newProject.project };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  return {
    projects,
    isLoading,
    error,
    fetchProjects,
    createProject,
    activeProjects: projects.filter(p => p.status === 'active'),
  };
}
