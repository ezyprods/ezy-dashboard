import { NextResponse } from 'next/server';

export const maxDuration = 300; // Allow up to 5 minutes to stream the file

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return NextResponse.json({ error: 'URL requerida' }, { status: 400 });
  }

  try {
    const response = await fetch(targetUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch from remote URL: ${response.status}`);
    }

    // Proxy headers to allow progress tracking and correct MIME types
    const headers = new Headers();
    headers.set('Content-Type', response.headers.get('Content-Type') || 'audio/mp4');
    headers.set('Content-Length', response.headers.get('Content-Length') || '');
    headers.set('Accept-Ranges', 'bytes');

    return new NextResponse(response.body, { headers });

  } catch (error: any) {
    console.error('Proxy stream error:', error);
    return NextResponse.json({ error: 'Error al hacer proxy de la descarga' }, { status: 500 });
  }
}
