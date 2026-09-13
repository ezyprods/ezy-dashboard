import { NextResponse } from 'next/server';
import { findAndReadJsonFile, saveJsonFile } from '@/lib/drive';
import { randomUUID } from 'crypto';
import type { FlexBoardData, Task } from '@/types';
import { syncProductionGridToGoogleCalendar } from '@/lib/calendarSync';

export const dynamic = 'force-dynamic';

type StoredBoard = FlexBoardData & { workSessions?: any[] };

// Migrar del formato antiguo (Task[]) al nuevo (FlexBoardData), conservando el resto de campos
function migrateOldFormat(data: any): StoredBoard {
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

  if (data && typeof data === 'object') {
    return {
      ...data,
      groups: Array.isArray(data.groups) ? data.groups : [],
    } as StoredBoard;
  }

  return { groups: [] };
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

// Guardar board (sync). Solo se sobrescriben los campos presentes en el body:
// así guardar únicamente las sesiones de trabajo no borra las tareas ni las matrices.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;
    const body: Partial<StoredBoard> = await request.json();

    let existing: StoredBoard = { groups: [] };
    try {
      existing = migrateOldFormat(await findAndReadJsonFile<any>('tasks.json', id));
    } catch (e) {
      // Ignorar si no existe
    }

    const board: StoredBoard = { ...existing };

    if (body.groups !== undefined) {
      board.groups = (body.groups || []).map(g => ({
        ...g,
        id: g.id || randomUUID(),
        tasks: (g.tasks || []).map(t => ({
          ...t,
          id: t.id || randomUUID(),
        })),
      }));
    }

    if (body.productionGrid !== undefined) {
      if (body.productionGrid) {
        // Obtener título del proyecto para nombrar eventos
        let projectTitle = 'Proyecto';
        try {
          const config = await findAndReadJsonFile<any>('project_config.json', id);
          if (config?.title) projectTitle = config.title;
        } catch (e) {
          console.warn('Could not read project config for calendar sync', e);
        }
        // Sincronizar matriz con Google Calendar (añade/actualiza eventId en las celdas)
        await syncProductionGridToGoogleCalendar(projectTitle, body.productionGrid, existing.productionGrid);
      }
      board.productionGrid = body.productionGrid;
    }

    if (body.paymentGrid !== undefined) {
      board.paymentGrid = body.paymentGrid;
    }

    if (body.workSessions !== undefined) {
      board.workSessions = Array.isArray(body.workSessions) ? body.workSessions : [];
    }

    await saveJsonFile('tasks.json', board, id);
    return NextResponse.json({ success: true, ...board });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to save tasks', details: error.message }, { status: 500 });
  }
}
