import { NextResponse, NextRequest } from 'next/server';
import { getDriveService } from '@/lib/drive';
import fs from 'fs';
import path from 'path';

export async function GET(request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  try {
    const { fileId } = await params;
    const drive = getDriveService();

    // Load artists DB to map folder IDs to artist profiles
    let artistsDb: any = { artists: [] };
    try {
      const dbPath = path.join(process.cwd(), 'ezy_artists_db.json');
      if (fs.existsSync(dbPath)) {
        artistsDb = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      }
    } catch (e) {
      console.warn("Failed to load artists DB", e);
    }
    
    const folderToArtist = new Map<string, any>();
    artistsDb.artists.forEach((a: any) => {
      if (a.driveFolderId) folderToArtist.set(a.driveFolderId, a);
    });

    // Resolve breadcrumbs recursively
    const pathSegments: any[] = [];
    let currentId = fileId;
    let fileName = '';
    let artistName = '';

    while (currentId) {
      try {
        const fileRes = await drive.files.get({
          fileId: currentId,
          fields: 'id, name, parents',
          supportsAllDrives: true
        });
        
        const file = fileRes.data;
        if (currentId === fileId) {
          fileName = file.name || '';
        } else {
          // It's a folder (breadcrumb)
          const artist = folderToArtist.get(currentId);
          if (artist) {
            artistName = artist.name;
            pathSegments.unshift({
              name: artist.name,
              url: `/artists/${artist.id}`
            });
            break; // Stop at artist folder
          } else {
            pathSegments.unshift({
              name: file.name,
              url: `https://drive.google.com/drive/folders/${file.id}`
            });
          }
        }

        if (file.parents && file.parents.length > 0) {
          currentId = file.parents[0];
        } else {
          break;
        }
      } catch (e) {
        console.warn("Error resolving parent:", currentId, e);
        break;
      }
    }

    pathSegments.unshift({ name: 'Dashboard', url: '/' });
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
