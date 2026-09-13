import { NextResponse, after } from 'next/server';
import { findAndReadJsonFile, saveJsonFile } from '@/lib/drive';
import { syncProductionGridToGoogleCalendar } from '@/lib/calendarSync';

export const dynamic = 'force-dynamic';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; matrixId: string }> }) {
  try {
    const resolvedParams = await params;
    const { id, matrixId } = resolvedParams;
    const body = await request.json();

    const data = await findAndReadJsonFile<any>('matrices.json', id) || { matrices: [] };
    const matrixIndex = Array.isArray(data.matrices) ? data.matrices.findIndex((m: any) => m.id === matrixId) : -1;

    if (matrixIndex === -1) {
      return NextResponse.json({ error: 'Matrix not found' }, { status: 404 });
    }

    const oldGrid = data.matrices[matrixIndex].productionGrid;
    const updatedMatrix = {
      ...data.matrices[matrixIndex],
      ...body,
      id: matrixId, // Never allow the id to be overwritten
      productionGrid: body.productionGrid || oldGrid
    };

    if (body.forceStatus !== undefined) {
      updatedMatrix.forceStatus = body.forceStatus;
    }

    if (body.productionGrid) {
      const projectName = updatedMatrix.name || 'Matriz';
      await syncProductionGridToGoogleCalendar(projectName, body.productionGrid, oldGrid);
    }

    data.matrices[matrixIndex] = updatedMatrix;
    await saveJsonFile('matrices.json', data, id);

    return NextResponse.json({ success: true, matrix: updatedMatrix });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to update matrix', details: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; matrixId: string }> }) {
  try {
    const resolvedParams = await params;
    const { id, matrixId } = resolvedParams;
    const data = await findAndReadJsonFile<any>('matrices.json', id) || { matrices: [] };
    const matrices: any[] = Array.isArray(data.matrices) ? data.matrices : [];
    const removed = matrices.find((m: any) => m.id === matrixId);
    data.matrices = matrices.filter((m: any) => m.id !== matrixId);
    await saveJsonFile('matrices.json', data, id);

    // Remove (after responding) the Google Calendar events created for this matrix's due dates
    if (removed?.productionGrid) {
      after(() => syncProductionGridToGoogleCalendar(removed.name || 'Matriz', { rows: [], columns: [] }, removed.productionGrid));
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to delete matrix', details: error.message }, { status: 500 });
  }
}
