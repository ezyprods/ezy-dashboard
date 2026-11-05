import { NextRequest, NextResponse } from 'next/server';
import { getGoogleAccessToken } from '@/lib/googleTokenCache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Hasta 60 MB: imágenes y pistas de audio que el formulario necesita abrir en el navegador
// (recortar una imagen de Drive o montar un Reel con tu música). Los vídeos no pasan por aquí.
const MAX_BYTES = 60 * 1024 * 1024;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[\w-]{10,}$/.test(id)) return new NextResponse('Bad id', { status: 400 });
  try {
    const token = await getGoogleAccessToken();

    // ?thumb=<px>: miniatura de cualquier imagen o vídeo de Drive para la interfaz (unos KB)
    const thumb = request.nextUrl.searchParams.get('thumb');
    if (thumb) {
      const size = Math.max(100, Math.min(1600, Number(thumb) || 400));
      const m = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?fields=thumbnailLink,mimeType,size&supportsAllDrives=true`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      }).then(r => r.json()).catch(() => ({}));
      if (!m.thumbnailLink) {
        // Archivo recién subido: Drive aún no ha hecho su miniatura. Si es una imagen pequeña, se sirve tal cual.
        if (/^image\//.test(m.mimeType || '') && Number(m.size) < 3 * 1024 * 1024) {
          const raw = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } });
          if (raw.ok && raw.body) return new NextResponse(raw.body, { headers: { 'Content-Type': m.mimeType, 'Cache-Control': 'private, max-age=86400' } });
        }
        return new NextResponse('Sin miniatura', { status: 404, headers: { 'Cache-Control': 'no-store' } });
      }
      const img = await fetch(String(m.thumbnailLink).replace(/=s\d+(-[a-z0-9-]+)?$/i, `=s${size}`), { headers: { Authorization: `Bearer ${token}` } });
      if (!img.ok || !img.body) return new NextResponse('Sin miniatura', { status: 404, headers: { 'Cache-Control': 'no-store' } });
      return new NextResponse(img.body, {
        headers: { 'Content-Type': img.headers.get('content-type') || 'image/jpeg', 'Cache-Control': 'private, max-age=86400' },
      });
    }

    const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?fields=mimeType,size&supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const meta = await metaRes.json();
    if (!/^(image|audio)\//.test(meta.mimeType || '')) return new NextResponse('Solo imágenes o audio', { status: 415 });
    if (Number(meta.size) > MAX_BYTES) return new NextResponse('Archivo demasiado grande', { status: 413 });
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok || !res.body) return new NextResponse('No encontrado', { status: 404 });
    return new NextResponse(res.body, {
      headers: {
        'Content-Type': meta.mimeType,
        ...(meta.size ? { 'Content-Length': String(meta.size) } : {}),
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err) {
    return new NextResponse((err as Error).message, { status: 502 });
  }
}
