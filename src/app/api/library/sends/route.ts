export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getLibraryRootId, LibraryError, newId, updateLibraryDb } from '@/lib/beatLibrary';
import { errorResponse, idList, text } from '@/lib/libraryApi';
import type { BeatSend } from '@/types';

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x));

/**
 * Creates a send, or adds artists/items to an existing one.
 * A send with exactly the same items is reused instead of creating a duplicate.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const itemIds = idList(body.itemIds);
    const artistIds = idList(body.artistIds, 300);
    const mergeIntoId = typeof body.mergeIntoId === 'string' ? body.mergeIntoId : null;
    if (!itemIds?.length && !mergeIntoId) throw new LibraryError('Elige al menos un beat o carpeta');
    if (!artistIds?.length) throw new LibraryError('Elige al menos un artista');

    const rootId = await getLibraryRootId();
    const now = new Date().toISOString();
    const { db, result } = await updateLibraryDb(rootId, db => {
      const target = mergeIntoId
        ? db.sends.find(s => s.id === mergeIntoId)
        : db.sends.find(s => sameSet(s.itemIds, itemIds || []));
      if (mergeIntoId && !target) throw new LibraryError('Ese envío ya no existe', 404);

      if (target) {
        const newArtists = artistIds.filter(id => !target.artistIds.includes(id));
        const newItems = (itemIds || []).filter(id => !target.itemIds.includes(id));
        target.artistIds = [...target.artistIds, ...newArtists];
        target.itemIds = [...target.itemIds, ...newItems];
        const note = text(body.note, 1000);
        if (note) target.note = note;
        if (typeof body.allowDownload === 'boolean') target.allowDownload = body.allowDownload;
        if (newArtists.length || newItems.length) target.updatedAt = now;
        return { send: target, merged: true, newArtistIds: newArtists };
      }

      const send: BeatSend = {
        id: newId('snd'),
        title: text(body.title, 120) || 'Envío de beats',
        note: text(body.note, 1000) || undefined,
        itemIds: itemIds || [],
        artistIds,
        allowDownload: body.allowDownload !== false,
        createdAt: now,
        updatedAt: now,
      };
      db.sends = [send, ...db.sends];
      return { send, merged: false, newArtistIds: artistIds };
    });

    return NextResponse.json({ ...result, sends: db.sends });
  } catch (error: any) {
    return errorResponse(error, 'No se pudo guardar el envío');
  }
}
