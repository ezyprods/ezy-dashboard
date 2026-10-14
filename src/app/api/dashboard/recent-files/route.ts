export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { NextResponse } from 'next/server';
import { getDriveService } from '@/lib/drive';
import { DRIVE_ROOT_FOLDER_ID, isSystemOrSpecialFolder } from '@/lib/constants';

type FolderInfo = { name: string; parent?: string };

/** Every folder's name and parent, so each file can be traced up to its artist folder. */
async function listAllFolders(drive: ReturnType<typeof getDriveService>): Promise<Map<string, FolderInfo>> {
  const folders = new Map<string, FolderInfo>();
  let pageToken: string | undefined;
  for (let page = 0; page < 20; page++) {
    const res: any = await drive.files.list({
      q: `mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'nextPageToken, files(id, name, parents)',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      pageSize: 1000,
      pageToken,
    });
    for (const f of res.data.files || []) folders.set(f.id, { name: f.name || '', parent: f.parents?.[0] });
    pageToken = res.data.nextPageToken || undefined;
    if (!pageToken) break;
  }
  return folders;
}

/** Artist folder (a direct child of the Drive root) that contains this parent folder, if any. */
function artistOf(parentId: string | undefined, folders: Map<string, FolderInfo>): { id: string; name: string } | null {
  let current = parentId;
  for (let depth = 0; current && depth < 30; depth++) {
    const info = folders.get(current);
    if (!info) return null;
    if (info.parent === DRIVE_ROOT_FOLDER_ID) return isSystemOrSpecialFolder(info.name) ? null : { id: current, name: info.name };
    current = info.parent;
  }
  return null;
}

export async function GET() {
  try {
    const drive = getDriveService();
    const query = `mimeType contains 'audio/' and trashed=false`;

    const [response, folders]: [any, Map<string, FolderInfo>] = await Promise.all([
      drive.files.list({
        q: query,
        fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, parents, appProperties)',
        orderBy: 'createdTime desc',
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        pageSize: 1000,
      }),
      // The artist is a nice-to-have: never let it break the list
      listAllFolders(drive).catch(err => {
        console.warn('API /dashboard/recent-files: could not list folders:', err.message);
        return new Map<string, FolderInfo>();
      }),
    ]);

    const files = response.data.files || [];
    const formattedFiles: any[] = [];

    for (const file of files) {
      const expiresAt = file.appProperties?.expiresAt ? parseInt(file.appProperties.expiresAt, 10) : null;
      if (expiresAt && expiresAt < Date.now()) {
        drive.files.delete({ fileId: file.id!, supportsAllDrives: true }).catch(console.error);
        continue;
      }

      const artist = artistOf(file.parents?.[0], folders);
      formattedFiles.push({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: parseInt(file.size || '0', 10),
        createdTime: file.createdTime,
        modifiedTime: file.modifiedTime,
        webViewLink: file.webViewLink,
        webContentLink: file.webContentLink,
        url: file.webContentLink || file.webViewLink,
        parents: file.parents || [],
        expiresAt: expiresAt || undefined,
        bpm: file.appProperties?.bpm || undefined,
        key: file.appProperties?.key || undefined,
        artistId: artist?.id,
        artistName: artist?.name,
      });
    }

    return NextResponse.json({ files: formattedFiles });
  } catch (error: any) {
    if (error.message?.includes('invalid_grant') || error.message?.includes('credentials')) {
      return NextResponse.json({ files: [], needsAuth: true, error: 'Auth required' });
    }
    console.error('API /dashboard/recent-files GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch recent files', details: error.message }, { status: 500 });
  }
}
