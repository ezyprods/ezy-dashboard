export type PaymentMethod = 'cash' | 'transfer' | 'bizum' | 'other';
export type PaymentStatus = 'pending' | 'partial' | 'paid';

export interface PaymentEntry {
  id: string;
  amount: number;
  date: string;
  method: PaymentMethod;
  note?: string;
}

export interface PaymentData {
  totalAgreed: number;
  entries: PaymentEntry[];
}

export interface PaymentSummary {
  artistId: string;
  artistName: string;
  projectId: string;
  projectTitle: string;
  totalAgreed: number;
  totalReceived: number;
  remaining: number;
  status: PaymentStatus;
  lastPaymentDate?: string;
}
