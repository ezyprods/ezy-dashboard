export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getDriveService } from '@/lib/drive';

const FIELDS = 'nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, appProperties, thumbnailLink, parents, explicitlyTrashed, trashedTime, fileExtension)';

/**
 * Lists the items that were explicitly moved to the trash from any of the given folders.
 * POST { folderIds: string[] } → { items }
 */
export async function POST(request: Request) {
  try {
    const { folderIds } = await request.json();
    if (!Array.isArray(folderIds) || folderIds.length === 0) {
      return NextResponse.json({ error: 'Missing folderIds' }, { status: 400 });
    }

    const ids = Array.from(new Set(folderIds.filter((id: unknown) => typeof id === 'string' && /^[\w-]+$/.test(id)))) as string[];
    const drive = getDriveService();

    // Keep each query short: Drive rejects very long `q` expressions
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));

    const results = await Promise.all(chunks.map(async (chunk) => {
      const parentsQuery = chunk.map(id => `'${id}' in parents`).join(' or ');
      const all: any[] = [];
      let pageToken: string | undefined = undefined;
      do {
        const res: any = await drive.files.list({
          q: `trashed=true and (${parentsQuery})`,
          fields: FIELDS,
          includeItemsFromAllDrives: true,
          supportsAllDrives: true,
          pageSize: 1000,
          pageToken,
        });
        all.push(...(res.data.files || []));
        pageToken = res.data.nextPageToken || undefined;
      } while (pageToken);
      return all;
    }));

    const idSet = new Set(ids);
    const items = results
      .flat()
      .filter(f => f.explicitlyTrashed && !f.name?.endsWith('.json'))
      .map(f => ({
        ...f,
        parentFolderId: (f.parents || []).find((p: string) => idSet.has(p)) || f.parents?.[0],
        bpm: f.appProperties?.bpm || null,
        key: f.appProperties?.key || null,
      }));

    return NextResponse.json({ items });
  } catch (error: any) {
    console.error('API /files/trash POST error:', error);
    return NextResponse.json({ error: 'Failed to list trash', details: error.message }, { status: 500 });
  }
}
