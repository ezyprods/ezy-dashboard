import { NextRequest, NextResponse } from 'next/server';
import { STUDIO_COOKIE, createStudioToken, studioCookieOptions, verifyStudioToken } from '@/lib/studioAuth';

export async function GET(request: NextRequest) {
  const unlocked = verifyStudioToken(request.cookies.get(STUDIO_COOKIE)?.value);
  const response = NextResponse.json({ unlocked }, { headers: { 'Cache-Control': 'no-store' } });

  // Re-issue the cookie on every visit so a device in use is never asked for the password again
  if (unlocked) {
    response.cookies.set(STUDIO_COOKIE, createStudioToken(), studioCookieOptions(request));
  }
  return response;
}
