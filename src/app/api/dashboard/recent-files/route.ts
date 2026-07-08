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
      fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, parents)',
      orderBy: 'modifiedTime desc',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      pageSize: 6,
    });

    const files = response.data.files || [];

    const formattedFiles = files.map((file: any) => ({
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
    }));

    return NextResponse.json({ files: formattedFiles });
  } catch (error: any) {
    if (error.message?.includes('invalid_grant') || error.message?.includes('credentials')) {
      return NextResponse.json({ files: [], needsAuth: true, error: 'Auth required' });
    }
    console.error('API /dashboard/recent-files GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch recent files', details: error.message }, { status: 500 });
  }
}
