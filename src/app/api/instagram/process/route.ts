import { NextResponse } from 'next/server';
import { processQueue } from '@/lib/instagram/publisher';

import { requireStudio } from '@/lib/routeAuth';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// La página lo llama mientras está abierta y hay algo en curso o pendiente de su hora: así lo
// que toca sale aunque el activador aún no haya pasado.
export async function POST() {
  const denied = await requireStudio();
  if (denied) return denied;
  try {
    return NextResponse.json(await processQueue(40000));
  } catch (err) {
    console.error('[api/instagram/process]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
