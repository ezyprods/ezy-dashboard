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
    const redirectUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    return NextResponse.redirect(redirectUrl, 302);
  } catch (error: any) {
    console.error('API /audio/[fileId] error:', error);
    return new NextResponse('Error fetching audio file', { status: 500 });
  }
}
