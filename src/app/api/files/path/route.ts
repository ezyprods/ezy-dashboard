export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getDriveService } from '@/lib/drive';

/**
 * Resolves the breadcrumb trail of a folder inside an explorer root.
 * GET /api/files/path?folderId=<id>&rootId=<id>
 * → { path: [{ id, name }, ...] } from the root (first) down to folderId (last).
 * `insideRoot` is false when the folder does not live under rootId.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get('folderId');
    const rootId = searchParams.get('rootId');

    if (!folderId || !rootId) {
      return NextResponse.json({ error: 'Missing folderId or rootId' }, { status: 400 });
    }

    const drive = getDriveService();
    const trail: { id: string; name: string }[] = [];
    let currentId: string | undefined = folderId;
    let insideRoot = false;

    for (let depth = 0; currentId && depth < 25; depth++) {
      const res: any = await drive.files.get({
        fileId: currentId,
        fields: 'id, name, parents',
        supportsAllDrives: true,
      });
      trail.unshift({ id: res.data.id!, name: res.data.name || 'Carpeta' });
      if (currentId === rootId) {
        insideRoot = true;
        break;
      }
      currentId = res.data.parents?.[0];
    }

    return NextResponse.json({ path: insideRoot ? trail : [], insideRoot });
  } catch (error: any) {
    console.error('API /files/path GET error:', error);
    return NextResponse.json({ error: 'Failed to resolve folder path', details: error.message }, { status: 500 });
  }
}
