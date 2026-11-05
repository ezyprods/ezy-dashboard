import { NextRequest, NextResponse } from 'next/server';
import { getGoogleAccessToken } from '@/lib/googleTokenCache';
import { verifyMedia } from '@/lib/instagram/secrets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Imagen pública para que Instagram la descargue al publicar. Es pública (ver src/proxy.ts) pero
 * solo sirve archivos que esta app ha firmado (?s=), así que no expone el resto de Drive.
 * Solo imágenes, que pesan poco: los vídeos los descarga Meta directamente de Drive.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  if (!/^[\w-]{10,}$/.test(fileId) || !verifyMedia(fileId, request.nextUrl.searchParams.get('s'))) {
    return new NextResponse('Not found', { status: 404 });
  }
  try {
    const token = await getGoogleAccessToken();
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }
    );
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !res.body) return new NextResponse('Not found', { status: 404 });
    if (!type.startsWith('image/')) return new NextResponse('Unsupported', { status: 415 });
    return new NextResponse(res.body, {
      status: 200,
      headers: {
        'Content-Type': type,
        ...(res.headers.get('content-length') ? { 'Content-Length': res.headers.get('content-length')! } : {}),
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch (err) {
    console.error('[api/instagram/media]', err);
    return new NextResponse('Error', { status: 502 });
  }
}
