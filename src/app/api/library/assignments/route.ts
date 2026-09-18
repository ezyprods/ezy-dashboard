export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { assignToArtist, LibraryError } from '@/lib/beatLibrary';
import { errorResponse, idList } from '@/lib/libraryApi';

/** Moves beats (files or folders) from the library into `<artist>/Beats`. */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const itemIds = idList(body.itemIds, 200);
    const artistId = typeof body.artistId === 'string' && /^[\w-]{5,200}$/.test(body.artistId) ? body.artistId : null;
    if (!itemIds?.length) throw new LibraryError('Elige qué quieres asignar');
    if (!artistId) throw new LibraryError('Elige un artista');

    const { assignments, failed, db } = await assignToArtist(itemIds, artistId);
    return NextResponse.json({ assignments, failed, sends: db.sends, allAssignments: db.assignments });
  } catch (error: any) {
    return errorResponse(error, 'No se pudo asignar el beat');
  }
}
