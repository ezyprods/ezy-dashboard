import { NextResponse, NextRequest } from 'next/server';
import { getDriveService } from '@/lib/drive';
import { Readable } from 'stream';

export async function GET(request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  try {
    const { fileId } = await params;
    const drive = getDriveService();
    
    // 1. Get exact file size and mime type
    const metaRes = await drive.files.get({ fileId, fields: 'size, mimeType' });
    const fileSize = Number(metaRes.data.size || 0);
    const mimeType = metaRes.data.mimeType || 'audio/mpeg';

    if (!fileSize) {
      return new NextResponse('File size unknown', { status: 400 });
    }

    // 2. Parse Range header
    const rangeHeader = request.headers.get('range');
    
    let start = 0;
    let end = fileSize - 1;
    let status = 200;

    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      start = parseInt(parts[0], 10);
      end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      status = 206;
    }

    const chunksize = (end - start) + 1;

    // 3. Request specific range from Google Drive
    const response = await drive.files.get(
      { fileId, alt: 'media' },
      { 
        responseType: 'stream', 
        headers: { Range: `bytes=${start}-${end}` } 
      }
    );

    // 4. Convert Node Stream to Web Stream using async iterator to handle backpressure natively
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of response.data) {
            controller.enqueue(new Uint8Array(chunk));
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
      cancel() {
        if (typeof response.data.destroy === 'function') {
          response.data.destroy();
        }
      }
    });

    // 5. Construct perfect headers for media streaming
    const headers = new Headers();
    headers.set('Content-Type', mimeType);
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Content-Length', chunksize.toString());
    
    if (status === 206) {
      headers.set('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    }

    return new NextResponse(stream as any, { status, headers });

  } catch (error: any) {
    console.error('API /audio/[fileId] error:', error);
    return new NextResponse('Error fetching audio stream', { status: 500 });
  }
}


