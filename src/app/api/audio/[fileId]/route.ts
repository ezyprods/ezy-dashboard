import { NextResponse, NextRequest } from 'next/server';
import { getGoogleAccessToken } from '@/lib/googleTokenCache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params;
    if (!fileId) {
      return new NextResponse('File ID is required', { status: 400 });
    }

    const accessToken = await getGoogleAccessToken();
    const range = request.headers.get('range');

    const fetchHeaders: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
    };
    if (range) {
      fetchHeaders['Range'] = range;
    }

    // If browser request is for an image (e.g. <img> tag with Accept: image/* or ?type=image),
    // redirect immediately to Google's thumbnail CDN — 0 backend bandwidth, 0 function duration!
    const acceptHeader = request.headers.get('accept') || '';
    if (acceptHeader.includes('image/') || request.nextUrl.searchParams.get('type') === 'image') {
      const imgUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
      const res = NextResponse.redirect(imgUrl, { status: 307 });
      res.headers.set('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800');
      return res;
    }

    const gDriveRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
      {
        headers: fetchHeaders,
      }
    );

    if (!gDriveRes.ok) {
      console.error(`Google Drive API error for file ${fileId}: ${gDriveRes.status} ${gDriveRes.statusText}`);
      return new NextResponse(`Google Drive API error: ${gDriveRes.statusText}`, {
        status: gDriveRes.status,
      });
    }

    const contentType = gDriveRes.headers.get('content-type') || 'audio/mpeg';

    // If requested file is an image (cover art fallback), redirect directly to Google thumbnail CDN
    if (contentType.startsWith('image/')) {
      const imgUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
      const res = NextResponse.redirect(imgUrl, { status: 307 });
      res.headers.set('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800');
      return res;
    }

    const responseHeaders = new Headers();
    const contentRange = gDriveRes.headers.get('content-range');
    const contentLength = gDriveRes.headers.get('content-length');

    responseHeaders.set('Content-Type', contentType);
    responseHeaders.set('Accept-Ranges', 'bytes');
    if (contentRange) responseHeaders.set('Content-Range', contentRange);
    if (contentLength) responseHeaders.set('Content-Length', contentLength);

    // Cache audio chunks in the browser and edge to minimize repeated network bandwidth
    responseHeaders.set('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800');

    return new NextResponse(gDriveRes.body, {
      status: gDriveRes.status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error('API /audio/[fileId] error:', error);
    return new NextResponse(error?.message || 'Error streaming audio', { status: 500 });
  }
}


