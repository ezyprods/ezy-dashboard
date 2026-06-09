import { useState, useEffect, useCallback } from 'react';
import type { Project, CreateProjectInput } from '@/types';

export function useProjects(artistId?: string) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    if (!artistId) return;
    
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects?artistId=${artistId}`);
      if (!res.ok) throw new Error('Failed to fetch projects');
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
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
