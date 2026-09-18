export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getLibraryRootId, LibraryError, updateLibraryDb } from '@/lib/beatLibrary';
import { errorResponse, idList, text } from '@/lib/libraryApi';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const rootId = await getLibraryRootId();
    const now = new Date().toISOString();

    const { db, result } = await updateLibraryDb(rootId, db => {
      const send = db.sends.find(s => s.id === id);
      if (!send) throw new LibraryError('Ese envío ya no existe', 404);

      const title = text(body.title, 120);
      if (title) send.title = title;
      if (typeof body.note === 'string') send.note = text(body.note, 1000) || undefined;
      if (typeof body.allowDownload === 'boolean') send.allowDownload = body.allowDownload;
      if (body.artistIds !== undefined) {
        const artistIds = idList(body.artistIds, 300);
        if (!artistIds?.length) throw new LibraryError('Un envío necesita al menos un artista');
        if (artistIds.some(a => !send.artistIds.includes(a))) send.updatedAt = now;
        send.artistIds = artistIds;
      }
      if (body.itemIds !== undefined) {
        const itemIds = idList(body.itemIds);
        if (!itemIds) throw new LibraryError('Lista de elementos no válida');
        if (itemIds.some(i => !send.itemIds.includes(i))) send.updatedAt = now;
        send.itemIds = itemIds;
      }
      return send;
    });

    return NextResponse.json({ send: result, sends: db.sends });
  } catch (error: any) {
    return errorResponse(error, 'No se pudo actualizar el envío');
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const rootId = await getLibraryRootId();
    const { db } = await updateLibraryDb(rootId, db => {
      db.sends = db.sends.filter(s => s.id !== id);
    });
    return NextResponse.json({ sends: db.sends });
  } catch (error: any) {
    return errorResponse(error, 'No se pudo eliminar el envío');
  }
}
