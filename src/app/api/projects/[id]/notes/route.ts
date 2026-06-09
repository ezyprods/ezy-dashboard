import { NextResponse } from 'next/server';
import { findAndReadJsonFile, saveJsonFile } from '@/lib/drive';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    // Use project's folder id
    const notes = await findAndReadJsonFile<any>('notes.json', id);
    return NextResponse.json({ notes: notes || { content: '' } });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to fetch notes', details: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;
    const body = await request.json();

    const newNotes = {
      content: body.content,
      updatedAt: new Date().toISOString(),
    };

    await saveJsonFile('notes.json', newNotes, id);
    return NextResponse.json({ success: true, notes: newNotes });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to save notes', details: error.message }, { status: 500 });
  }
}
