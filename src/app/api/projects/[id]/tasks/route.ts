import { NextResponse } from 'next/server';
import { findAndReadJsonFile, saveJsonFile } from '@/lib/drive';
import { randomUUID } from 'crypto';
import type { FlexBoardData, Task } from '@/types';

// Migrar del formato antiguo (Task[]) al nuevo (FlexBoardData)
function migrateOldFormat(data: any): FlexBoardData {
  // Si ya es el formato nuevo
  if (data && data.groups && Array.isArray(data.groups)) {
    return data as FlexBoardData;
  }

  // Si es un array plano (formato antiguo)
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

  // Si no hay datos, devolver estructura vacía
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

// Guardar board completo (sync)
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;
    const body: FlexBoardData = await request.json();

    // Asegurar IDs
    const board: FlexBoardData = {
      groups: body.groups.map(g => ({
        ...g,
        id: g.id || randomUUID(),
        tasks: g.tasks.map(t => ({
          ...t,
          id: t.id || randomUUID(),
        })),
      })),
    };

    await saveJsonFile('tasks.json', board, id);
    return NextResponse.json({ success: true, ...board });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to save tasks', details: error.message }, { status: 500 });
  }
}
