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

    const inline = request.nextUrl.searchParams.get('inline') === 'true';
    const accessToken = await getGoogleAccessToken();

    // 1. Fetch metadata for filename, mimeType, webViewLink
    const metaUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType,size,webViewLink&supportsAllDrives=true`;
    const metaFetch = await fetch(metaUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const meta = metaFetch.ok ? await metaFetch.json() : {};

    // For Google Docs/Sheets/Slides inline view, redirect to Google viewer
    if (inline && meta.mimeType?.startsWith('application/vnd.google-apps.') && meta.webViewLink) {
      return NextResponse.redirect(meta.webViewLink, { status: 307 });
    }

    // 2. Stream binary/media file with Range support
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
    responseHeaders.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');

    return new NextResponse(gDriveRes.body, {
      status: gDriveRes.status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error('API /api/files/[fileId] GET error:', error);
    return new NextResponse(error?.message || 'Error fetching file', { status: 500 });
  }
}

