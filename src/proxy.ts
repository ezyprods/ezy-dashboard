import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { PORTAL_TOOLS_COOKIE, STUDIO_COOKIE, verifyPortalToolsToken, verifyStudioToken } from '@/lib/studioAuth';
import type { PortalToolId } from '@/types/portal';

/**
 * Server-side gate for the API: every /api route needs the studio cookie (set by /api/studio/unlock)
 * unless it is listed below. PasswordGuard only hides the dashboard UI; this is what protects the data.
 *
 * Proxy runs on the Node.js runtime (the default since Next 16), so studioAuth's node:crypto works here.
 * It must live next to `app` (src/), a proxy.ts at the repo root is never loaded.
 */

// Open to everyone: the studio lock itself, better-auth / Google OAuth, the artist portal
// and Vercel Cron (the cron route checks CRON_SECRET on its own)
const PUBLIC_PREFIXES = ['/api/studio', '/api/auth', '/api/portal', '/api/cron'];

// Read-only endpoints used by the artist portal and the /previews share page. They only match a
// Drive id, so the static routes next to them (/api/files/path, /api/files/trash…) stay private.
const DRIVE_ID = '[A-Za-z0-9_-]{20,}';
const PUBLIC_READS = [
  new RegExp(`^/api/audio/${DRIVE_ID}(?:/info|/resolve)?$`),
  new RegExp(`^/api/files/${DRIVE_ID}$`),
  new RegExp(`^/api/releases/${DRIVE_ID}$`),
];

// Tools an artist portal can offer, and the private routes each one calls (src/components/tools)
const PORTAL_TOOL_ROUTES: [prefix: string, tool: PortalToolId][] = [
  ['/api/tools/ytdl', 'downloader'],
  ['/api/spotify', 'downloader'],
  ['/api/tools/convert', 'converter'],
  ['/api/tools/trim', 'trimmer'],
  ['/api/tools/tags', 'tags'],
  ['/api/tools/detect', 'detector'],
  ['/api/tools/stems', 'stems'],
];

const isUnder = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

function isPublic(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((prefix) => isUnder(pathname, prefix))) return true;
  const isRead = request.method === 'GET' || request.method === 'HEAD';
  return isRead && PUBLIC_READS.some((pattern) => pattern.test(pathname));
}

function hasPortalToolsPass(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;
  const tool = PORTAL_TOOL_ROUTES.find(([prefix]) => isUnder(pathname, prefix))?.[1];
  return !!tool && verifyPortalToolsToken(request.cookies.get(PORTAL_TOOLS_COOKIE)?.value, tool);
}

export function proxy(request: NextRequest) {
  if (
    isPublic(request) ||
    verifyStudioToken(request.cookies.get(STUDIO_COOKIE)?.value) ||
    hasPortalToolsPass(request)
  ) {
    return NextResponse.next();
  }
  return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
}

export const config = {
  matcher: '/api/:path*',
};
