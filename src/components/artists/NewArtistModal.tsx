'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { useArtists } from '@/lib/hooks/useArtists';
import { SERVICE_LABELS } from '@/lib/constants';
import type { ServiceType } from '@/types';
import { Loader2 } from 'lucide-react';

interface NewArtistModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NewArtistModal({ isOpen, onClose }: NewArtistModalProps) {
  const { createArtist } = useArtists();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    genre: '',
  });

  const [selectedServices, setSelectedServices] = useState<ServiceType[]>([]);

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
      const result = await createArtist({
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        genre: formData.genre.split(',').map(g => g.trim()).filter(Boolean),
        services: selectedServices,
      });

      if (result.success) {
        onClose();
        // Reset form
        setFormData({ name: '', email: '', phone: '', genre: '' });
        setSelectedServices([]);
      } else {
        setError(result.error || 'Hubo un error al crear el artista');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Nuevo Artista"
      description="Crea un nuevo artista. Se generará automáticamente su estructura de carpetas en Google Drive."
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-3 rounded-lg bg-error/10 border border-error/20 text-error text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre del Artista / Banda *</Label>
            <Input 
              id="name" 
              required 
              placeholder="Ej. Los Rebeldes" 
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="correo@ejemplo.com"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Teléfono</Label>
              <Input 
                id="phone" 
                placeholder="+34 600 000 000"
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="genre">Géneros (separados por coma)</Label>
            <Input 
              id="genre" 
              placeholder="Rock, Indie, Pop"
              value={formData.genre}
              onChange={(e) => setFormData(prev => ({ ...prev, genre: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label>Servicios Contratados</Label>
            <div className="flex flex-wrap gap-2 pt-1">
              {(Object.keys(SERVICE_LABELS) as ServiceType[]).map((service) => (
                <button
                  key={service}
                  type="button"
                  onClick={() => handleServiceToggle(service)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    selectedServices.includes(service)
                      ? 'bg-accent/20 border-accent/50 text-accent-light'
                      : 'bg-surface border-border text-text-secondary hover:border-text-secondary'
                  }`}
                >
                  {SERVICE_LABELS[service]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isLoading || !formData.name}>
            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isLoading ? 'Creando en Drive...' : 'Crear Artista'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
