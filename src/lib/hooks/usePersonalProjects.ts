'use client';

import { useAppData } from '@/lib/contexts/AppDataContext';
import type { CreatePersonalProjectInput, PersonalProject } from '@/types';

export function usePersonalProjects() {
  const appData = useAppData();

  return {
    projects: appData.personalProjects,
    isLoading: appData.personalProjectsLoading,
    error: appData.personalProjectsError,
    fetchProjects: appData.fetchPersonalProjects,
    createProject: appData.createPersonalProject,
    updateProject: appData.updatePersonalProject,
    deleteProject: appData.deletePersonalProject,
    cloneToArtist: appData.clonePersonalProjectToArtist,
  };
}
