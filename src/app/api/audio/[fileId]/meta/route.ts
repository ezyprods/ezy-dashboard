import { NextResponse, NextRequest } from 'next/server';
import { getDriveService } from '@/lib/drive';

export const dynamic = 'force-dynamic';

/**
 * What public/sw.js needs before it can ask for chunks of a file. `rev` changes
 * only when the content does (not on a rename or a permission change), and it is
 * part of the chunk URL, so an overwritten file never plays old audio. Never cached,
 * for that same reason; it is a few hundred bytes per track played.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  try {
    const { fileId } = await params;
    const drive = getDriveService();
    const { data } = await drive.files.get({
      fileId,
      fields: 'size, mimeType, md5Checksum',
      supportsAllDrives: true,
    });

    return NextResponse.json(
      { size: Number(data.size || 0), mimeType: data.mimeType || 'audio/mpeg', rev: data.md5Checksum || null },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error: any) {
    console.error('API /audio/[fileId]/meta error:', error?.message || error);
    return NextResponse.json({ error: 'Failed to fetch file metadata' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
}
