import { NextResponse, NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params;
    const inline = request.nextUrl.searchParams.get('inline') === 'true';
    
    // Fetch an access token manually (Edge compatible)
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
        grant_type: 'refresh_token'
      })
    });
    
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      throw new Error("Failed to get access token");
    }
    
    // 1. Get metadata for filename and mimeType
    const metaUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType`;
    const metaFetch = await fetch(metaUrl, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const meta = await metaFetch.json();
    
    // 2. Stream the file
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const fetchHeaders: Record<string, string> = {
      Authorization: `Bearer ${tokenData.access_token}`
    };

    const gDriveRes = await fetch(url, { headers: fetchHeaders });
    
    if (!gDriveRes.ok) {
      throw new Error(`Google Drive API error: ${gDriveRes.statusText}`);
    }

    const responseHeaders = new Headers(gDriveRes.headers);
    if (meta.mimeType) responseHeaders.set('Content-Type', meta.mimeType);
    
    const disposition = inline ? 'inline' : 'attachment';
    const safeName = meta.name ? encodeURIComponent(meta.name) : 'archivo';
    responseHeaders.set('Content-Disposition', `${disposition}; filename*=UTF-8''${safeName}`);
    responseHeaders.set('Cache-Control', 'public, s-maxage=31536000, stale-while-revalidate=86400');
    
    return new NextResponse(gDriveRes.body, {
      status: gDriveRes.status,
      headers: responseHeaders
    });
  } catch (error: any) {
    console.error('API /api/files/[fileId] GET error:', error);
    return new NextResponse('Error fetching file', { status: 500 });
  }
}

