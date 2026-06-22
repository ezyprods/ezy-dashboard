'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { useProjects } from '@/lib/hooks/useProjects';
import { PROJECT_TYPE_LABELS } from '@/lib/constants';
import type { ProjectType, Artist } from '@/types';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { DatePicker } from '@/components/ui/DatePicker';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  artistId?: string;
  artists?: Artist[];
}

export function NewProjectModal({ isOpen, onClose, artistId, artists }: NewProjectModalProps) {
  const [selectedArtistId, setSelectedArtistId] = useState<string>(artistId || '');
  const { createProject } = useProjects(selectedArtistId || artistId);
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    type: 'single' as ProjectType,
    releaseDate: '',
    deliveryDate: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const targetArtistId = artistId || selectedArtistId;
    if (!targetArtistId) {
      setError("Debes seleccionar un artista primero.");
      setIsLoading(false);
      return;
    }

    try {
      const result = await createProject({
        artistId: targetArtistId,
        title: formData.title,
        type: formData.type,
        releaseDate: formData.releaseDate || undefined,
        deliveryDate: formData.deliveryDate || undefined,
      });

      if (result.success) {
        onClose();
        setFormData({ title: '', type: 'single', releaseDate: '', deliveryDate: '' });
        // Ir directamente al proyecto recién creado
        if (result.project?.id) {
          router.push(`/projects/${result.project.id}`);
        }
      } else {
        setError(result.error || 'Error al crear el proyecto');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nuevo Proyecto" description="Crea una nueva carpeta de proyecto en Drive.">
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && <div className="p-3 bg-error/10 text-error rounded-lg text-sm">{error}</div>}

        <div className="space-y-4">
          {!artistId && artists && (
            <div className="space-y-2">
              <Label htmlFor="artistSelect">Artista *</Label>
              <select
                id="artistSelect"
                value={selectedArtistId}
                onChange={(e) => setSelectedArtistId(e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                required
              >
                <option value="" disabled>Selecciona un artista...</option>
                {artists.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Tipo de Proyecto *</Label>
            <div className="flex gap-2">
              {(Object.keys(PROJECT_TYPE_LABELS) as ProjectType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, type }))}
                  className={`flex-1 py-2 text-sm rounded-lg border transition-colors ${
                    formData.type === type 
                      ? 'bg-accent/20 border-accent text-accent-light font-medium' 
                      : 'bg-surface border-border text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {PROJECT_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Título del Proyecto *</Label>
            <Input 
              id="title" required placeholder="Ej. Fuego" value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="delivery">Fecha de Entrega (Interna)</Label>
              <DatePicker
                id="delivery"
                value={formData.deliveryDate}
                onChange={(val) => setFormData(prev => ({ ...prev, deliveryDate: val }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="release">Fecha de Lanzamiento</Label>
              <DatePicker
                id="release"
                value={formData.releaseDate}
                onChange={(val) => setFormData(prev => ({ ...prev, releaseDate: val }))}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isLoading}>Cancelar</Button>
          <Button type="submit" disabled={isLoading || !formData.title || (!artistId && !selectedArtistId)}>
            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Crear Proyecto
          </Button>
        </div>
      </form>
    </Modal>
  );
}
