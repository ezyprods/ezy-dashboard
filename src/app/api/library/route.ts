export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getLibraryRootId, LIBRARY_DISPLAY_NAME, readLibraryDb } from '@/lib/beatLibrary';

export async function GET() {
  try {
    const rootId = await getLibraryRootId();
    const db = await readLibraryDb(rootId);
    return NextResponse.json({ rootId, rootName: LIBRARY_DISPLAY_NAME, ...db });
  } catch (error: any) {
    console.error('API /library GET error:', error);
    return NextResponse.json({ error: 'No se pudo cargar la biblioteca', details: error.message }, { status: 500 });
  }
}
