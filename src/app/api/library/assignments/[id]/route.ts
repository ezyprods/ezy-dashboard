export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { undoAssignment } from '@/lib/beatLibrary';
import { errorResponse } from '@/lib/libraryApi';

/** Undoes an assignment: the beat goes back to the library folder it came from. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { db, restoredTo } = await undoAssignment(id);
    return NextResponse.json({ restoredTo, sends: db.sends, allAssignments: db.assignments });
  } catch (error: any) {
    return errorResponse(error, 'No se pudo deshacer la asignación');
  }
}
