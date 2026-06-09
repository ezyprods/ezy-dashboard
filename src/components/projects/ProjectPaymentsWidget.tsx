'use client';

import { useState, useEffect } from 'react';
import { Loader2, DollarSign, CheckCircle2, Clock, Plus, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { usePayments } from '@/lib/hooks/usePayments';
import { NewPaymentModal } from '@/components/payments/NewPaymentModal';

export function ProjectPaymentsWidget({ projectId, initialBudget = 0, artistId }: { projectId: string, initialBudget?: number, artistId: string }) {
  const { payments, updatePaymentStatus } = usePayments();
  const [budget, setBudget] = useState(initialBudget);
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [tempBudget, setTempBudget] = useState(initialBudget.toString());
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Filter payments for this specific project
  const projectPayments = payments.filter(p => p.projectId === projectId);
  
  const totalReceived = projectPayments.filter(p => p.status === 'paid').reduce((acc, p) => acc + p.amount, 0);
  const totalPending = projectPayments.filter(p => p.status === 'pending').reduce((acc, p) => acc + p.amount, 0);
  
  const remainingToCollect = Math.max(0, budget - totalReceived);
  const progress = budget > 0 ? Math.min(100, Math.round((totalReceived / budget) * 100)) : 0;

  const handleSaveBudget = async () => {
    const numBudget = Number(tempBudget);
    if (isNaN(numBudget)) return;
    
    setIsSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ budget: numBudget })
      });
      if (!res.ok) throw new Error('Error al guardar');
      setBudget(numBudget);
      setIsEditingBudget(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="glass rounded-xl border border-border p-6 animate-fade-in">
      <NewPaymentModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        preselectedArtistId={artistId}
        preselectedProjectId={projectId}
      />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-text-primary">Control de Pagos</h3>
          <p className="text-sm text-text-secondary">Presupuesto y cobros del proyecto</p>
        </div>
        <Button size="sm" onClick={() => setIsModalOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Registrar Cobro
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Budget */}
        <div className="bg-surface-elevated rounded-lg p-4 border border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-text-secondary">Presupuesto Total</span>
            <button onClick={() => setIsEditingBudget(!isEditingBudget)} className="text-text-secondary hover:text-accent">
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          </div>
          {isEditingBudget ? (
            <div className="flex items-center gap-2">
              <Input 
                value={tempBudget} 
                onChange={e => setTempBudget(e.target.value)} 
                className="h-8 text-lg font-bold w-24 px-2"
                type="number"
              />
              <Button size="sm" onClick={handleSaveBudget} disabled={isSaving} className="h-8 px-3">
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'OK'}
              </Button>
            </div>
          ) : (
            <div className="text-2xl font-bold">{budget}€</div>
          )}
        </div>

        {/* Received */}
        <div className="bg-surface-elevated rounded-lg p-4 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-success" />
            <span className="text-sm text-text-secondary">Cobrado</span>
          </div>
          <div className="text-2xl font-bold text-success">{totalReceived}€</div>
        </div>

        {/* Remaining */}
        <div className="bg-surface-elevated rounded-lg p-4 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-warning" />
            <span className="text-sm text-text-secondary">Falta por cobrar</span>
          </div>
          <div className="text-2xl font-bold text-warning">{remainingToCollect}€</div>
        </div>
      </div>

      {/* Progress */}
      {budget > 0 && (
        <div className="mb-8">
          <div className="flex justify-between text-xs text-text-secondary mb-2">
            <span>Progreso de cobro</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full h-2 bg-surface rounded-full overflow-hidden">
            <div className="h-full bg-success transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {/* Payment History */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">Historial</h4>
        {projectPayments.length === 0 ? (
          <p className="text-sm text-text-secondary italic">No hay pagos registrados para este proyecto.</p>
        ) : (
          projectPayments.map(payment => (
            <div key={payment.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface/30">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${payment.status === 'paid' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                  <DollarSign className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-medium">{payment.concept || 'Pago'}</div>
                  <div className="text-xs text-text-secondary">{new Date(payment.date).toLocaleDateString()} • {payment.method}</div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="font-bold">{payment.amount}€</div>
                {payment.status === 'pending' && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => updatePaymentStatus(payment.id, 'paid')}>
                    Marcar Pagado
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
