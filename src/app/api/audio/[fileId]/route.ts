import { NextResponse, NextRequest } from 'next/server';
import { getGoogleAccessToken } from '@/lib/googleTokenCache';
import {
  directDriveUrl,
  ensureLinkReadable,
  getDriveMediaMeta,
  isDirectPlayable,
} from '@/lib/driveDirectLink';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LONG_CACHE = 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800';

/**
 * Audio delivery.
 *
 * Default path: a 307 to Google's CDN, so the audio bytes never pass through
 * the Vercel function and cost 0 Fast Origin Transfer. Streaming them through
 * here is what blew past the 10 GB/month free-tier budget, and the CDN can't
 * rescue it — Vercel refuses to cache any request carrying a `Range` header,
 * which every `<audio>` element sends.
 *
 * The redirect is only emitted once the file is confirmed link-readable;
 * otherwise Google answers with an `application/binary` interstitial that
 * Chrome blocks via ORB. Anything not confirmed playable-and-public falls back
 * to the original proxy, so playback never breaks — it just costs bandwidth.
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

    // Image requests (<img> tags, Accept: image/*) go to Google's thumbnail CDN —
    // 0 backend bandwidth, 0 function duration.
    const acceptHeader = request.headers.get('accept') || '';
    if (acceptHeader.includes('image/') || request.nextUrl.searchParams.get('type') === 'image') {
      const imgUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
      const res = NextResponse.redirect(imgUrl, { status: 307 });
      res.headers.set('Cache-Control', LONG_CACHE);
      return res;
    }

    const accessToken = await getGoogleAccessToken();
    const forceProxy = request.nextUrl.searchParams.get('proxy') === 'true';

    let meta = null;
    if (!forceProxy) {
      meta = await getDriveMediaMeta(fileId, accessToken).catch(() => null);

      if (meta && meta.mimeType.startsWith('image/')) {
        const imgUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
        const res = NextResponse.redirect(imgUrl, { status: 307 });
        res.headers.set('Cache-Control', LONG_CACHE);
        return res;
      }

      // ZERO-ORIGIN-TRANSFER PATH
      if (meta && isDirectPlayable(meta.mimeType)) {
        const readable = await ensureLinkReadable(fileId, accessToken, meta);
        if (readable) {
          const res = NextResponse.redirect(directDriveUrl(fileId), { status: 307 });
          res.headers.set('Cache-Control', LONG_CACHE);
          res.headers.set('Access-Control-Allow-Origin', '*');
          return res;
        }
      }
    }

    // FALLBACK: proxy with HTTP 206 Partial Content, for files whose mime type
    // would trip ORB on a direct link, or when the permission grant failed.
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

    const contentType = gDriveRes.headers.get('content-type') || meta?.mimeType || 'audio/mpeg';
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
    try {
      const { fileId } = await params;
      if (fileId) {
        return NextResponse.redirect(directDriveUrl(fileId), { status: 307 });
      }
    } catch {}
    return new NextResponse(error?.message || 'Error streaming audio', {
      status: 500,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
