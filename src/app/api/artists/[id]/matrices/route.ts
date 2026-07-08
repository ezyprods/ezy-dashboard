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
    
    let productionGrid = { columns: [], rows: [], mode: 'simple' };
    
    if (body.duplicateFromId) {
      const originalMatrix = data.matrices?.find((m: any) => m.id === body.duplicateFromId);
      if (originalMatrix && originalMatrix.productionGrid) {
        // Deep clone structure but reset statuses and clear linked files
        const clonedGrid = JSON.parse(JSON.stringify(originalMatrix.productionGrid));
        clonedGrid.rows = clonedGrid.rows.map((row: any) => {
           row.linkedFile = undefined; // clear file
           if (row.cells) {
             Object.keys(row.cells).forEach(colId => {
                row.cells[colId] = { status: 'todo' }; // clear status and notes
             });
           }
           return row;
        });
        productionGrid = clonedGrid;
      }
    }
    
    const newMatrix = {
      id: randomUUID(),
      name: body.name || 'Nueva Matriz',
      projectId: body.projectId || null,
      productionGrid: productionGrid,
      forceStatus: 'active',
      createdAt: new Date().toISOString(),
    };
    
    data.matrices = [...(data.matrices || []), newMatrix];
    await saveJsonFile('matrices.json', data, id);
    
    return NextResponse.json({ success: true, matrix: newMatrix });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to create matrix', details: error.message }, { status: 500 });
  }
}
