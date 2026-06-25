'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/Button";
import { Plus, Search, DollarSign, ArrowUpRight, ArrowDownRight, CheckCircle2, Clock, Folder, Banknote, ArrowRightLeft, Smartphone, CreditCard } from "lucide-react";
import { usePayments } from "@/lib/hooks/usePayments";
import { useArtists } from "@/lib/hooks/useArtists";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_CONFIG } from "@/lib/constants";
import { getPaymentMethodIcon } from "@/lib/utils";
import { NewPaymentModal } from "@/components/payments/NewPaymentModal";

export default function PaymentsPage() {
  const { payments, updatePaymentStatus, isLoading } = usePayments();
  const { activeArtists } = useArtists();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const totalIngresos = payments.filter(p => p.status === 'paid').reduce((acc, p) => acc + p.amount, 0);
  const totalPendiente = payments.filter(p => p.status === 'pending').reduce((acc, p) => acc + p.amount, 0);

  const getArtistName = (id: string) => {
    return activeArtists.find(a => a.id === id)?.name || 'Artista desconocido';
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <NewPaymentModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />

      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Pagos</h1>
          <p className="text-text-secondary mt-1">Controla tus ingresos y cobros pendientes.</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus className="w-4 h-4 mr-2" /> Registrar Pago
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6">
        <div className="glass rounded-xl p-6 border border-border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-text-secondary">Ingresos Totales</h3>
            <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-success" />
            </div>
          </div>
          <p className="text-xl md:text-3xl font-bold text-text-primary">{totalIngresos.toFixed(2)}€</p>
          <div className="flex items-center gap-1 mt-2 text-sm text-success">
            <ArrowUpRight className="w-4 h-4" /> <span>Recibido</span>
          </div>
        </div>

        <div className="glass rounded-xl p-6 border border-border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-text-secondary">Pendiente de Cobro</h3>
            <div className="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-warning" />
            </div>
          </div>
          <p className="text-xl md:text-3xl font-bold text-text-primary">{totalPendiente.toFixed(2)}€</p>
          <div className="flex items-center gap-1 mt-2 text-sm text-warning">
            <ArrowDownRight className="w-4 h-4" /> <span>Por recibir</span>
          </div>
        </div>
      </div>

      {/* Table — Desktop only */}
      <div className="glass rounded-xl border border-border overflow-hidden hidden md:block">
        <div className="p-4 border-b border-border/50 flex justify-between items-center bg-surface/50">
          <h3 className="font-medium text-lg">Historial de Pagos</h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border/50 text-text-secondary text-sm">
                <th className="p-4 font-medium">Fecha</th>
                <th className="p-4 font-medium">Artista</th>
                <th className="p-4 font-medium">Concepto / Proyecto</th>
                <th className="p-4 font-medium">Cantidad</th>
                <th className="p-4 font-medium">Estado</th>
                <th className="p-4 font-medium text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-text-secondary">
                    No hay pagos registrados. Registra tu primer cobro.
                  </td>
                </tr>
              ) : (
                payments.map(payment => {
                  const status = PAYMENT_STATUS_CONFIG[payment.status];
                  return (
                    <tr key={payment.id} className="border-b border-border/20 hover:bg-surface/30 transition-colors">
                      <td className="p-4 text-sm text-text-secondary">
                        {new Date(payment.date).toLocaleDateString()}
                      </td>
                      <td className="p-4 font-medium">
                        {getArtistName(payment.artistId)}
                      </td>
                      <td className="p-4 text-sm">
                        {payment.concept}
                        {payment.projectId && <div className="text-xs text-accent mt-0.5 flex items-center gap-1"><Folder className="w-3 h-3"/> Vinculado a Proyecto</div>}
                        <div className="text-xs text-text-secondary mt-1 flex items-center gap-1">
                          {payment.method === 'cash' ? <Banknote className="w-3 h-3" /> :
                           payment.method === 'transfer' ? <ArrowRightLeft className="w-3 h-3" /> :
                           payment.method === 'bizum' ? <Smartphone className="w-3 h-3" /> :
                           <CreditCard className="w-3 h-3" />}
                          {PAYMENT_METHOD_LABELS[payment.method]}
                        </div>
                      </td>
                      <td className="p-4 font-bold">
                        {payment.amount.toFixed(2)}€
                      </td>
                      <td className="p-4">
                        <span className="px-2.5 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: status.bgColor, color: status.color }}>
                          {status.label}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        {payment.status !== 'paid' && (
                          <button
                            onClick={() => updatePaymentStatus(payment.id, 'paid')}
                            className="text-xs text-success hover:bg-success/10 px-3 py-1.5 rounded-lg transition-colors font-medium border border-success/20"
                          >
                            Marcar Pagado
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Cards — visible only on mobile */}
      <div className="md:hidden space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg">Historial de Pagos</h3>
          <span className="text-xs text-text-secondary">{payments.length} registros</span>
        </div>
        {payments.length === 0 ? (
          <div className="glass rounded-2xl p-10 text-center border border-dashed border-border">
            <DollarSign className="w-10 h-10 text-text-secondary mx-auto mb-3 opacity-40" />
            <p className="font-medium text-text-primary">Sin pagos registrados</p>
            <p className="text-sm text-text-secondary mt-1">Registra tu primer cobro</p>
            <Button onClick={() => setIsModalOpen(true)} className="mt-4">
              <Plus className="w-4 h-4 mr-2" /> Registrar Pago
            </Button>
          </div>
        ) : (
          payments.map(payment => {
            const status = PAYMENT_STATUS_CONFIG[payment.status];
            return (
              <div key={payment.id} className="glass rounded-2xl border border-border p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-text-primary truncate">{getArtistName(payment.artistId)}</p>
                    <p className="text-sm text-text-secondary truncate mt-0.5">{payment.concept}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-lg text-text-primary">{payment.amount.toFixed(2)}€</p>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: status.bgColor, color: status.color }}>
                      {status.label}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-text-secondary border-t border-border/50 pt-2">
                  <div className="flex items-center gap-1.5">
                    {payment.method === 'cash' ? <Banknote className="w-3.5 h-3.5" /> :
                     payment.method === 'transfer' ? <ArrowRightLeft className="w-3.5 h-3.5" /> :
                     payment.method === 'bizum' ? <Smartphone className="w-3.5 h-3.5" /> :
                     <CreditCard className="w-3.5 h-3.5" />}
                    {PAYMENT_METHOD_LABELS[payment.method]}
                    <span className="text-border mx-1">·</span>
                    {new Date(payment.date).toLocaleDateString()}
                  </div>
                  {payment.status !== 'paid' && (
                    <button
                      onClick={() => updatePaymentStatus(payment.id, 'paid')}
                      className="text-xs text-success font-semibold px-3 py-1.5 rounded-lg bg-success/10 border border-success/20 min-h-[36px]"
                    >
                      ✓ Pagado
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
