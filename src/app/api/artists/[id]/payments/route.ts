import { NextResponse } from 'next/server';
import { findAndReadJsonFile, saveJsonFile } from '@/lib/drive';
import { randomUUID } from 'crypto';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;
    const data = await findAndReadJsonFile<any>('artist_payments.json', id);
    return NextResponse.json({ sheets: data?.sheets || [] });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to fetch payments', details: error.message }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;
    const body = await request.json();
    
    const data = await findAndReadJsonFile<any>('artist_payments.json', id) || { sheets: [] };
    const newSheet = {
      id: randomUUID(),
      name: body.name || 'Nueva Hoja de Pagos',
      budget: body.budget || 0,
      payments: [],
      createdAt: new Date().toISOString(),
    };
    
    data.sheets = [...(data.sheets || []), newSheet];
    await saveJsonFile('artist_payments.json', data, id);
    
    return NextResponse.json({ success: true, sheet: newSheet });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to create payment sheet', details: error.message }, { status: 500 });
  }
}
