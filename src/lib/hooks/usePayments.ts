'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Payment } from '@/types';

export function usePayments() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPayments = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/payments');
      if (!res.ok) throw new Error('Failed to fetch payments');
      const data = await res.json();
      setPayments(data.payments || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const createPayment = async (data: Partial<Payment>) => {
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create payment');
      const newPayment = await res.json();
      setPayments(prev => [...prev, newPayment.payment]);
      return { success: true, payment: newPayment.payment };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const updatePaymentStatus = async (id: string, status: Payment['status']) => {
    try {
      const res = await fetch('/api/payments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) throw new Error('Failed to update payment');
      const updated = await res.json();
      setPayments(prev => prev.map(p => p.id === id ? updated.payment : p));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  return {
    payments,
    isLoading,
    error,
    createPayment,
    updatePaymentStatus,
    fetchPayments
  };
}
