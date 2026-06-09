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
    const meta = await getFileMetadata(fileId);
    const drive = getDriveService();

    const rangeHeader = request.headers.get('range');

    if (rangeHeader && meta.size > 0) {
      // Range request — stream a chunk
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : Math.min(start + 1024 * 1024 - 1, meta.size - 1); // 1MB chunks
        const chunkSize = end - start + 1;

        const fileStream = await drive.files.get(
          { fileId, alt: 'media' },
          { responseType: 'arraybuffer', headers: { Range: `bytes=${start}-${end}` } }
        );

        return new NextResponse(fileStream.data as ArrayBuffer, {
          status: 206,
          headers: {
            'Content-Type': meta.mimeType,
            'Content-Length': String(chunkSize),
            'Content-Range': `bytes ${start}-${end}/${meta.size}`,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'public, max-age=86400, immutable',
          },
        });
      }
    }

    // Full file request
    const fileStream = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );

    return new NextResponse(fileStream.data as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': meta.mimeType,
        'Content-Length': String(meta.size),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=86400, immutable',
        'Content-Disposition': `inline; filename="${meta.name}"`,
      },
    });
  } catch (error: any) {
    console.error('API /audio/[fileId] error:', error);
    return new NextResponse('Error fetching audio file', { status: 500 });
  }
}
