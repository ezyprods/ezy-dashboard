'use client';

import { useState, useEffect } from 'react';
import { Loader2, Plus, DollarSign, Trash2, ChevronRight, CheckCircle2, Clock, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { customAlert, customConfirm, customPrompt } from '@/lib/dialog';


export function ArtistPaymentsTab({ artistId }: { artistId: string }) {
  const [sheets, setSheets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeSheetId, setActiveSheetId] = useState<string | null>(null);

  useEffect(() => { fetchSheets(); }, [artistId]);

  const fetchSheets = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/artists/${artistId}/payments`);
      if (res.ok) {
        const data = await res.json();
        setSheets(data.sheets || []);
      }
    } catch (e) { console.error(e); } finally { setIsLoading(false); }
  };

  const createSheet = async () => {
    const name = await customPrompt('Nombre de la hoja de pagos (ej: Álbum 2024):');
    if (!name) return;
    try {
      const res = await fetch(`/api/artists/${artistId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, budget: 0 })
      });
      if (res.ok) fetchSheets();
    } catch (e) { console.error(e); }
  };

  const deleteSheet = async (sheetId: string) => {
    if (!await customConfirm('¿Seguro que quieres eliminar esta hoja de pagos por completo?')) return;
    try {
      const res = await fetch(`/api/artists/${artistId}/payments/${sheetId}`, { method: 'DELETE' });
      if (res.ok) {
        if (activeSheetId === sheetId) setActiveSheetId(null);
        fetchSheets();
      }
    } catch (e) { console.error(e); }
  };

  if (isLoading) {
    return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>;
  }

  if (activeSheetId) {
    const sheet = sheets.find(s => s.id === activeSheetId);
    return <ActivePaymentSheet sheet={sheet} artistId={artistId} onBack={() => setActiveSheetId(null)} onRefresh={fetchSheets} />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-text-primary">Hojas de Pago</h3>
          <p className="text-sm text-text-secondary">Control de presupuestos, facturación y cobros.</p>
        </div>
        <Button onClick={createSheet}><Plus className="w-4 h-4 mr-2" /> Nueva Hoja</Button>
      </div>

      {sheets.length === 0 ? (
        <div className="glass rounded-xl p-12 text-center text-text-secondary border border-dashed border-border">
          <DollarSign className="w-12 h-12 mx-auto mb-4 opacity-50 text-accent" />
          <p>No tienes hojas de pago creadas.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sheets.map(s => {
            const totalReceived = (s.payments || []).filter((p:any) => p.status === 'paid').reduce((a:number, b:any) => a + Number(b.amount), 0);
            return (
              <div key={s.id} className="glass rounded-xl p-5 border border-border hover:border-accent/50 transition-all group relative">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-accent" />
                    <h4 className="font-bold text-lg text-text-primary">{s.name}</h4>
                  </div>
                  <button onClick={() => deleteSheet(s.id)} className="p-1.5 text-text-secondary hover:text-error rounded hover:bg-error/10 opacity-0 group-hover:opacity-100 transition-all">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="space-y-1 mb-6">
                  <div className="flex justify-between text-xs text-text-secondary">
                    <span>Presupuesto:</span>
                    <span className="font-medium text-text-primary">{s.budget}€</span>
                  </div>
                  <div className="flex justify-between text-xs text-text-secondary">
                    <span>Cobrado:</span>
                    <span className="font-medium text-success">{totalReceived}€</span>
                  </div>
                </div>

                <Button className="w-full" variant="secondary" onClick={() => setActiveSheetId(s.id)}>
                  Abrir Detalles
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ActivePaymentSheet({ sheet, artistId, onBack, onRefresh }: { sheet: any, artistId: string, onBack: () => void, onRefresh: () => void }) {
  const [budget, setBudget] = useState(sheet?.budget || 0);
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const payments = sheet?.payments || [];
  const totalReceived = payments.filter((p:any) => p.status === 'paid').reduce((acc:number, p:any) => acc + Number(p.amount), 0);
  const remainingToCollect = Math.max(0, budget - totalReceived);
  const progress = budget > 0 ? Math.min(100, Math.round((totalReceived / budget) * 100)) : 0;

  const updateSheet = async (updates: any) => {
    setIsSaving(true);
    try {
      await fetch(`/api/artists/${artistId}/payments/${sheet.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      onRefresh();
    } catch (e) { console.error(e); } finally { setIsSaving(false); setIsEditingBudget(false); }
  };

  const addPayment = async () => {
    const concept = await customPrompt('Concepto del pago:');
    if (!concept) return;
    const amountStr = await customPrompt('Cantidad (€):');
    if (!amountStr) return;
    const amount = Number(amountStr);
    if (isNaN(amount)) return;

    const newPayment = {
      id: Math.random().toString(36).substring(7),
      concept,
      amount,
      date: new Date().toISOString(),
      method: 'transfer',
      status: 'pending'
    };
    updateSheet({ payments: [...payments, newPayment] });
  };

  const updatePaymentStatus = (paymentId: string, newStatus: string) => {
    const updatedPayments = payments.map((p:any) => p.id === paymentId ? { ...p, status: newStatus } : p);
    updateSheet({ payments: updatedPayments });
  };

  const deletePayment = async (paymentId: string) => {
    if (!await customConfirm('Eliminar pago?')) return;
    updateSheet({ payments: payments.filter((p:any) => p.id !== paymentId) });
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-text-secondary hover:text-text-primary">
          Volver a Hojas
        </Button>
        <ChevronRight className="w-4 h-4 text-text-secondary" />
        <h2 className="font-bold text-text-primary text-xl">{sheet?.name}</h2>
      </div>

      <div className="glass rounded-xl border border-border p-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold">Resumen de Pagos</h3>
          <Button size="sm" onClick={addPayment}><Plus className="w-4 h-4 mr-2" /> Añadir Pago</Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-surface-elevated rounded-lg p-4 border border-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-text-secondary">Presupuesto Total</span>
              <button onClick={() => setIsEditingBudget(!isEditingBudget)} className="text-text-secondary hover:text-accent"><Edit2 className="w-3.5 h-3.5" /></button>
            </div>
            {isEditingBudget ? (
              <div className="flex items-center gap-2">
                <Input value={budget} onChange={e => setBudget(Number(e.target.value))} className="h-8 w-24" type="number" />
                <Button size="sm" onClick={() => updateSheet({ budget })} disabled={isSaving} className="h-8">OK</Button>
              </div>
            ) : (
              <div className="text-2xl font-bold">{budget}€</div>
            )}
          </div>

          <div className="bg-surface-elevated rounded-lg p-4 border border-border">
            <div className="flex items-center gap-2 mb-2"><CheckCircle2 className="w-4 h-4 text-success" /><span className="text-sm text-text-secondary">Cobrado</span></div>
            <div className="text-2xl font-bold text-success">{totalReceived}€</div>
          </div>

          <div className="bg-surface-elevated rounded-lg p-4 border border-border">
            <div className="flex items-center gap-2 mb-2"><Clock className="w-4 h-4 text-warning" /><span className="text-sm text-text-secondary">Falta por cobrar</span></div>
            <div className="text-2xl font-bold text-warning">{remainingToCollect}€</div>
          </div>
        </div>

        {budget > 0 && (
          <div className="mb-8">
            <div className="flex justify-between text-xs text-text-secondary mb-2"><span>Progreso de cobro</span><span>{progress}%</span></div>
            <div className="w-full h-2 bg-surface rounded-full overflow-hidden">
              <div className="h-full bg-success transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">Historial de Transacciones</h4>
          {payments.length === 0 ? (
            <p className="text-sm text-text-secondary italic">No hay transacciones registradas.</p>
          ) : (
            payments.map((p:any) => (
              <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface/30 hover:bg-surface/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${p.status === 'paid' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                    <DollarSign className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{p.concept}</div>
                    <div className="text-xs text-text-secondary">{new Date(p.date).toLocaleDateString()}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="font-bold text-lg">{p.amount}€</div>
                  <div className="flex items-center gap-2">
                    {p.status === 'pending' ? (
                      <Button size="sm" variant="outline" className="h-7 text-xs text-success border-success hover:bg-success/10" onClick={() => updatePaymentStatus(p.id, 'paid')}>Marcar Pagado</Button>
                    ) : (
                      <Button size="sm" variant="outline" className="h-7 text-xs text-warning border-warning hover:bg-warning/10" onClick={() => updatePaymentStatus(p.id, 'pending')}>Marcar Pendiente</Button>
                    )}
                    <button onClick={() => deletePayment(p.id)} className="text-text-secondary hover:text-error p-1 rounded"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
