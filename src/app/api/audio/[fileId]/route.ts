import { NextResponse, NextRequest } from 'next/server';
import { getGoogleAccessToken } from '@/lib/googleTokenCache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LONG_CACHE = 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800';

/**
 * Audio delivery.
 *
 * DO NOT try to save Fast Origin Transfer by redirecting the browser to Google.
 * It cannot work, and it has now broken playback twice. Measured in a real
 * browser (Sept 2026), every Google host answers a media element with
 * `MEDIA_ELEMENT_ERROR: Format error`:
 *
 *   drive.usercontent.google.com/download?...&confirm=t   blocked
 *   drive.usercontent.google.com/uc?id=...                403 + HTML
 *   lh3.googleusercontent.com/d/<id>                      blocked
 *   drive.google.com/uc?export=view                       blocked
 *   docs.google.com/uc?export=download                    blocked
 *   www.googleapis.com/drive/v3/files/<id>?alt=media      blocked
 *
 * The bytes and headers look perfect from Node (`206`, `audio/mpeg`,
 * `Access-Control-Allow-Origin: *`) which is exactly what makes this trap so
 * convincing — but Drive also sends `Cross-Origin-Resource-Policy: same-site`,
 * and browsers refuse a cross-site no-cors subresource on that basis. Asking
 * for it in CORS mode instead fails too: Google drops the CORS header for
 * browser requests ("No 'Access-Control-Allow-Origin' header is present").
 *
 * This is deliberate on Google's part — Drive is not a media CDN — and it
 * applies to ANY site, not just ours: the same test fails from a plain page
 * with no COEP/COOP headers at all. So it is not something our headers can fix.
 *
 * Downloads are different and DO still redirect (see /api/files/[fileId]):
 * a download is a top-level navigation, not a subresource, so CORP never
 * applies to it. That optimisation is safe and stays.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params;
    if (!fileId) {
      return new NextResponse('File ID is required', { status: 400 });
    }

    // Images still redirect: the thumbnail host is CORP-permissive, so this
    // costs 0 bytes of origin transfer and keeps working.
    const acceptHeader = request.headers.get('accept') || '';
    if (acceptHeader.includes('image/') || request.nextUrl.searchParams.get('type') === 'image') {
      const imgUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
      const res = NextResponse.redirect(imgUrl, { status: 307 });
      res.headers.set('Cache-Control', LONG_CACHE);
      return res;
    }

    // Stream through the function with HTTP 206 Partial Content so seeking and
    // scrubbing work. `max-age` lets the browser reuse what it already has, so
    // replaying a track on the same device costs nothing.
    const accessToken = await getGoogleAccessToken();
    const range = request.headers.get('range');
    const fetchHeaders: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
    };
    if (range) {
      fetchHeaders['Range'] = range;
    }

    const gDriveRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
      { headers: fetchHeaders }
    );

    if (!gDriveRes.ok) {
      console.error(`Google Drive API error for file ${fileId}: ${gDriveRes.status} ${gDriveRes.statusText}`);
      return new NextResponse(`Google Drive API error: ${gDriveRes.statusText}`, {
        status: gDriveRes.status,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    const contentType = gDriveRes.headers.get('content-type') || 'audio/mpeg';
    if (contentType.startsWith('image/')) {
      gDriveRes.body?.cancel().catch(() => {});
      const imgUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
      const res = NextResponse.redirect(imgUrl, { status: 307 });
      res.headers.set('Cache-Control', LONG_CACHE);
      return res;
    }

    const responseHeaders = new Headers();
    const contentRange = gDriveRes.headers.get('content-range');
    const contentLength = gDriveRes.headers.get('content-length');

    responseHeaders.set('Content-Type', contentType);
    responseHeaders.set('Accept-Ranges', 'bytes');
    if (contentRange) responseHeaders.set('Content-Range', contentRange);
    if (contentLength) responseHeaders.set('Content-Length', contentLength);
    responseHeaders.set('Cache-Control', 'public, max-age=86400');
    responseHeaders.set('Access-Control-Allow-Origin', '*');

    return new NextResponse(gDriveRes.body, {
      status: gDriveRes.status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error('API /audio/[fileId] error:', error);
    return new NextResponse(error?.message || 'Error streaming audio', {
      status: 500,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
