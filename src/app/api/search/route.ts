export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getDriveService, listFolders, findAndReadJsonFile } from '@/lib/drive';
import { DRIVE_ROOT_FOLDER_ID } from '@/lib/constants';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').toLowerCase().trim();
    
    if (!q || q.length < 2) {
      return NextResponse.json({ artists: [], files: [], projects: [] });
    }

    const drive = getDriveService();

    // Search artists (folders at root level)
    const artistFoldersPromise = listFolders(DRIVE_ROOT_FOLDER_ID).catch(() => []);

    // Search files in Drive using fullText search
    const driveSearchPromise = drive.files.list({
      q: `name contains '${q.replace(/'/g, "\\'")}' and trashed=false and mimeType != 'application/vnd.google-apps.folder'`,
      fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink, appProperties)',
      orderBy: 'modifiedTime desc',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      pageSize: 20,
    }).catch(() => ({ data: { files: [] } }));

    const [artistFolders, driveSearchRes] = await Promise.all([artistFoldersPromise, driveSearchPromise]);

    // Filter artists
    const matchedArtists = artistFolders
      .filter(f => (f.name || '').toLowerCase().includes(q))
      .slice(0, 8)
      .map(f => ({ id: f.id!, name: f.name! }));

    // Process drive file results
    const SYSTEM_FILES = ['artist_config.json', 'project_config.json', 'release_config.json', 'notes.json', 'payments.json', 'payments_db.json', 'matrices.json', 'portal_config.json', 'tasks.json'];
    
    const allFiles = (driveSearchRes.data.files || [])
      .filter(f => {
        const name = f.name || '';
        if (SYSTEM_FILES.includes(name)) return false;
        if (f.mimeType?.includes('json')) return false;
        return true;
      });

    const audioFiles = allFiles
      .filter(f => f.mimeType?.includes('audio') || /\.(mp3|wav|flac|m4a|ogg|aiff)$/i.test(f.name || ''))
      .slice(0, 8)
      .map(f => ({
        id: f.id!,
        name: f.name!,
        mimeType: f.mimeType!,
        modifiedTime: f.modifiedTime,
        bpm: f.appProperties?.bpm || null,
        key: f.appProperties?.key || null,
        isAudio: true,
      }));

    const otherFiles = allFiles
      .filter(f => !(f.mimeType?.includes('audio') || /\.(mp3|wav|flac|m4a|ogg|aiff)$/i.test(f.name || '')))
      .slice(0, 5)
      .map(f => ({
        id: f.id!,
        name: f.name!,
        mimeType: f.mimeType!,
        modifiedTime: f.modifiedTime,
        webViewLink: f.webViewLink,
        isAudio: false,
      }));

    return NextResponse.json({
      artists: matchedArtists,
      audioFiles,
      otherFiles,
    });
  } catch (error: any) {
    console.error('Search API error:', error);
    return NextResponse.json({ artists: [], audioFiles: [], otherFiles: [], error: error.message }, { status: 500 });
  }
}
