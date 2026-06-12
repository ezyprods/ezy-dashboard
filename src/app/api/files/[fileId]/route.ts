import { NextResponse, NextRequest } from 'next/server';
import { getDriveService } from '@/lib/drive';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params;
    const { searchParams } = new URL(request.url);
    const inline = searchParams.get('inline') === 'true';

    const drive = getDriveService();

    // 1. Fetch file metadata
    const metaRes = await drive.files.get({
      fileId,
      fields: 'name, mimeType, size',
      supportsAllDrives: true,
    });

    const name = metaRes.data.name || 'file';
    const mimeType = metaRes.data.mimeType || 'application/octet-stream';
    const size = metaRes.data.size ? Number(metaRes.data.size) : undefined;

    // 2. Fetch file content stream
    const fileRes = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'stream' }
    );

    // Cast the response data to a readable stream
    const stream = fileRes.data as unknown as ReadableStream;

    const headers = new Headers();
    headers.set('Content-Type', mimeType);
    
    if (size !== undefined) {
      headers.set('Content-Length', String(size));
    }

    if (inline) {
      headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(name)}"`);
    } else {
      headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(name)}"`);
    }

    return new NextResponse(stream, {
      status: 200,
      headers,
    });
  } catch (error: any) {
    console.error('API /api/files/[fileId] GET error:', error);
    return new NextResponse('Error fetching file', { status: 500 });
  }
}
