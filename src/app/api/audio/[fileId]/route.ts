import { NextResponse, NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  try {
    const { fileId } = await params;
    
    // Fetch an access token manually (Edge compatible, no googleapis library needed)
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
    
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    
    const range = request.headers.get('range');
    const fetchHeaders: Record<string, string> = {
      Authorization: `Bearer ${tokenData.access_token}`
    };
    if (range) fetchHeaders['Range'] = range;

    const gDriveRes = await fetch(url, { headers: fetchHeaders });
    
    if (!gDriveRes.ok) {
      throw new Error(`Google Drive API error: ${gDriveRes.statusText}`);
    }

    const responseHeaders = new Headers(gDriveRes.headers);
    // Agregamos cache a nivel de CDN (Edge) para que la misma canción no consuma Origin Transfer repetidamente.
    responseHeaders.set('Cache-Control', 'public, s-maxage=31536000, stale-while-revalidate=86400');
    
    return new NextResponse(gDriveRes.body, {
      status: gDriveRes.status,
      headers: responseHeaders
    });
  } catch (error: any) {
    console.error('API /audio/[fileId] error:', error);
    return new NextResponse('Error streaming audio', { status: 500 });
  }
}
