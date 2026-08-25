import { NextResponse, NextRequest } from 'next/server';
import { getDriveService, listFolders } from '@/lib/drive';
import { DRIVE_ROOT_FOLDER_ID, isSystemOrSpecialFolder } from '@/lib/constants';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get('fileId');
    let folderId = searchParams.get('folderId');

    if (!fileId && !folderId) {
      return NextResponse.json({ error: 'Missing fileId or folderId' }, { status: 400 });
    }

    const drive = getDriveService();

    // 1. Load artists database
    let artistsDb: any = { artists: [] };
    try {
      const dbPath = path.join(process.cwd(), 'ezy_artists_db.json');
      if (fs.existsSync(dbPath)) {
        const raw = fs.readFileSync(dbPath, 'utf8');
        const parsed = JSON.parse(raw);
        artistsDb = Array.isArray(parsed) ? { artists: parsed } : (parsed.artists ? parsed : { artists: [] });
      }
    } catch (e) {
      console.warn("Failed to load artists DB from disk:", e);
    }

    const folderToArtist = new Map<string, any>();
    (artistsDb.artists || []).forEach((a: any) => {
      const id = a.driveFolderId || a.id;
      if (id) folderToArtist.set(id, a);
    });

    let fileName = '';
    let targetFolderId = folderId;

    // 2. If fileId provided, get its name and parent
    if (fileId) {
      try {
        const fileRes = await drive.files.get({
          fileId,
          fields: 'id, name, parents',
          supportsAllDrives: true
        });
        fileName = fileRes.data.name || '';
        if (!targetFolderId && fileRes.data.parents && fileRes.data.parents.length > 0) {
          targetFolderId = fileRes.data.parents[0];
        }
      } catch (err: any) {
        console.warn('Could not fetch file in resolve-location:', err.message);
      }
    }

    // 3. Traverse upwards from targetFolderId to find matching artist
    let currentId = targetFolderId;
    let resolvedArtist: any = null;
    let targetFolderName = '';
    const visited = new Set<string>();

    while (currentId && !visited.has(currentId) && visited.size < 15) {
      visited.add(currentId);

      // Check if currentId directly matches an artist
      if (folderToArtist.has(currentId)) {
        resolvedArtist = folderToArtist.get(currentId);
        break;
      }

      try {
        const folderRes = await drive.files.get({
          fileId: currentId,
          fields: 'id, name, parents',
          supportsAllDrives: true
        });
        const folderData = folderRes.data;

        if (currentId === targetFolderId) {
          targetFolderName = folderData.name || '';
        }

        // Check if parent is DRIVE_ROOT_FOLDER_ID -> this folder is the artist folder
        if (folderData.parents && folderData.parents.includes(DRIVE_ROOT_FOLDER_ID)) {
          if (!isSystemOrSpecialFolder(folderData.name)) {
            resolvedArtist = {
              id: folderData.id,
              name: folderData.name,
              driveFolderId: folderData.id
            };
          }
          break;
        }

        if (folderData.parents && folderData.parents.length > 0) {
          currentId = folderData.parents[0];
        } else {
          break;
        }
      } catch (err: any) {
        console.warn('Traversing parent folder error:', err.message);
        break;
      }
    }

    // If still not matched, check root artists list from Drive
    if (!resolvedArtist && currentId) {
      try {
        const rootFolders = await listFolders(DRIVE_ROOT_FOLDER_ID);
        const match = rootFolders.find(f => (f.id === currentId || f.id === targetFolderId) && !isSystemOrSpecialFolder(f.name));
        if (match) {
          resolvedArtist = {
            id: match.id,
            name: match.name,
            driveFolderId: match.id
          };
        }
      } catch {}
    }

    if (!resolvedArtist) {
      return NextResponse.json({
        found: false,
        folderId: targetFolderId,
        fileId: fileId || undefined,
        fileName: fileName || undefined
      });
    }

    const artistId = resolvedArtist.id || resolvedArtist.driveFolderId;
    const finalUrl = `/artists/${artistId}?tab=files${targetFolderId ? `&folderId=${encodeURIComponent(targetFolderId)}` : ''}${fileId ? `&fileId=${encodeURIComponent(fileId)}` : ''}`;

    return NextResponse.json({
      found: true,
      artistId,
      artistName: resolvedArtist.name || 'Artista',
      folderId: targetFolderId,
      folderName: targetFolderName,
      fileId: fileId || undefined,
      fileName: fileName || undefined,
      url: finalUrl
    });

  } catch (error: any) {
    console.error('API /api/files/resolve-location error:', error);
    return NextResponse.json({ error: 'Failed to resolve location', details: error.message }, { status: 500 });
  }
}
