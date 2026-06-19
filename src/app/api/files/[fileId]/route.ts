import { NextResponse, NextRequest } from 'next/server';
import { getDriveService } from '@/lib/drive';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params;
    const inline = request.nextUrl.searchParams.get('inline') === 'true';
    const drive = getDriveService();

    // First get metadata to know mimeType and name
    const metadata = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType',
      supportsAllDrives: true,
    });

    const file = metadata.data;

    // Then get media stream
    const response = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'stream' }
    );

    const stream = response.data as unknown as NodeJS.ReadableStream;
    const iterator = stream[Symbol.asyncIterator]();

    // Convert NodeJS Readable to Web ReadableStream
    const readable = new ReadableStream({
      async pull(controller) {
        try {
          const { value, done } = await iterator.next();
          if (done) {
            controller.close();
          } else {
            controller.enqueue(new Uint8Array(value as Buffer));
          }
        } catch (error) {
          controller.error(error);
        }
      },
      cancel() {
        if (typeof (stream as any).destroy === 'function') {
          (stream as any).destroy();
        }
      }
    });

    const headers = new Headers();
    if (file.mimeType) headers.set('Content-Type', file.mimeType);
    
    // Si queremos inline, lo mostramos en el navegador (si lo soporta)
    const disposition = inline ? 'inline' : 'attachment';
    const safeName = file.name ? encodeURIComponent(file.name) : 'archivo';
    headers.set('Content-Disposition', `${disposition}; filename*=UTF-8''${safeName}`);

    return new NextResponse(readable, {
      status: 200,
      headers,
    });
  } catch (error: any) {
    console.error('API /api/files/[fileId] GET error:', error);
    return new NextResponse('Error fetching file', { status: 500 });
  }
}
