export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { NextResponse } from 'next/server';
import { findAndReadJsonFile, saveJsonFile } from '@/lib/drive';
import type { PersonalTasksData } from '@/types';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await findAndReadJsonFile<PersonalTasksData>('personal_tasks.json', id);
    return NextResponse.json(data || { tasks: [], workSessions: [] });
  } catch (error: any) {
    console.error('API /personal-projects/[id]/tasks GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tasks', details: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body: Partial<PersonalTasksData> = await request.json();

    const existing = (await findAndReadJsonFile<PersonalTasksData>('personal_tasks.json', id)) || {
      tasks: [],
      workSessions: [],
    };

    const updated: PersonalTasksData = {
      tasks: body.tasks !== undefined ? body.tasks : existing.tasks,
      workSessions: body.workSessions !== undefined ? body.workSessions : existing.workSessions,
    };

    await saveJsonFile('personal_tasks.json', updated, id);

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('API /personal-projects/[id]/tasks PUT error:', error);
    return NextResponse.json(
      { error: 'Failed to update tasks', details: error.message },
      { status: 500 }
    );
  }
}
