'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { useProjects } from '@/lib/hooks/useProjects';
import { PROJECT_TYPE_LABELS } from '@/lib/constants';
import type { ProjectType } from '@/types';
import { Loader2 } from 'lucide-react';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  artistId: string;
}

export function NewProjectModal({ isOpen, onClose, artistId }: NewProjectModalProps) {
  const { createProject } = useProjects(artistId);
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

    try {
      const result = await createProject({
        artistId,
        title: formData.title,
        type: formData.type,
        releaseDate: formData.releaseDate || undefined,
        deliveryDate: formData.deliveryDate || undefined,
      });

      if (result.success) {
        onClose();
        setFormData({ title: '', type: 'single', releaseDate: '', deliveryDate: '' });
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
              <Input id="delivery" type="date" value={formData.deliveryDate}
                onChange={(e) => setFormData(prev => ({ ...prev, deliveryDate: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="release">Fecha de Lanzamiento</Label>
              <Input id="release" type="date" value={formData.releaseDate}
                onChange={(e) => setFormData(prev => ({ ...prev, releaseDate: e.target.value }))} />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isLoading}>Cancelar</Button>
          <Button type="submit" disabled={isLoading || !formData.title}>
            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Crear Proyecto
          </Button>
        </div>
      </form>
    </Modal>
  );
}
