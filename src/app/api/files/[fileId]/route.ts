import { NextResponse, NextRequest } from 'next/server';
import { getGoogleAccessToken } from '@/lib/googleTokenCache';
import { getDriveService } from '@/lib/drive';

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

    const inline = request.nextUrl.searchParams.get('inline') === 'true';
    const accessToken = await getGoogleAccessToken();

    // 1. Fetch metadata for filename, mimeType, webViewLink, webContentLink, thumbnailLink
    const metaUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType,size,webViewLink,webContentLink,thumbnailLink&supportsAllDrives=true`;
    const metaFetch = await fetch(metaUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const meta = metaFetch.ok ? await metaFetch.json() : {};

    // For Google Docs/Sheets/Slides inline view, redirect to Google viewer
    if (inline && meta.mimeType?.startsWith('application/vnd.google-apps.') && meta.webViewLink) {
      return NextResponse.redirect(meta.webViewLink, { status: 307 });
    }

    // For images with inline view, redirect directly to Google's high-speed global thumbnail CDN
    if (inline && meta.mimeType?.startsWith('image/')) {
      const imgUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w1200`;
      const res = NextResponse.redirect(imgUrl, { status: 307 });
      res.headers.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      return res;
    }

    // 2. For file downloads (!inline): Redirect directly to Google Drive download link.
    // This saves 100% of Fast Origin Transfer on Vercel (0 bytes transferred through Serverless Functions).
    if (!inline) {
      try {
        const drive = getDriveService();
        await drive.permissions.create({
          fileId,
          requestBody: { role: 'reader', type: 'anyone' },
          supportsAllDrives: true,
        });
      } catch (e) {
        // Safe to continue if permission already exists
      }

      const downloadUrl = meta.webContentLink || `https://drive.google.com/uc?export=download&id=${fileId}`;
      const res = NextResponse.redirect(downloadUrl, { status: 307 });
      res.headers.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      return res;
    }

    // 3. Stream binary/media file with Range support (fallback for inline audio/etc.)
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
      });
    }

    const responseHeaders = new Headers();
    const contentType = meta.mimeType || gDriveRes.headers.get('content-type') || 'application/octet-stream';
    const contentRange = gDriveRes.headers.get('content-range');
    const contentLength = gDriveRes.headers.get('content-length') || meta.size;

    responseHeaders.set('Content-Type', contentType);
    responseHeaders.set('Accept-Ranges', 'bytes');
    if (contentRange) responseHeaders.set('Content-Range', contentRange);
    if (contentLength) responseHeaders.set('Content-Length', contentLength);

    const disposition = inline ? 'inline' : 'attachment';
    const safeName = meta.name ? encodeURIComponent(meta.name) : 'archivo';
    responseHeaders.set('Content-Disposition', `${disposition}; filename*=UTF-8''${safeName}`);
    responseHeaders.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');

    return new NextResponse(gDriveRes.body, {
      status: gDriveRes.status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error('API /api/files/[fileId] GET error:', error);
    return new NextResponse(error?.message || 'Error fetching file', { status: 500 });
  }
}


