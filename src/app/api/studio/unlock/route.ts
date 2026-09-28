import { NextRequest, NextResponse } from 'next/server';
import {
  STUDIO_COOKIE,
  checkStudioPassword,
  createStudioToken,
  isStudioAuthConfigured,
  studioCookieOptions,
} from '@/lib/studioAuth';

// A wrong guess waits before answering, to slow down brute-forcing the password
const FAILED_ATTEMPT_DELAY_MS = 800;

export async function POST(request: NextRequest) {
  if (!isStudioAuthConfigured()) {
    console.error('[studio/unlock] STUDIO_PASSWORD or BETTER_AUTH_SECRET is not set');
    return NextResponse.json({ error: 'not_configured' }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  if (!checkStudioPassword(body?.password)) {
    await new Promise((resolve) => setTimeout(resolve, FAILED_ATTEMPT_DELAY_MS));
    return NextResponse.json({ error: 'invalid_password' }, { status: 401 });
  }

  const response = NextResponse.json({ unlocked: true });
  response.cookies.set(STUDIO_COOKIE, createStudioToken(), studioCookieOptions(request));
  return response;
}
