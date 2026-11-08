import { NextResponse } from 'next/server';
import { secretMatches } from '@/lib/studioAuth';
import { getHubFeed } from '@/lib/hub/feed';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/hub/v1/pendientes — read-only feed for the personal hub (common contract v1).
 *
 * Auth: `Authorization: Bearer <HUB_TOKEN>`, compared in constant time. Without HUB_TOKEN in the
 * environment the route is closed (503); a missing or wrong key gets 401. It is listed as public
 * in src/proxy.ts because it checks its own key here.
 *
 * Drive is read at most once every 5 minutes per server instance (lib/hub/feed.ts); the response
 * itself is never cached (Cache-Control: no-store).
 */

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  const expected = process.env.HUB_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503, headers: NO_STORE });
  }
  const header = request.headers.get('authorization') || '';
  const presented = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!secretMatches(presented, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: { ...NO_STORE, 'WWW-Authenticate': 'Bearer' } });
  }

  try {
    return NextResponse.json(await getHubFeed(), { headers: NO_STORE });
  } catch (err) {
    console.error('[api/hub/v1/pendientes]', err);
    return NextResponse.json({ error: 'unavailable' }, { status: 502, headers: NO_STORE });
  }
}
