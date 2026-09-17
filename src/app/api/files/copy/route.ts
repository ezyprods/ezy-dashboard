export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getDriveService } from '@/lib/drive';

/**
 * Duplicates a file (Drive cannot copy folders).
 * POST { fileId, parentId?, name? } → { file }
 */
export async function POST(request: Request) {
  try {
    const { fileId, parentId, name } = await request.json();
    if (!fileId) {
      return NextResponse.json({ error: 'Missing fileId' }, { status: 400 });
    }

    const drive = getDriveService();
    const original = await drive.files.get({
      fileId,
      fields: 'name, mimeType, parents, appProperties',
      supportsAllDrives: true,
    });

    if (original.data.mimeType === 'application/vnd.google-apps.folder') {
      return NextResponse.json({ error: 'Las carpetas no se pueden duplicar' }, { status: 400 });
    }

    let copyName = typeof name === 'string' && name.trim() ? name.trim() : '';
    if (!copyName) {
      const originalName = original.data.name || 'archivo';
      const dot = originalName.lastIndexOf('.');
      copyName = dot > 0
        ? `${originalName.slice(0, dot)} (copia)${originalName.slice(dot)}`
        : `${originalName} (copia)`;
    }

    // A scheduled deletion should not be inherited by the copy
    const appProperties = { ...(original.data.appProperties || {}) } as Record<string, string | null>;
    if (appProperties.expiresAt || appProperties.isTemporary) {
      appProperties.expiresAt = null;
      appProperties.isTemporary = null;
    }

    const res = await drive.files.copy({
      fileId,
      supportsAllDrives: true,
      fields: 'id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, appProperties, thumbnailLink, starred, shared, fileExtension',
      requestBody: {
        name: copyName,
        parents: [parentId || original.data.parents?.[0]].filter(Boolean) as string[],
        appProperties: appProperties as any,
      },
    });

    return NextResponse.json({ success: true, file: { ...res.data, parentFolderId: parentId || original.data.parents?.[0] } });
  } catch (error: any) {
    console.error('API /files/copy POST error:', error);
    return NextResponse.json({ error: 'Failed to copy file', details: error.message }, { status: 500 });
  }
}
