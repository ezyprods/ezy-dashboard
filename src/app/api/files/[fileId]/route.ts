import { NextResponse, NextRequest } from 'next/server';
import { getGoogleAccessToken } from '@/lib/googleTokenCache';

/**
 * GET /api/files/[fileId]
 *
 * OPTIMIZATION: Instead of proxying the entire file through Vercel (which was
 * the primary cause of 30+ GB Fast Origin Transfer consumption), we now redirect
 * the browser directly to Google Drive's download endpoint.
 *
 * Strategy (same as /api/audio/[fileId]):
 * 1. Try public Drive URL redirect (zero Vercel bandwidth)
 * 2. If private, use authenticated Drive API redirect (still zero Vercel bandwidth)
 * 3. Last resort: fall back to the original proxy behavior
 *
 * The browser follows the 307 redirect automatically and downloads directly
 * from Google Drive servers.
 */

export const runtime = 'nodejs'; // Node.js runtime needed for token cache
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params;
    const inline = request.nextUrl.searchParams.get('inline') === 'true';

    // ── Step 1: Try public Drive URL redirect ──────────────────────────────────
    const publicUrl = inline
      ? `https://drive.google.com/file/d/${fileId}/view`
      : `https://drive.google.com/uc?export=download&id=${fileId}`;

    const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;

    try {
      const checkRes = await fetch(downloadUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(5000),
      });

      if (checkRes.status === 302 || checkRes.status === 303) {
        const location = checkRes.headers.get('location');
        if (location && !location.includes('ServiceLogin') && !location.includes('accounts.google.com')) {
          if (inline) {
            // For inline viewing, redirect to the view URL
            return NextResponse.redirect(publicUrl, { status: 307 });
          }
          // For downloads, redirect to the pre-resolved content URL
          return NextResponse.redirect(location, {
            status: 307,
            headers: { 'Cache-Control': 'private, max-age=300' },
          });
        }
      }

      if (checkRes.status === 200) {
        return NextResponse.redirect(inline ? publicUrl : downloadUrl, { status: 307 });
      }
    } catch {
      // Fall through to authenticated approach
    }

    // ── Step 2: Authenticated redirect (private files) ─────────────────────────
    const accessToken = await getGoogleAccessToken();

    // Get file metadata for name and MIME type
    const metaUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType,webViewLink,webContentLink`;
    const metaFetch = await fetch(metaUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (metaFetch.ok) {
      const meta = await metaFetch.json();

      // For inline viewing, use webViewLink (Google Viewer, no bandwidth cost)
      if (inline && meta.webViewLink) {
        return NextResponse.redirect(meta.webViewLink, { status: 307 });
      }

      // For downloads, use webContentLink if available
      if (!inline && meta.webContentLink) {
        return NextResponse.redirect(meta.webContentLink, { status: 307 });
      }
    }

    // Try a HEAD redirect from the media endpoint
    const mediaHeadRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        method: 'HEAD',
        headers: { Authorization: `Bearer ${accessToken}` },
        redirect: 'manual',
      }
    );

    if (mediaHeadRes.status === 302 || mediaHeadRes.status === 303) {
      const location = mediaHeadRes.headers.get('location');
      if (location) {
        return NextResponse.redirect(location, { status: 307 });
      }
    }

    // ── Step 3: Last resort — proxy (original behavior) ────────────────────────
    // Fetch metadata for filename/mimeType
    const metaFallbackUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType`;
    const metaFallbackFetch = await fetch(metaFallbackUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const meta = metaFallbackFetch.ok ? await metaFallbackFetch.json() : {};

    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const gDriveRes = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!gDriveRes.ok) {
      throw new Error(`Google Drive API error: ${gDriveRes.statusText}`);
    }

    const responseHeaders = new Headers(gDriveRes.headers);
    if (meta.mimeType) responseHeaders.set('Content-Type', meta.mimeType);

    const disposition = inline ? 'inline' : 'attachment';
    const safeName = meta.name ? encodeURIComponent(meta.name) : 'archivo';
    responseHeaders.set('Content-Disposition', `${disposition}; filename*=UTF-8''${safeName}`);
    responseHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');

    return new NextResponse(gDriveRes.body, {
      status: gDriveRes.status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error('API /api/files/[fileId] GET error:', error);
    return new NextResponse('Error fetching file', { status: 500 });
  }
}
