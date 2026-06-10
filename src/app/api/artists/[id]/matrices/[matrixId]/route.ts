import { NextResponse } from 'next/server';
import { findAndReadJsonFile, saveJsonFile, getAuthClient } from '@/lib/drive';
import { google } from 'googleapis';

async function syncProductionGridToGoogleCalendar(
  artistId: string,
  projectName: string,
  newGrid: any,
  oldGrid: any
) {
  try {
    const auth = getAuthClient();
    const calendar = google.calendar({ version: 'v3', auth });
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

    const newCellsMap = new Map<string, { cell: any; rowName: string; colName: string }>();
    if (newGrid && Array.isArray(newGrid.rows) && Array.isArray(newGrid.columns)) {
      for (const row of newGrid.rows) {
        for (const col of newGrid.columns) {
          const cell = row.cells?.[col.id];
          if (cell) {
            newCellsMap.set(`${row.id}-${col.id}`, { cell, rowName: row.name, colName: col.name });
          }
        }
      }
    }

    const oldCellsMap = new Map<string, any>();
    if (oldGrid && Array.isArray(oldGrid.rows) && Array.isArray(oldGrid.columns)) {
      for (const row of oldGrid.rows) {
        for (const col of oldGrid.columns) {
          const cell = row.cells?.[col.id];
          if (cell) {
            oldCellsMap.set(`${row.id}-${col.id}`, cell);
          }
        }
      }
    }

    for (const [key, { cell, rowName, colName }] of newCellsMap.entries()) {
      const oldCell = oldCellsMap.get(key);
      const isChanged = !oldCell || 
        oldCell.dueDate !== cell.dueDate || 
        oldCell.status !== cell.status || 
        oldCell.notes !== cell.notes ||
        oldCell.fileName !== cell.fileName;

      const summary = `[${projectName}] ${rowName} - ${colName}`;
      const description = `Fase: ${colName}\nProyecto: ${projectName}\nCanción/Fila: ${rowName}\nEstado: ${
        cell.status === 'done' ? '✅ Hecho' : cell.status === 'review' ? '👀 Revisión' : cell.status === 'in_progress' ? '⚡ En progreso' : '⭕ Pendiente'
      }\nNotas: ${cell.notes || 'Ninguna'}${cell.fileName ? `\nArchivo Vinculado: ${cell.fileName}` : ''}`;

      if (cell.dueDate) {
        if (cell.eventId) {
          if (isChanged) {
            try {
              const startDateTime = `${cell.dueDate}T10:00:00`;
              const endDateTime = `${cell.dueDate}T11:00:00`;
              await calendar.events.patch({
                calendarId,
                eventId: cell.eventId,
                requestBody: {
                  summary,
                  description,
                  start: { dateTime: startDateTime, timeZone: 'Europe/Madrid' },
                  end: { dateTime: endDateTime, timeZone: 'Europe/Madrid' },
                }
              });
            } catch (err: any) {
              if (err.code === 404 || err.message?.includes('Not Found')) {
                delete cell.eventId;
              }
            }
          }
        } else {
          try {
            const startDateTime = `${cell.dueDate}T10:00:00`;
            const endDateTime = `${cell.dueDate}T11:00:00`;
            const response = await calendar.events.insert({
              calendarId,
              requestBody: {
                summary,
                description,
                start: { dateTime: startDateTime, timeZone: 'Europe/Madrid' },
                end: { dateTime: endDateTime, timeZone: 'Europe/Madrid' },
              }
            });
            if (response.data.id) {
              cell.eventId = response.data.id;
            }
          } catch (err: any) {}
        }
      } else {
        if (cell.eventId) {
          try {
            await calendar.events.delete({ calendarId, eventId: cell.eventId });
          } catch (err: any) {}
          delete cell.eventId;
        }
      }
    }

    for (const [key, oldCell] of oldCellsMap.entries()) {
      if (!newCellsMap.has(key) && oldCell.eventId) {
        try {
          await calendar.events.delete({ calendarId, eventId: oldCell.eventId });
        } catch (err: any) {}
      }
    }
  } catch (err: any) {
    console.error('Calendar matrix sync error:', err.message);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; matrixId: string }> }) {
  try {
    const resolvedParams = await params;
    const { id, matrixId } = resolvedParams;
    const body = await request.json();

    const data = await findAndReadJsonFile<any>('matrices.json', id) || { matrices: [] };
    const matrixIndex = data.matrices?.findIndex((m: any) => m.id === matrixId);
    
    if (matrixIndex === -1 || matrixIndex === undefined) {
      return NextResponse.json({ error: 'Matrix not found' }, { status: 404 });
    }

    const oldGrid = data.matrices[matrixIndex].productionGrid;
    const updatedMatrix = {
      ...data.matrices[matrixIndex],
      ...body,
      productionGrid: body.productionGrid || oldGrid
    };

    if (body.productionGrid) {
      let projectName = updatedMatrix.name || 'Matriz';
      await syncProductionGridToGoogleCalendar(id, projectName, body.productionGrid, oldGrid);
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
    data.matrices = data.matrices.filter((m: any) => m.id !== matrixId);
    await saveJsonFile('matrices.json', data, id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to delete matrix', details: error.message }, { status: 500 });
  }
}
