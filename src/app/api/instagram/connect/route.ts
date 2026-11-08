import { NextRequest, NextResponse } from 'next/server';
import { loginDialogUrl, metaConfig } from '@/lib/instagram/graph';
import { createOAuthState } from '@/lib/instagram/secrets';

import { requireStudio } from '@/lib/routeAuth';
export const dynamic = 'force-dynamic';

// Abre el diálogo de Meta (inicio de sesión unificado). Vuelve a /api/instagram/callback.
export async function GET(request: NextRequest) {
  const denied = await requireStudio();
  if (denied) return denied;
  if (!metaConfig().ok) {
    return NextResponse.redirect(new URL('/instagram?error=config', request.url));
  }
  const redirectUri = `${request.nextUrl.origin}/api/instagram/callback`;
  return NextResponse.redirect(loginDialogUrl(redirectUri, createOAuthState()));
}
