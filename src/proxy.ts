import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Rutas que son SIEMPRE públicas (nunca redirigir)
const PUBLIC_PREFIXES = [
  '/api/auth',       // Better-auth handlers (callback de Google, etc.)
  '/api/portal',     // Portal público — sin autenticación
  '/api/audio',      // Servicio de audio — acceso público
  '/portal',         // Página del portal para artistas
  '/login',          // Página de login (ya no se usa para entrar, pero por si acaso)
  '/_next',          // Assets de Next.js
  '/favicon',
  '/icon',
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Si es ruta pública, dejar pasar siempre
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // El resto de rutas (dashboard, artists, projects, etc.) pasan sin comprobación de sesión Google.
  // El acceso está controlado por PasswordGuard (contraseña del estudio) en el layout del dashboard.
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Ejecutar en todas las rutas excepto assets estáticos y archivos de Next.js
    '/((?!_next/static|_next/image|.*\\.(?:ico|png|jpg|jpeg|svg|webp|gif|woff|woff2|ttf|otf|mp3|wav|ogg)$).*)',
  ],
};
