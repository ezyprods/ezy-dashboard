'use client';

import { useAppData } from '@/lib/contexts/AppDataContext';
import type { Payment } from '@/types';

export function usePayments() {
  const appData = useAppData();

  return {
    payments: appData.payments,
    isLoading: appData.paymentsLoading,
    error: appData.paymentsError,
    fetchPayments: appData.fetchPayments,
    createPayment: appData.createPayment,
    updatePaymentStatus: appData.updatePaymentStatus,
  };
}
