import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Rutas que son SIEMPRE públicas (portales, auth de Google para Drive/Calendar, assets)
const PUBLIC_PREFIXES = [
  '/api/auth',   // Better-auth handlers
  '/api/portal', // Portal público de artistas
  '/api/audio',  // Audio streaming
  '/portal',     // Página del portal
  '/login',      // Página de login (ya no necesaria como puerta, pero existe)
  '/_next',
  '/favicon',
  '/icon',
];

// El acceso al dashboard está controlado exclusivamente por PasswordGuard (contraseña del estudio).
// Este proxy solo gestiona rutas públicas vs. el resto; NO bloquea por sesión de Google.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Siempre dejar pasar rutas públicas
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Dejar pasar todo lo demás — PasswordGuard en el layout gestiona el acceso
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|.*\\.(?:ico|png|jpg|jpeg|svg|webp|gif|woff|woff2|ttf|otf|mp3|wav|ogg)$).*)',
  ],
};
