import { NextResponse } from 'next/server';
import { processQueue } from '@/lib/instagram/publisher';
import { isCronAuthorized } from '@/lib/instagram/secrets';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Activador de la cola de Instagram. Lo llaman:
 *  · el Apps Script de la cuenta de Google de EZY cada 5 minutos (?key=CRON_SECRET)
 *  · el cron diario de Vercel, como respaldo (Authorization: Bearer CRON_SECRET)
 * Si no hay nada que hacer tarda menos de un segundo.
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const result = await processQueue(48000);
    return NextResponse.json({ ok: true, at: new Date().toISOString(), ...result });
  } catch (err) {
    console.error('[api/cron/instagram]', err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
