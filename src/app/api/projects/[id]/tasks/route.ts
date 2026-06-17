import { NextResponse } from 'next/server';
import { findAndReadJsonFile, saveJsonFile, getCalendarAuthClient } from '@/lib/drive';
import { randomUUID } from 'crypto';
import { google } from 'googleapis';
import type { FlexBoardData, Task } from '@/types';

// Migrar del formato antiguo (Task[]) al nuevo (FlexBoardData)
function migrateOldFormat(data: any): FlexBoardData {
  if (data && data.groups && Array.isArray(data.groups)) {
    return data as FlexBoardData;
  }

  if (Array.isArray(data)) {
    const oldTasks = data as Task[];
    return {
      groups: [
        {
          id: randomUUID(),
          title: 'General',
          color: '#6c5ce7',
          collapsed: false,
          tasks: oldTasks.map(t => ({
            id: t.id || randomUUID(),
            title: t.title,
            status: t.status === 'completed' ? 'done' as const : 'todo' as const,
            createdAt: new Date().toISOString(),
          })),
        },
      ],
    };
  }

  return { groups: [] };
}

async function syncProductionGridToGoogleCalendar(
  projectId: string,
  projectTitle: string,
  newGrid: any,
  oldGrid: any
) {
  try {
    const auth = getCalendarAuthClient();
    const calendar = google.calendar({ version: 'v3', auth });
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

    // 1. Gather all cells from new grid
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

    // 2. Gather all cells from old grid
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

    // 3. Process new or updated cells
    for (const [key, { cell, rowName, colName }] of newCellsMap.entries()) {
      const oldCell = oldCellsMap.get(key);
      const isChanged = !oldCell || 
        oldCell.dueDate !== cell.dueDate || 
        oldCell.status !== cell.status || 
        oldCell.notes !== cell.notes ||
        oldCell.fileName !== cell.fileName;

      const summary = `[${projectTitle}] ${rowName} - ${colName}`;
      const description = `Fase: ${colName}\nProyecto: ${projectTitle}\nCanción/Fila: ${rowName}\nEstado: ${
        cell.status === 'done' 
          ? '✅ Hecho' 
          : cell.status === 'review' 
            ? '👀 Revisión' 
            : cell.status === 'in_progress' 
              ? '⚡ En progreso' 
              : '⭕ Pendiente'
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
              console.error(`Error patching calendar event ${cell.eventId}:`, err.message);
              // If event is not found, clear eventId so it will be recreated
              if (err.code === 404 || err.message?.includes('Not Found')) {
                delete cell.eventId;
              }
            }
          }
        } else {
          // Create new event
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
          } catch (err: any) {
            console.error('Error creating calendar event:', err.message);
          }
        }
      } else {
        // No dueDate but has eventId -> Delete event
        if (cell.eventId) {
          try {
            await calendar.events.delete({
              calendarId,
              eventId: cell.eventId,
            });
          } catch (err: any) {
            console.error(`Error deleting calendar event ${cell.eventId}:`, err.message);
          }
          delete cell.eventId;
        }
      }
    }

    // 4. Find deleted cells (present in old but not in new)
    for (const [key, oldCell] of oldCellsMap.entries()) {
      if (!newCellsMap.has(key) && oldCell.eventId) {
        try {
          await calendar.events.delete({
            calendarId,
            eventId: oldCell.eventId,
          });
        } catch (err: any) {
          console.error(`Error deleting orphaned calendar event ${oldCell.eventId}:`, err.message);
        }
      }
    }

  } catch (err: any) {
    console.error('Calendar matrix synchronization error:', err.message);
  }
}

// Leer tareas (con migración automática)
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    const raw = await findAndReadJsonFile<any>('tasks.json', id);
    const board = migrateOldFormat(raw);

    return NextResponse.json(board);
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to fetch tasks', details: error.message }, { status: 500 });
  }
}

// Guardar board completo (sync)
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;
    const body: FlexBoardData = await request.json();

    // Obtener título del proyecto para nombrar eventos
    let projectTitle = 'Proyecto';
    try {
      const config = await findAndReadJsonFile<any>('project_config.json', id);
      if (config?.title) {
        projectTitle = config.title;
      }
    } catch (e) {
      console.warn('Could not read project config for calendar sync', e);
    }

    // Obtener grid actual para comparar cambios
    let oldGrid: any = null;
    try {
      const raw = await findAndReadJsonFile<any>('tasks.json', id);
      if (raw?.productionGrid) {
        oldGrid = raw.productionGrid;
      }
    } catch (e) {
      // Ignorar si no existe
    }

    // Sincronizar matriz con Google Calendar si existe
    if (body.productionGrid) {
      await syncProductionGridToGoogleCalendar(id, projectTitle, body.productionGrid, oldGrid);
    }

    // Asegurar IDs
    const board: FlexBoardData = {
      groups: (body.groups || []).map(g => ({
        ...g,
        id: g.id || randomUUID(),
        tasks: (g.tasks || []).map(t => ({
          ...t,
          id: t.id || randomUUID(),
        })),
      })),
      productionGrid: body.productionGrid, // Preservar la matriz de producción (que ahora incluye eventId si es nuevo)
      paymentGrid: body.paymentGrid, // Preservar la matriz de pagos interconectada
    };

    await saveJsonFile('tasks.json', board, id);
    return NextResponse.json({ success: true, ...board });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to save tasks', details: error.message }, { status: 500 });
  }
}
