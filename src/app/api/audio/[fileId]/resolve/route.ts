import { NextResponse, NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  try {
    const { fileId } = await params;
    const targetUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
    
    // Perform a manual fetch to intercept the 302/303 redirect and get the final URL
    // The final URL (drive.usercontent.google.com) supports HTTP Range requests perfectly,
    // which allows instant streaming without downloading the entire file.
    const res = await fetch(targetUrl, { 
      method: 'GET', 
      redirect: 'manual' 
    });

    if (res.status === 302 || res.status === 303) {
      const location = res.headers.get('location');
      if (location) {
        // If it redirects to Google Login, it means the file is strictly private.
        if (location.includes('ServiceLogin')) {
          return NextResponse.json({ url: targetUrl });
        }
        return NextResponse.json({ url: location });
      }
    }

    return NextResponse.json({ url: targetUrl });
  } catch (error: any) {
    console.error('API /audio/[fileId]/resolve error:', error);
    return NextResponse.json({ error: 'Failed to resolve audio URL' }, { status: 500 });
  }
}
