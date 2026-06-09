import { NextResponse } from 'next/server';
import { findAndReadJsonFile, saveJsonFile, getDriveService } from '@/lib/drive';
import { DRIVE_ROOT_FOLDER_ID } from '@/lib/constants';
import type { Payment } from '@/types';
import { randomUUID } from 'crypto';

export async function GET() {
  try {
    const payments = await findAndReadJsonFile<Payment[]>('payments_db.json', DRIVE_ROOT_FOLDER_ID);
    return NextResponse.json({ payments: payments || [] });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to fetch payments', details: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payments = (await findAndReadJsonFile<Payment[]>('payments_db.json', DRIVE_ROOT_FOLDER_ID)) || [];

    const newPayment: Payment = {
      id: randomUUID(),
      artistId: body.artistId,
      projectId: body.projectId,
      amount: Number(body.amount),
      concept: body.concept,
      date: body.date,
      status: body.status || 'pending',
      method: body.method || 'transfer',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    payments.push(newPayment);
    await saveJsonFile('payments_db.json', payments, DRIVE_ROOT_FOLDER_ID);

    return NextResponse.json({ payment: newPayment }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to create payment', details: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const payments = (await findAndReadJsonFile<Payment[]>('payments_db.json', DRIVE_ROOT_FOLDER_ID)) || [];

    const index = payments.findIndex(p => p.id === body.id);
    if (index === -1) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    payments[index] = {
      ...payments[index],
      ...body,
      updatedAt: new Date().toISOString(),
    };

    await saveJsonFile('payments_db.json', payments, DRIVE_ROOT_FOLDER_ID);

    return NextResponse.json({ payment: payments[index] });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to update payment', details: error.message }, { status: 500 });
  }
}
