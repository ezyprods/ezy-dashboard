import { NextResponse, NextRequest } from 'next/server';
import { getDriveService } from '@/lib/drive';

// Cache metadata in memory to avoid double API calls
const metadataCache = new Map<string, { mimeType: string; size: number; name: string; cachedAt: number }>();
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

async function getFileMetadata(fileId: string) {
  const cached = metadataCache.get(fileId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) return cached;
  
  const drive = getDriveService();
  const res = await drive.files.get({ fileId, fields: 'mimeType, size, name' });
  const meta = {
    mimeType: res.data.mimeType || 'audio/mpeg',
    size: Number(res.data.size || 0),
    name: res.data.name || 'audio',
    cachedAt: Date.now(),
  };
  metadataCache.set(fileId, meta);
  return meta;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  try {
    const { fileId } = await params;
    
    const drive = getDriveService();
    const meta = await getFileMetadata(fileId);
    
    const rangeHeader = request.headers.get('range');
    
    const response = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream', headers: rangeHeader ? { Range: rangeHeader } : undefined }
    );

    const stream = new ReadableStream({
      start(controller) {
        response.data.on('data', (chunk: any) => controller.enqueue(new Uint8Array(chunk)));
        response.data.on('end', () => controller.close());
        response.data.on('error', (err: any) => controller.error(err));
      },
      cancel() {
        response.data.destroy();
      }
    });

    const headers = new Headers();
    headers.set('Content-Type', meta.mimeType);
    headers.set('Accept-Ranges', 'bytes');
    
    if (response.headers['content-range']) headers.set('Content-Range', response.headers['content-range']);
    if (response.headers['content-length']) headers.set('Content-Length', response.headers['content-length']);
    
    const status = response.status || 200;

    return new NextResponse(stream, { status, headers });

  } catch (error: any) {
    console.error('API /audio/[fileId] error:', error);
    return new NextResponse('Error fetching audio file', { status: 500 });
  }
}
