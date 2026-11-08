import { NextRequest, NextResponse } from 'next/server';
import {
  STUDIO_COOKIE,
  checkStudioPassword,
  createStudioToken,
  isStudioAuthConfigured,
  studioCookieOptions,
} from '@/lib/studioAuth';
import { checkUnlockAllowed, clientIp, recordUnlockFailure, recordUnlockSuccess } from '@/lib/loginRateLimit';

// A wrong guess waits before answering, to slow down brute-forcing the password
const FAILED_ATTEMPT_DELAY_MS = 800;

export async function POST(request: NextRequest) {
  if (!isStudioAuthConfigured()) {
    console.error('[studio/unlock] STUDIO_PASSWORD or BETTER_AUTH_SECRET is not set');
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const ip = clientIp(request);
  const limit = await checkUnlockAllowed(ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'too_many_attempts', retryAfterSeconds: limit.retryAfterSeconds },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds), 'Cache-Control': 'no-store' } },
    );
  }

  const body = await request.json().catch(() => null);
  if (!checkStudioPassword(body?.password)) {
    await Promise.all([
      recordUnlockFailure(ip),
      new Promise((resolve) => setTimeout(resolve, FAILED_ATTEMPT_DELAY_MS)),
    ]);
    return NextResponse.json({ error: 'invalid_password' }, { status: 401 });
  }

  await recordUnlockSuccess(ip);
  const response = NextResponse.json({ unlocked: true });
  response.cookies.set(STUDIO_COOKIE, createStudioToken(), studioCookieOptions(request));
  return response;
}
