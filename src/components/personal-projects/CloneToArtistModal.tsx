'use client';

import React, { useState } from 'react';
import { Share2, Users, Loader2, Info, ArrowRight } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { useArtists } from '@/lib/hooks/useArtists';
import { PROJECT_TYPE_LABELS } from '@/lib/constants';
import type { PersonalProject, ProjectType } from '@/types';
import { customAlert, customConfirm } from '@/lib/dialog';

interface CloneToArtistModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: PersonalProject | null;
  onClone: (id: string, artistId: string, customTitle?: string, projectType?: string) => Promise<any>;
}

export function CloneToArtistModal({
  isOpen,
  onClose,
  project,
  onClone,
}: CloneToArtistModalProps) {
  const { activeArtists: artists, isLoading: isArtistsLoading } = useArtists();
  const [selectedArtistId, setSelectedArtistId] = useState('');
  const [projectTitle, setProjectTitle] = useState('');
  const [projectType, setProjectType] = useState<ProjectType>('single');
  const [isSubmitting, setIsSubmitting] = useState(false);

  React.useEffect(() => {
    if (project) {
      setProjectTitle(project.title);
      if (artists.length > 0 && !selectedArtistId) {
        setSelectedArtistId(artists[0].id);
      }
    }
  }, [project, artists, selectedArtistId]);

  if (!project) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedArtistId) {
      customAlert('Por favor, selecciona un artista destino.');
      return;
    }

    const artistName = artists.find(a => a.id === selectedArtistId)?.name || 'el artista';
    const confirmed = await customConfirm(
      `¿Confirmas la cesión de "${project.title}" a ${artistName}?\n\nSe creará una copia en su carpeta de Drive y este proyecto pasará al estado "Cedido a Artista".`
    );

    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      await onClone(
        project.id,
        selectedArtistId,
        projectTitle.trim() || project.title,
        projectType
      );

      customAlert(`¡Proyecto cedido y clonado con éxito en la ficha de ${artistName}!`);
      onClose();
    } catch (err: any) {
      console.error(err);
      customAlert(err.message || 'Error al ceder el proyecto al artista.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Ceder Proyecto a Artista"
      description="Clona este beat/grabación a la carpeta de un artista conservando tu original"
      className="md:max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Info Box */}
        <div className="bg-accent/10 border border-accent/20 rounded-xl p-3.5 flex items-start gap-3">
          <Info className="w-5 h-5 text-accent shrink-0 mt-0.5" />
          <div className="text-xs text-text-secondary leading-relaxed">
            <p className="font-semibold text-text-primary mb-1">¿Cómo funciona la cesión?</p>
            <p>
              Se generará una copia física completa del proyecto (con carpetas estándar de producción y sus bounces) dentro del artista en Google Drive.
            </p>
            <p className="mt-1">
              Tu proyecto personal original se mantendrá en tu catálogo como histórico, marcado como <strong>Cedido a Artista</strong> con enlace a la versión de producción.
            </p>
          </div>
        </div>

        {/* Target Artist */}
        <div>
          <Label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
            Artista Destino *
          </Label>
          {isArtistsLoading ? (
            <div className="flex items-center gap-2 text-xs text-text-secondary py-2">
              <Loader2 className="w-4 h-4 animate-spin text-accent" /> Cargando artistas...
            </div>
          ) : (
            <select
              value={selectedArtistId}
              onChange={(e) => setSelectedArtistId(e.target.value)}
              required
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
            >
              <option value="" disabled>Selecciona un artista...</option>
              {artists.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Cloned Project Title */}
        <div>
          <Label htmlFor="clone-proj-title" className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
            Nombre del Proyecto en el Artista
          </Label>
          <Input
            id="clone-proj-title"
            value={projectTitle}
            onChange={(e) => setProjectTitle(e.target.value)}
            placeholder={project.title}
            required
            className="w-full"
          />
        </div>

        {/* Project Type */}
        <div>
          <Label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1">
            Tipo de Proyecto
          </Label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(Object.entries(PROJECT_TYPE_LABELS) as [ProjectType, string][]).map(([tKey, tLabel]) => {
              const isSelected = projectType === tKey;
              return (
                <button
                  key={tKey}
                  type="button"
                  onClick={() => setProjectType(tKey)}
                  className={`py-2 px-3 rounded-lg border text-xs font-semibold transition-all ${
                    isSelected
                      ? 'bg-accent text-white border-accent shadow-sm'
                      : 'bg-surface hover:bg-surface-elevated border-border text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {tLabel}
                </button>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border/50">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting || !selectedArtistId} className="bg-accent hover:bg-accent-light text-white">
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Clonando en Drive...
              </>
            ) : (
              <>
                <Share2 className="w-4 h-4 mr-1.5" />
                Confirmar Cesión
              </>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
