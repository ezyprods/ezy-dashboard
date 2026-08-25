'use client';

import { useState, useEffect, useCallback } from 'react';
import type { 
  PersonalProject, 
  CreatePersonalProjectInput 
} from '@/types';

export function usePersonalProjects() {
  const [projects, setProjects] = useState<PersonalProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/personal-projects');
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error al cargar los proyectos personales');
      }
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (err: any) {
      console.error('usePersonalProjects error:', err);
      setError(err.message || 'Error de conexión');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const createProject = useCallback(async (input: CreatePersonalProjectInput): Promise<PersonalProject> => {
    const res = await fetch('/api/personal-projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Error al crear el proyecto personal');
    }

    const data = await res.json();
    const newProj: PersonalProject = data.project;
    setProjects(prev => [newProj, ...prev.filter(p => p.id !== newProj.id)]);
    return newProj;
  }, []);

  const updateProject = useCallback(async (id: string, updates: Partial<PersonalProject>): Promise<PersonalProject> => {
    const res = await fetch(`/api/personal-projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Error al actualizar el proyecto');
    }

    const data = await res.json();
    const updatedProj: PersonalProject = data.project;
    setProjects(prev => prev.map(p => (p.id === id ? updatedProj : p)));
    return updatedProj;
  }, []);

  const deleteProject = useCallback(async (id: string): Promise<void> => {
    const res = await fetch(`/api/personal-projects/${id}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Error al eliminar el proyecto');
    }

    setProjects(prev => prev.filter(p => p.id !== id));
  }, []);

  const cloneToArtist = useCallback(async (
    id: string, 
    artistId: string, 
    customTitle?: string, 
    projectType: string = 'single'
  ) => {
    const res = await fetch(`/api/personal-projects/${id}/clone-to-artist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artistId, projectTitle: customTitle, projectType }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Error al ceder el proyecto al artista');
    }

    const data = await res.json();
    if (data.project) {
      setProjects(prev => prev.map(p => (p.id === id ? data.project : p)));
    }
    return data;
  }, []);

  return {
    projects,
    isLoading,
    error,
    fetchProjects,
    createProject,
    updateProject,
    deleteProject,
    cloneToArtist,
  };
}
