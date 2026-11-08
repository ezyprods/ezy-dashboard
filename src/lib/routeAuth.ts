import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  PORTAL_TOOLS_COOKIE,
  STUDIO_COOKIE,
  portalSessionCookieName,
  verifyPortalSessionToken,
  verifyPortalToolsToken,
  verifyStudioToken,
} from '@/lib/studioAuth';
import type { PortalToolId } from '@/types/portal';

/**
 * Second line of defence behind src/proxy.ts: every private route handler starts with
 *
 *   const denied = await requireStudio();
 *   if (denied) return denied;
 *
 * so a mistake in the proxy matcher (or a route moved outside /api) can never expose data.
 * tests/routes-auth.test.ts fails when a private route forgets it.
 */

const unauthorized = () =>
  NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });

export async function hasStudioAccess(): Promise<boolean> {
  const store = await cookies();
  return verifyStudioToken(store.get(STUDIO_COOKIE)?.value);
}

/** Only the producer (unlocked studio). */
export async function requireStudio(): Promise<NextResponse | null> {
  return (await hasStudioAccess()) ? null : unauthorized();
}

/** The producer, or an artist portal that was granted this tool (see PORTAL_TOOL_ROUTES in proxy.ts). */
export async function requireStudioOrPortalTool(tool: PortalToolId): Promise<NextResponse | null> {
  const store = await cookies();
  if (verifyStudioToken(store.get(STUDIO_COOKIE)?.value)) return null;
  if (verifyPortalToolsToken(store.get(PORTAL_TOOLS_COOKIE)?.value, tool)) return null;
  return unauthorized();
}

/** The producer, or the artist whose portal was opened in this browser (portal session cookie). */
export async function requireStudioOrPortalSession(artistId: string): Promise<NextResponse | null> {
  const store = await cookies();
  if (verifyStudioToken(store.get(STUDIO_COOKIE)?.value)) return null;
  if (verifyPortalSessionToken(store.get(portalSessionCookieName(artistId))?.value, artistId)) return null;
  return NextResponse.json(
    { error: 'Vuelve a abrir el portal para continuar' },
    { status: 401, headers: { 'Cache-Control': 'no-store' } },
  );
}
