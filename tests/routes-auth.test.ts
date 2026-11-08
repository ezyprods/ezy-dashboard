import { describe, expect, it, beforeAll } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';

/**
 * Every API route is either private (its handlers start by checking the studio cookie, or the
 * portal tools pass for the tools an artist portal may use) or listed below with the reason it is
 * public and the credential it checks instead. A new route that does neither fails this test.
 */

const API_DIR = path.resolve(__dirname, '../src/app/api');

const PUBLIC_ROUTES: Record<string, string> = {
  'auth/[...all]': 'Better Auth handler (no access to studio data)',
  'studio/unlock': 'the password form itself (rate limited)',
  'studio/status': 'tells the browser whether it is unlocked',
  'studio/lock': 'drops the cookie',
  'cron/cleanup-expired': 'CRON_SECRET (503 without it)',
  'cron/instagram': 'CRON_SECRET (503 without it)',
  'instagram/media/[fileId]': 'HMAC signature ?s= on each file',
  'files/[fileId]': 'only files inside the studio folder (driveScope)',
  'audio/[fileId]': 'only files inside the studio folder (driveScope)',
  'audio/[fileId]/info': 'only files inside the studio folder (driveScope)',
  'audio/[fileId]/meta': 'only files inside the studio folder (driveScope)',
  'audio/[fileId]/resolve': 'returns a URL string, reads nothing',
  'releases/[id]': 'GET only for release folders inside the studio folder; PUT/DELETE require the studio',
  'portal/[id]': 'artist folders only; POST needs the portal session',
  'portal/[id]/contact': 'portal session cookie',
  'portal/[id]/downloads': 'portal session cookie',
  'portal/[id]/releases/[releaseId]': 'portal session cookie',
  'hub/v1/pendientes': 'HUB_TOKEN bearer (503 without it)',
};

const GUARD = /^\s*const denied = await requireStudio(?:\(\)|OrPortalTool\('[a-z]+'\));\s*\n\s*if \(denied\) return denied;/;

function routeFiles(dir: string, base = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const rel = base ? `${base}/${entry}` : entry;
    if (statSync(full).isDirectory()) out.push(...routeFiles(full, rel));
    else if (entry === 'route.ts') out.push(base);
  }
  return out;
}

function handlerBodies(source: string): { method: string; body: string }[] {
  const found: { method: string; body: string }[] = [];
  const re = /export async function (GET|POST|PUT|PATCH|DELETE)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    let i = m.index + m[0].length;
    let depth = 1;
    while (depth) {
      const c = source[i++];
      if (c === '(') depth++;
      else if (c === ')') depth--;
    }
    const brace = source.indexOf('{', i);
    found.push({ method: m[1], body: source.slice(brace + 1, brace + 400) });
  }
  return found;
}

describe('API route protection', () => {
  const routes = routeFiles(API_DIR);

  it('finds the API routes', () => {
    expect(routes.length).toBeGreaterThan(90);
  });

  for (const route of routes) {
    if (PUBLIC_ROUTES[route]) continue;
    it(`/api/${route} checks access in every handler`, () => {
      const source = readFileSync(path.join(API_DIR, route, 'route.ts'), 'utf8');
      const handlers = handlerBodies(source);
      expect(handlers.length).toBeGreaterThan(0);
      for (const h of handlers) {
        expect(GUARD.test(h.body), `${h.method} /api/${route} must start with requireStudio()`).toBe(true);
      }
    });
  }

  it('every public route still exists (keeps the allow-list honest)', () => {
    for (const route of Object.keys(PUBLIC_ROUTES)) {
      expect(routes, route).toContain(route);
    }
  });
});

describe('proxy', () => {
  let proxy: (r: NextRequest) => Response;
  beforeAll(async () => {
    process.env.STUDIO_PASSWORD = 'test-password';
    process.env.BETTER_AUTH_SECRET = 'test-secret-for-vitest-only';
    ({ proxy } = (await import('@/proxy')) as unknown as { proxy: (r: NextRequest) => Response });
  });

  const call = (url: string, method = 'GET', cookie?: string) =>
    proxy(new NextRequest(`https://example.test${url}`, { method, headers: cookie ? { cookie } : {} }));

  const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';

  it('blocks private routes without the studio cookie', () => {
    expect(call('/api/artists').status).toBe(401);
    expect(call('/api/payments').status).toBe(401);
    expect(call('/api/auth/google-token').status).toBe(401);
    expect(call('/api/auth/status').status).toBe(401);
    expect(call(`/api/files/${ID}`, 'DELETE').status).toBe(401);
  });

  it('lets public routes through to their own checks', () => {
    const passes = (r: Response) => r.headers.get('x-middleware-next') === '1';
    expect(passes(call(`/api/portal/${ID}`))).toBe(true);
    expect(passes(call(`/api/files/${ID}`))).toBe(true);
    expect(passes(call(`/api/audio/${ID}/meta`))).toBe(true);
    expect(passes(call('/api/cron/instagram'))).toBe(true);
    expect(passes(call('/api/hub/v1/pendientes'))).toBe(true);
    expect(passes(call('/api/auth/callback/google'))).toBe(true);
  });

  it('accepts a valid studio cookie', async () => {
    const { createStudioToken, STUDIO_COOKIE } = await import('@/lib/studioAuth');
    const r = call('/api/artists', 'GET', `${STUDIO_COOKIE}=${createStudioToken()}`);
    expect(r.headers.get('x-middleware-next')).toBe('1');
  });
});
