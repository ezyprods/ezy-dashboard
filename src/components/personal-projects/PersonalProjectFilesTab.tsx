'use client';

import React from 'react';
import { FileExplorer } from '@/components/explorer/FileExplorer';
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
      <FileExplorer
        rootId={project.id}
        rootName={project.title}
        scope={{ type: 'personal', projectId: project.id }}
      />
    </div>
  );
}
