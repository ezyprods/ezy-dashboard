'use client';

import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { usePayments } from '@/lib/hooks/usePayments';
import { PAYMENT_METHOD_LABELS } from '@/lib/constants';
import { Loader2 } from 'lucide-react';
import { useArtists } from '@/lib/hooks/useArtists';

export function NewPaymentModal({ 
  isOpen, 
  onClose,
  preselectedArtistId,
  preselectedProjectId 
}: { 
  isOpen: boolean, 
  onClose: () => void,
  preselectedArtistId?: string,
  preselectedProjectId?: string
}) {
  const { createPayment } = usePayments();
  const { activeArtists } = useArtists();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    artistId: preselectedArtistId || '',
    projectId: preselectedProjectId || '',
    amount: '',
    concept: '',
    date: new Date().toISOString().split('T')[0],
    method: 'transfer' as any,
  });

  useEffect(() => {
    if (isOpen) {
      setFormData(prev => ({
        ...prev,
        artistId: preselectedArtistId || prev.artistId,
        projectId: preselectedProjectId || prev.projectId
      }));
    }
  }, [isOpen, preselectedArtistId, preselectedProjectId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const result = await createPayment({
        ...formData,
        amount: Number(formData.amount)
      } as any);
      if (result.success) {
        onClose();
        setFormData({ 
          artistId: preselectedArtistId || '', 
          projectId: preselectedProjectId || '', 
          amount: '', 
          concept: '', 
          date: new Date().toISOString().split('T')[0], 
          method: 'transfer' 
        });
      } else {
        setError(result.error || 'Error al crear el pago');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Registrar Pago" description="Añade un nuevo cobro o gasto.">
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && <div className="p-3 bg-error/10 text-error rounded-lg text-sm">{error}</div>}

        <div className="space-y-4">
          {!preselectedArtistId && (
            <div className="space-y-2">
              <Label htmlFor="artist">Artista *</Label>
              <select
                id="artist" required
                className="flex h-10 w-full rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary focus:ring-2 focus:ring-accent outline-none"
                value={formData.artistId}
                onChange={(e) => setFormData(prev => ({ ...prev, artistId: e.target.value }))}
              >
                <option value="">Selecciona un artista</option>
                {activeArtists.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="concept">Concepto *</Label>
            <Input id="concept" required placeholder="Ej. Anticipo Mix EP" value={formData.concept}
              onChange={(e) => setFormData(prev => ({ ...prev, concept: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Cantidad (€) *</Label>
              <Input id="amount" type="number" step="0.01" required placeholder="0.00" value={formData.amount}
                onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Fecha *</Label>
              <Input id="date" type="date" required value={formData.date}
                onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Método de Pago</Label>
            <div className="flex gap-2">
              {(Object.keys(PAYMENT_METHOD_LABELS) as any[]).map((method) => (
                <button
                  key={method} type="button"
                  onClick={() => setFormData(prev => ({ ...prev, method }))}
                  className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors ${
                    formData.method === method ? 'bg-accent/20 border-accent text-accent-light font-medium' : 'bg-surface border-border text-text-secondary'
                  }`}
                >
                  {PAYMENT_METHOD_LABELS[method]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isLoading}>Cancelar</Button>
          <Button type="submit" disabled={isLoading || !formData.artistId || !formData.amount || !formData.concept}>
            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Registrar Pago
          </Button>
        </div>
      </form>
    </Modal>
  );
}
