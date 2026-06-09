import { NextResponse } from 'next/server';
import { findAndReadJsonFile, saveJsonFile } from '@/lib/drive';
import { randomUUID } from 'crypto';
import type { Task } from '@/types';

// Leer tareas
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    const tasks = await findAndReadJsonFile<Task[]>('tasks.json', id);
    return NextResponse.json({ tasks: tasks || [] });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to fetch tasks', details: error.message }, { status: 500 });
  }
}

// Guardar todas las tareas (sync)
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;
    const body: { tasks: Task[] } = await request.json();

    const newTasks = body.tasks.map(t => ({
      ...t,
      id: t.id || randomUUID(),
    }));

    await saveJsonFile('tasks.json', newTasks, id);
    return NextResponse.json({ success: true, tasks: newTasks });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to save tasks', details: error.message }, { status: 500 });
  }
}
