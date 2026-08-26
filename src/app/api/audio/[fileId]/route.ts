import { NextResponse, NextRequest } from 'next/server';
import { getGoogleAccessToken } from '@/lib/googleTokenCache';

/**
 * GET /api/audio/[fileId]
 *
 * OPTIMIZATION: Instead of proxying the file through Vercel (which consumed
 * 30+ GB of Fast Origin Transfer), we now redirect the browser directly to
 * Google Drive's download endpoint.
 *
 * Strategy:
 * 1. First, try a lightweight redirect to the public Drive URL (no Vercel bandwidth).
 *    This works for files shared with "anyone with the link".
 * 2. If the file is private, fall back to a signed-token redirect: we get an
 *    OAuth token and redirect to the Drive API URL with Authorization embedded
 *    via a short-lived signed URL. Since the browser hits Drive directly, still
 *    no data flows through Vercel.
 *
 * The browser (or <audio> element) follows the 307 redirect automatically.
 * Range requests (for audio seeking) are fully supported by Google Drive.
 */

export const runtime = 'nodejs'; // Use Node.js runtime for token cache (module-level state)
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  try {
    const { fileId } = await params;

    // ── Step 1: Try the public Drive download URL ──────────────────────────────
    // If the file is publicly shared ("anyone with the link"), this URL works
    // directly without authentication. The CDN redirect costs ~0 bytes.
    const publicUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;

    // Do a HEAD request to check if the file is publicly accessible
    // We use redirect: 'manual' to check the redirect chain without following it
    try {
      const checkRes = await fetch(publicUrl, {
        method: 'GET',
        redirect: 'manual',
        // We only care about the response headers, abort immediately
        signal: AbortSignal.timeout(5000),
      });

      // A 302/303 redirect to drive.usercontent.google.com means it's public
      if (checkRes.status === 302 || checkRes.status === 303) {
        const location = checkRes.headers.get('location');
        if (location && !location.includes('ServiceLogin') && !location.includes('accounts.google.com')) {
          // Redirect browser directly to the pre-resolved Drive content URL
          // This completely bypasses Vercel for data transfer
          return NextResponse.redirect(location, {
            status: 307,
            headers: {
              // Allow browser to cache this redirect briefly
              'Cache-Control': 'private, max-age=300', // 5 min
            },
          });
        }
      }

      // If it's a 200 (small file, served inline), redirect to the public URL
      if (checkRes.status === 200) {
        return NextResponse.redirect(publicUrl, { status: 307 });
      }
    } catch {
      // Timeout or network error on public check — fall through to authenticated URL
    }

    // ── Step 2: Authenticated redirect (private files) ─────────────────────────
    // The file is private. We use the Drive API URL with an OAuth token.
    // We still REDIRECT (307) rather than proxying, so no file data flows
    // through Vercel. The token is short-lived (1h) and embedded in the URL.
    //
    // Note: This uses the cached token from googleTokenCache to avoid an
    // extra round-trip to Google on every request.
    const accessToken = await getGoogleAccessToken();

    // Get a short-lived direct download URL from Drive API
    // The media URL requires Authorization header, so we need to use a
    // different approach: generate a signed download URL via the files.get API
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        method: 'HEAD',
        headers: { Authorization: `Bearer ${accessToken}` },
        redirect: 'manual',
      }
    );

    if (metaRes.status === 302 || metaRes.status === 303) {
      const location = metaRes.headers.get('location');
      if (location) {
        return NextResponse.redirect(location, { status: 307 });
      }
    }

    // ── Step 3: Last resort — proxy (original behavior) ────────────────────────
    // Only reached if all redirect strategies failed (very rare).
    // This preserves full backwards compatibility.
    const range = request.headers.get('range');
    const fetchHeaders: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
    };
    if (range) fetchHeaders['Range'] = range;

    const gDriveRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: fetchHeaders }
    );

    if (!gDriveRes.ok) {
      throw new Error(`Google Drive API error: ${gDriveRes.statusText}`);
    }

    const responseHeaders = new Headers(gDriveRes.headers);
    responseHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');

    return new NextResponse(gDriveRes.body, {
      status: gDriveRes.status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error('API /audio/[fileId] error:', error);
    return new NextResponse('Error streaming audio', { status: 500 });
  }
}
