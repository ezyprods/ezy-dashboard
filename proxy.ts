import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const publicRoutes = ['/login', '/portal'];

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  
  // Ignorar assets y api routes (excepto auth)
  if (
    path.startsWith('/_next') ||
    path.startsWith('/favicon.ico') ||
    path.match(/\.(png|jpg|jpeg|svg|css|js)$/)
  ) {
    return NextResponse.next();
  }

  const isPublicRoute = publicRoutes.some(route => path.startsWith(route));
  
  // Comprobar si hay sesión (usamos la cookie de better-auth)
  const sessionToken = request.cookies.get('better-auth.session_token');
  
  // Si no es ruta pública y no hay sesión, redirigir a login
  if (!isPublicRoute && !sessionToken && !path.startsWith('/api/auth')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  
  // Si es login y ya hay sesión, redirigir a dashboard
  if (path === '/login' && sessionToken) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
