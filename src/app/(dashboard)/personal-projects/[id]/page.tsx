'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  Music, 
  FolderTree, 
  ListTodo, 
  Clock, 
  Wrench, 
  Loader2, 
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { PersonalProjectHeader } from '@/components/personal-projects/PersonalProjectHeader';
import { PersonalProjectAudioTab } from '@/components/personal-projects/PersonalProjectAudioTab';
import { PersonalProjectFilesTab } from '@/components/personal-projects/PersonalProjectFilesTab';
import { PersonalProjectTasksTab } from '@/components/personal-projects/PersonalProjectTasksTab';
import { PersonalProjectTimeTab } from '@/components/personal-projects/PersonalProjectTimeTab';
import { PersonalProjectSoundBoxTab } from '@/components/personal-projects/PersonalProjectSoundBoxTab';
import { EditPersonalProjectModal } from '@/components/personal-projects/EditPersonalProjectModal';
import { CloneToArtistModal } from '@/components/personal-projects/CloneToArtistModal';
import type { 
  PersonalProject, 
  PersonalProjectDetail, 
  PersonalProjectStatus, 
  PersonalTask, 
  WorkSession 
} from '@/types';
import { customAlert, customConfirm } from '@/lib/dialog';

export default function PersonalProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [detail, setDetail] = useState<PersonalProjectDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'audio' | 'files' | 'tasks' | 'time' | 'soundbox'>('audio');

  // Modals
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);

  const fetchDetail = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/personal-projects/${projectId}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error al cargar el proyecto personal');
      }
      const data = await res.json();
      setDetail(data);
    } catch (err: any) {
      console.error('Fetch personal project detail error:', err);
      setError(err.message || 'Error de conexión');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId) {
      fetchDetail();
    }
  }, [projectId, fetchDetail]);

  const handleUpdateStatus = async (newStatus: PersonalProjectStatus) => {
    if (!detail) return;
    try {
      const res = await fetch(`/api/personal-projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) throw new Error('Error al actualizar el estado');
      const data = await res.json();
      setDetail(prev => prev ? { ...prev, project: data.project } : null);
    } catch (err: any) {
      console.error(err);
      customAlert(err.message || 'Error al cambiar estado');
    }
  };

  const handleUpdateMetadata = async (updates: Partial<PersonalProject>) => {
    if (!detail) return;
    try {
      const res = await fetch(`/api/personal-projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!res.ok) throw new Error('Error al actualizar el proyecto');
      const data = await res.json();
      setDetail(prev => prev ? { ...prev, project: data.project } : null);
    } catch (err: any) {
      console.error(err);
      throw err;
    }
  };

  const handleDelete = async () => {
    if (!detail) return;
    const confirmed = await customConfirm(
      `¿Estás seguro de eliminar "${detail.project.title}" de tu Google Drive?\n\nEsta acción no se puede deshacer.`
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/personal-projects/${projectId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Error al eliminar el proyecto');

      customAlert('Proyecto eliminado.');
      router.push('/personal-projects');
    } catch (err: any) {
      console.error(err);
      customAlert(err.message || 'Error al eliminar el proyecto');
    }
  };

  const handleUpdateTasks = async (tasks: PersonalTask[]) => {
    const res = await fetch(`/api/personal-projects/${projectId}/tasks`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tasks }),
    });
    if (!res.ok) throw new Error('Error al guardar tareas');
    setDetail(prev => prev ? { ...prev, tasks } : null);
  };

  const handleUpdateSessions = async (workSessions: WorkSession[]) => {
    const res = await fetch(`/api/personal-projects/${projectId}/tasks`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workSessions }),
    });
    if (!res.ok) throw new Error('Error al guardar sesiones');
    setDetail(prev => prev ? { ...prev, workSessions } : null);
  };

  const handleCloneToArtist = async (
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
      setDetail(prev => prev ? { ...prev, project: data.project } : null);
    }
    return data;
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
        <p className="text-sm font-medium text-text-secondary">Cargando proyecto personal desde Drive...</p>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="p-3 rounded-full bg-danger/10 text-danger border border-danger/20">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-bold text-text-primary">No se pudo cargar el proyecto</h2>
          <p className="text-xs text-text-secondary mt-1">{error || 'Proyecto no encontrado'}</p>
        </div>
        <Button variant="outline" onClick={() => fetchDetail()}>
          Reintentar
        </Button>
      </div>
    );
  }

  const TABS = [
    { key: 'audio', label: 'Bounces & Audios', icon: Music, badge: detail.bounces?.length || 0 },
    { key: 'files', label: 'Explorador de Archivos', icon: FolderTree },
    { key: 'tasks', label: 'Checklist', icon: ListTodo, badge: detail.tasks?.filter(t => t.status === 'pending').length || 0 },
    { key: 'time', label: 'Time Tracker', icon: Clock, badge: detail.workSessions?.length || 0 },
    { key: 'soundbox', label: 'SoundBox & Herramientas', icon: Wrench },
  ] as const;

  return (
    <div className="flex-1 w-full max-w-[1600px] mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <PersonalProjectHeader
        project={detail.project}
        onUpdateStatus={handleUpdateStatus}
        onEdit={() => setIsEditModalOpen(true)}
        onDelete={handleDelete}
        onCloneToArtist={() => setIsCloneModalOpen(true)}
      />

      {/* Workspace Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-border/80 pb-px overflow-x-auto custom-scrollbar">
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
                isActive
                  ? 'border-accent text-accent bg-accent/5'
                  : 'border-transparent text-text-secondary hover:text-text-primary hover:bg-surface-elevated/50'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {'badge' in tab && typeof (tab as any).badge === 'number' && (tab as any).badge > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  isActive ? 'bg-accent text-white' : 'bg-surface-elevated text-text-secondary'
                }`}>
                  {(tab as any).badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Workspace Content */}
      <div className="animate-in fade-in-50 duration-200">
        {activeTab === 'audio' && (
          <PersonalProjectAudioTab
            project={detail.project}
            bounces={detail.bounces || []}
            folders={detail.folders || []}
            onRefresh={fetchDetail}
            onUpdateMetadata={handleUpdateMetadata}
          />
        )}

        {activeTab === 'files' && (
          <PersonalProjectFilesTab
            project={detail.project}
            onRefresh={fetchDetail}
          />
        )}

        {activeTab === 'tasks' && (
          <PersonalProjectTasksTab
            projectId={projectId}
            tasks={detail.tasks || []}
            onUpdateTasks={handleUpdateTasks}
          />
        )}

        {activeTab === 'time' && (
          <PersonalProjectTimeTab
            projectId={projectId}
            workSessions={detail.workSessions || []}
            onUpdateSessions={handleUpdateSessions}
          />
        )}

        {activeTab === 'soundbox' && (
          <PersonalProjectSoundBoxTab
            project={detail.project}
          />
        )}
      </div>

      {/* Modals */}
      <EditPersonalProjectModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        project={detail.project}
        onUpdate={async (id, updates) => {
          await handleUpdateMetadata(updates);
        }}
      />

      <CloneToArtistModal
        isOpen={isCloneModalOpen}
        onClose={() => setIsCloneModalOpen(false)}
        project={detail.project}
        onClone={handleCloneToArtist}
      />
    </div>
  );
}
