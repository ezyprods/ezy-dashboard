'use client';

import React from 'react';
import { DriveExplorer } from '@/components/artists/DriveExplorer';
import type { PersonalProject } from '@/types';

interface PersonalProjectFilesTabProps {
  project: PersonalProject;
  onRefresh?: () => void;
}

export function PersonalProjectFilesTab({
  project,
}: PersonalProjectFilesTabProps) {
  return (
    <div className="w-full">
      <DriveExplorer
        rootFolderId={project.id}
        rootName={project.title}
      />
    </div>
  );
}
