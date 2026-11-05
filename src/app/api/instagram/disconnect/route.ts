import { NextResponse } from 'next/server';
import { saveConnection } from '@/lib/instagram/store';

export const dynamic = 'force-dynamic';

// Borra la conexión guardada. Las publicaciones programadas se quedan esperando hasta reconectar.
export async function POST() {
  try {
    await saveConnection(null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
