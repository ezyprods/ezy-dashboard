import { NextResponse } from 'next/server';
import { getDriveService } from '@/lib/drive';

export async function GET(request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  try {
    const resolvedParams = await params;
    const { fileId } = resolvedParams;

    const drive = getDriveService();

    // Obtener los metadatos del archivo para saber el tamaño y el tipo
    const metadata = await drive.files.get({
      fileId,
      fields: 'mimeType, size, name',
    });

    const { mimeType, size, name } = metadata.data;

    // Obtener el stream del archivo
    const fileStream = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    // Preparar cabeceras para streaming de audio
    const headers = new Headers();
    headers.set('Content-Type', mimeType || 'audio/mpeg');
    if (size) headers.set('Content-Length', size);
    headers.set('Content-Disposition', `inline; filename="${name}"`);
    headers.set('Accept-Ranges', 'bytes');

    // @ts-ignore - node-fetch stream compatibility
    return new NextResponse(fileStream.data, {
      status: 200,
      headers,
    });
  } catch (error: any) {
    console.error('API /audio/[fileId] error:', error);
    return new NextResponse('Error fetching audio file', { status: 500 });
  }
}
