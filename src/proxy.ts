import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Rutas que requieren sesión de Google (dashboard)
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/artists',
  '/projects',
  '/payments',
  '/calendar',
  '/communications',
  '/matrices',
  '/settings',
  '/previews',
];

// Rutas que son SIEMPRE públicas (nunca redirigir)
const PUBLIC_PREFIXES = [
  '/api/auth',       // Better-auth handlers (callback de Google, etc.)
  '/api/portal',     // Portal público — sin autenticación
  '/api/audio',      // Servicio de audio — acceso público
  '/portal',         // Página del portal para artistas
  '/login',          // Página de login
  '/_next',          // Assets de Next.js
  '/favicon',
  '/icon',
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Si es ruta pública, dejar pasar siempre
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // 2. Si es ruta protegida y no hay cookie de sesión → redirigir a /login
  if (PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const sessionToken =
      request.cookies.get('better-auth.session_token')?.value ||
      request.cookies.get('__Secure-better-auth.session_token')?.value;

    if (!sessionToken) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Ejecutar en todas las rutas excepto assets estáticos y archivos de Next.js
    '/((?!_next/static|_next/image|.*\\.(?:ico|png|jpg|jpeg|svg|webp|gif|woff|woff2|ttf|otf|mp3|wav|ogg)$).*)',
  ],
};
