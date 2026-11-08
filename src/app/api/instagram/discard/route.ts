import { NextResponse } from 'next/server';
import { deleteMediaFiles } from '@/lib/instagram/store';

import { requireStudio } from '@/lib/routeAuth';
export const dynamic = 'force-dynamic';

// Borra lo que el formulario subió y no llegó a usarse (al cerrar sin publicar o quitar un archivo).
// Solo toca archivos de la carpeta 00_INSTAGRAM/Medios: nunca el resto de tu Drive.
export async function POST(request: Request) {
  const denied = await requireStudio();
  if (denied) return denied;
  try {
    const { fileIds } = await request.json();
    const ids = (Array.isArray(fileIds) ? fileIds : []).filter((id: unknown) => typeof id === 'string').slice(0, 30) as string[];
    return NextResponse.json({ removed: await deleteMediaFiles(ids) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
