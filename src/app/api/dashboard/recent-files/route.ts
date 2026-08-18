export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { NextResponse } from 'next/server';
import { getDriveService } from '@/lib/drive';

export async function GET() {
  try {
    const drive = getDriveService();
    const query = `mimeType contains 'audio/' and trashed=false`;

    const response: any = await drive.files.list({
      q: query,
      fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, parents, appProperties)',
      orderBy: 'createdTime desc',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      pageSize: 1000,
    });

    const files = response.data.files || [];
    const formattedFiles: any[] = [];

    for (const file of files) {
      const expiresAt = file.appProperties?.expiresAt ? parseInt(file.appProperties.expiresAt, 10) : null;
      if (expiresAt && expiresAt < Date.now()) {
        drive.files.delete({ fileId: file.id!, supportsAllDrives: true }).catch(console.error);
        continue;
      }

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
