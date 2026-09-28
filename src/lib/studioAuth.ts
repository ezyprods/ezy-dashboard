import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

/**
 * Server side of the studio password gate (PasswordGuard).
 *
 * The password only lives in the server env (STUDIO_PASSWORD) and never reaches the browser.
 * Unlocking hands out an httpOnly cookie `<issuedAt>.<hmac>` signed with BETTER_AUTH_SECRET.
 * The HMAC also covers a hash of the current password, so changing STUDIO_PASSWORD revokes
 * every device that was unlocked with the old one.
 */

export const STUDIO_COOKIE = 'ezy_studio_access';
// 400 days is the longest lifetime browsers accept for a persistent cookie
export const STUDIO_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

function getConfig(): { password: string; secret: string } | null {
  const password = process.env.STUDIO_PASSWORD;
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!password || !secret) return null;
  return { password, secret };
}

export function isStudioAuthConfigured(): boolean {
  return getConfig() !== null;
}

/** Constant-time string comparison (hashing first makes both sides the same length). */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

function sign(issuedAt: string, config: { password: string; secret: string }): string {
  const passwordHash = createHash('sha256').update(config.password).digest('hex');
  return createHmac('sha256', config.secret)
    .update(`studio-access:${issuedAt}:${passwordHash}`)
    .digest('base64url');
}

export function checkStudioPassword(input: unknown): boolean {
  const config = getConfig();
  if (!config || typeof input !== 'string') return false;
  return safeEqual(input, config.password);
}

export function createStudioToken(): string {
  const config = getConfig();
  if (!config) throw new Error('Studio access is not configured (STUDIO_PASSWORD / BETTER_AUTH_SECRET)');
  const issuedAt = Date.now().toString();
  return `${issuedAt}.${sign(issuedAt, config)}`;
}

export function verifyStudioToken(token: string | undefined): boolean {
  const config = getConfig();
  if (!config || !token) return false;
  const [issuedAt, signature, ...rest] = token.split('.');
  if (rest.length > 0 || !signature || !/^\d+$/.test(issuedAt)) return false;
  if (Date.now() - Number(issuedAt) > STUDIO_MAX_AGE_SECONDS * 1000) return false;
  return safeEqual(signature, sign(issuedAt, config));
}

export function studioCookieOptions(request: NextRequest, maxAge: number = STUDIO_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    // Secure on HTTPS (Vercel) but still usable over plain HTTP on localhost
    secure: request.nextUrl.protocol === 'https:',
    path: '/',
    maxAge,
  };
}

/**
 * Artist portals can offer some tools (downloader, converter…) whose API routes are private.
 * Opening a portal with tools enabled hands out a short-lived httpOnly pass `<issuedAt>.<tools>.<hmac>`
 * listing the tools the producer allowed, and src/proxy.ts accepts it for those tools' routes only.
 */
export const PORTAL_TOOLS_COOKIE = 'ezy_portal_tools';
export const PORTAL_TOOLS_MAX_AGE_SECONDS = 24 * 60 * 60;

function signPortalTools(issuedAt: string, tools: string, secret: string): string {
  return createHmac('sha256', secret).update(`portal-tools:${issuedAt}:${tools}`).digest('base64url');
}

export function createPortalToolsToken(tools: readonly string[]): string | null {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || tools.length === 0) return null;
  const issuedAt = Date.now().toString();
  const list = tools.join(',');
  return `${issuedAt}.${list}.${signPortalTools(issuedAt, list, secret)}`;
}

export function verifyPortalToolsToken(token: string | undefined, tool: string): boolean {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || !token) return false;
  const [issuedAt, list, signature, ...rest] = token.split('.');
  if (rest.length > 0 || !list || !signature || !/^\d+$/.test(issuedAt)) return false;
  if (Date.now() - Number(issuedAt) > PORTAL_TOOLS_MAX_AGE_SECONDS * 1000) return false;
  return safeEqual(signature, signPortalTools(issuedAt, list, secret)) && list.split(',').includes(tool);
}
