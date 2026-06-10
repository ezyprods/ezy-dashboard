import { NextResponse } from 'next/server';
import { findAndReadJsonFile, saveJsonFile } from '@/lib/drive';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; paymentId: string }> }) {
  try {
    const resolvedParams = await params;
    const { id, paymentId } = resolvedParams;
    const body = await request.json();

    const data = await findAndReadJsonFile<any>('artist_payments.json', id) || { sheets: [] };
    const idx = data.sheets?.findIndex((s: any) => s.id === paymentId);
    
    if (idx === -1 || idx === undefined) {
      return NextResponse.json({ error: 'Payment sheet not found' }, { status: 404 });
    }

    data.sheets[idx] = { ...data.sheets[idx], ...body };
    await saveJsonFile('artist_payments.json', data, id);

    return NextResponse.json({ success: true, sheet: data.sheets[idx] });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to update payment sheet', details: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; paymentId: string }> }) {
  try {
    const resolvedParams = await params;
    const { id, paymentId } = resolvedParams;
    const data = await findAndReadJsonFile<any>('artist_payments.json', id) || { sheets: [] };
    data.sheets = data.sheets.filter((s: any) => s.id !== paymentId);
    await saveJsonFile('artist_payments.json', data, id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to delete payment sheet', details: error.message }, { status: 500 });
  }
}
