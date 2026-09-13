import { NextResponse, NextRequest } from 'next/server';
import { getDriveService } from '@/lib/drive';
import { DRIVE_ROOT_FOLDER_ID, isSystemOrSpecialFolder } from '@/lib/constants';

export const dynamic = 'force-dynamic';

const MAX_DEPTH = 15;

export async function GET(request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  try {
    const { fileId } = await params;
    const drive = getDriveService();

    // Resolve breadcrumbs walking up the folder tree until the artist folder
    // (the direct child of the Drive root folder of the studio).
    const pathSegments: { name: string; url?: string }[] = [];
    let currentId: string | undefined = fileId;
    let fileName = '';
    let artistName = '';
    const visited = new Set<string>();

    while (currentId && !visited.has(currentId) && visited.size < MAX_DEPTH) {
      visited.add(currentId);
      let file: { id?: string | null; name?: string | null; parents?: string[] | null };
      try {
        const fileRes = await drive.files.get({
          fileId: currentId,
          fields: 'id, name, parents',
          supportsAllDrives: true
        });
        file = fileRes.data;
      } catch (e) {
        console.warn('Error resolving parent:', currentId, e);
        break;
      }

      const parents = file.parents || [];
      const isFile = currentId === fileId;

      if (isFile) {
        fileName = file.name || '';
      } else if (currentId === DRIVE_ROOT_FOLDER_ID) {
        // Reached the studio root without finding an artist folder
        break;
      } else if (parents.includes(DRIVE_ROOT_FOLDER_ID)) {
        // This folder is a direct child of the root → artist (or special) folder
        if (!isSystemOrSpecialFolder(file.name)) {
          artistName = file.name || '';
          pathSegments.unshift({ name: artistName, url: `/artists/${file.id}` });
        } else {
          pathSegments.unshift({ name: file.name || 'Carpeta', url: `https://drive.google.com/drive/folders/${file.id}` });
        }
        break;
      } else {
        pathSegments.unshift({
          name: file.name || 'Carpeta',
          url: `https://drive.google.com/drive/folders/${file.id}`
        });
      }

      currentId = parents[0];
    }

    // If we never found the artist folder the intermediate folders are outside the studio: drop them
    if (!artistName) {
      pathSegments.length = 0;
    }

    pathSegments.unshift({ name: 'Dashboard', url: '/dashboard' });
    pathSegments.push({ name: fileName });

    return NextResponse.json({
      pathSegments,
      artistName,
      name: fileName
    });
  } catch (error: any) {
    console.error('API /audio/[fileId]/info error:', error);
    return NextResponse.json({ error: 'Failed to fetch audio info' }, { status: 500 });
  }
}
