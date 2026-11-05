import { NextRequest, NextResponse } from 'next/server';
import { getDriveService } from '@/lib/drive';

export const dynamic = 'force-dynamic';

const FIELDS = 'id, name, mimeType, size, modifiedTime, parents, imageMediaMetadata(width,height), videoMediaMetadata(width,height,durationMillis)';

function toItem(f: any) {
  const isVideo = String(f.mimeType || '').startsWith('video/');
  return {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    size: Number(f.size) || 0,
    modifiedTime: f.modifiedTime,
    width: Number(isVideo ? f.videoMediaMetadata?.width : f.imageMediaMetadata?.width) || 0,
    height: Number(isVideo ? f.videoMediaMetadata?.height : f.imageMediaMetadata?.height) || 0,
    duration: isVideo ? (Number(f.videoMediaMetadata?.durationMillis) || 0) / 1000 : 0,
  };
}

/**
 * Archivos de Drive para el formulario de Instagram:
 *   ?id=<fileId>              datos de un archivo
 *   ?kind=image|video|audio   (&q=texto) los más recientes de ese tipo
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const drive = getDriveService();
    const id = sp.get('id');
    if (id) {
      if (!/^[\w-]{10,}$/.test(id)) return NextResponse.json({ error: 'id' }, { status: 400 });
      const r = await drive.files.get({ fileId: id, fields: FIELDS, supportsAllDrives: true });
      return NextResponse.json({ file: toItem(r.data) });
    }
    const kind = sp.get('kind');
    const mime = kind === 'video' ? 'video/' : kind === 'audio' ? 'audio/' : 'image/';
    const q = (sp.get('q') || '').trim().slice(0, 80).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    let query = `trashed = false and mimeType contains '${mime}'`;
    if (q) query += ` and name contains '${q}'`;
    const r = await drive.files.list({
      q: query,
      fields: `files(${FIELDS})`,
      orderBy: 'modifiedTime desc',
      pageSize: 40,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    return NextResponse.json({ files: (r.data.files || []).map(toItem) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
