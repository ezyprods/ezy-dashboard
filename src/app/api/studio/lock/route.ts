import { NextResponse } from 'next/server';
import { STUDIO_COOKIE } from '@/lib/studioAuth';

// The access cookie is httpOnly, so the browser can only drop it by asking the server
export async function POST() {
  const response = NextResponse.json({ unlocked: false });
  response.cookies.delete(STUDIO_COOKIE);
  return response;
}
