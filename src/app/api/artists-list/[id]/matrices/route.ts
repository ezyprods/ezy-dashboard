import { NextResponse } from 'next/server';
import { findAndReadJsonFile, saveJsonFile } from '@/lib/drive';
import { randomUUID } from 'crypto';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;
    const data = await findAndReadJsonFile<any>('matrices.json', id);
    return NextResponse.json({ matrices: data?.matrices || [] });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to fetch matrices', details: error.message }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;
    const body = await request.json();
    
    const data = await findAndReadJsonFile<any>('matrices.json', id) || { matrices: [] };
    const newMatrix = {
      id: randomUUID(),
      name: body.name || 'Nueva Matriz',
      projectId: body.projectId || null,
      productionGrid: { columns: [], rows: [], mode: 'simple' },
      createdAt: new Date().toISOString(),
    };
    
    data.matrices = [...(data.matrices || []), newMatrix];
    await saveJsonFile('matrices.json', data, id);
    
    return NextResponse.json({ success: true, matrix: newMatrix });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to create matrix', details: error.message }, { status: 500 });
  }
}
