'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/Button";
import { Plus, Search, DollarSign, ArrowUpRight, ArrowDownRight, CheckCircle2, Clock } from "lucide-react";
import { usePayments } from "@/lib/hooks/usePayments";
import { useArtists } from "@/lib/hooks/useArtists";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_CONFIG } from "@/lib/constants";
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass rounded-xl p-6 border border-border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-text-secondary">Ingresos Totales</h3>
            <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-success" />
            </div>
          </div>
          <p className="text-3xl font-bold text-text-primary">{totalIngresos.toFixed(2)}€</p>
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
          <p className="text-3xl font-bold text-text-primary">{totalPendiente.toFixed(2)}€</p>
          <div className="flex items-center gap-1 mt-2 text-sm text-warning">
            <ArrowDownRight className="w-4 h-4" /> <span>Por recibir</span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="glass rounded-xl border border-border overflow-hidden">
        <div className="p-4 border-b border-border/50 flex justify-between items-center bg-surface/50">
          <h3 className="font-medium text-lg">Historial de Pagos</h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border/50 text-text-secondary text-sm">
                <th className="p-4 font-medium">Fecha</th>
                <th className="p-4 font-medium">Artista</th>
                <th className="p-4 font-medium">Concepto</th>
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
                        <div className="text-xs text-text-secondary mt-0.5">{PAYMENT_METHOD_LABELS[payment.method]}</div>
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
                        {payment.status === 'pending' && (
                          <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => updatePaymentStatus(payment.id, 'paid')}>
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Marcar Pagado
                          </Button>
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
    </div>
  );
}
