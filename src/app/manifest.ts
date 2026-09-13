import type { MetadataRoute } from 'next';

// Lets the dashboard be installed from Safari ("Compartir → Añadir a pantalla de inicio")
// and open full-screen like a native app, starting directly on the dashboard.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Ezy',
    short_name: 'Ezy',
    description: 'Plataforma de gestión de producción musical para productores independientes.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0a0a0f',
    theme_color: '#0a0a0f',
    lang: 'es',
    icons: [
      { src: '/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
