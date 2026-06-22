'use client';

import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { useArtists } from '@/lib/hooks/useArtists';
import { SERVICE_LABELS } from '@/lib/constants';
import type { Artist, ServiceType } from '@/types';
import { Loader2 } from 'lucide-react';

interface EditArtistModalProps {
  isOpen: boolean;
  onClose: (saved?: boolean) => void;
  artist: Artist;
}

export function EditArtistModal({ isOpen, onClose, artist }: EditArtistModalProps) {
  const { updateArtist } = useArtists();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    genre: '',
  });

  const [selectedServices, setSelectedServices] = useState<ServiceType[]>([]);

  useEffect(() => {
    if (artist && isOpen) {
      setFormData({
        name: artist.name || '',
        email: artist.email || '',
        phone: artist.phone || '',
        genre: artist.genre ? artist.genre.join(', ') : '',
      });
      setSelectedServices(artist.services || []);
      setError(null);
    }
  }, [artist, isOpen]);

  const handleServiceToggle = (service: ServiceType) => {
    setSelectedServices(prev => 
      prev.includes(service) 
        ? prev.filter(s => s !== service)
        : [...prev, service]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = await updateArtist(artist.id, {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        genre: formData.genre.split(',').map(g => g.trim()).filter(Boolean),
        services: selectedServices,
      });

      if (result.success) {
        onClose(true);
      } else {
        setError(result.error || 'Hubo un error al actualizar el artista');
      }
    } catch (err: any) {
      setError(err.message || 'Ocurrió un error inesperado');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => onClose(false)}
      title="Editar Artista"
      description="Modifica la información del perfil del artista."
    >
      <form onSubmit={handleSubmit} className="space-y-6 mt-4">
        {error && (
          <div className="p-3 text-sm text-error bg-error/10 border border-error/20 rounded-lg">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Nombre del Artista</Label>
            <Input
              id="edit-name"
              placeholder="Ej. Mora"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              disabled={isLoading}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email (Opcional)</Label>
              <Input
                id="edit-email"
                type="email"
                placeholder="correo@ejemplo.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Teléfono (Opcional)</Label>
              <Input
                id="edit-phone"
                type="tel"
                placeholder="+34 600 000 000"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                disabled={isLoading}
              />
            </div>
          </div>

        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border mt-6">
          <Button type="button" variant="outline" onClick={() => onClose(false)} disabled={isLoading}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isLoading || !formData.name}>
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              'Guardar Cambios'
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
