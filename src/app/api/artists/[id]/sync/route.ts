import { NextResponse } from 'next/server';
import { findAndReadJsonFile, saveJsonFile, createFolder, listFolders, getDriveService } from '@/lib/drive';
import { ARTIST_FOLDER_STRUCTURE } from '@/lib/constants';
import type { ArtistConfig } from '@/types';

// Sincronizar (inicializar) una carpeta antigua de Drive
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    const drive = getDriveService();
    const folderRes = await drive.files.get({
      fileId: id,
      fields: 'id, name, createdTime',
    });

    const folderName = folderRes.data.name!;

    // 1. Comprobar subcarpetas existentes
    const existingFolders = await listFolders(id);
    const existingFolderNames = existingFolders.map(f => f.name?.toLowerCase());

    // 2. Crear subcarpetas que falten
    for (const subfolder of ARTIST_FOLDER_STRUCTURE) {
      if (!existingFolderNames.includes(subfolder.toLowerCase())) {
        await createFolder(subfolder, id);
      }
    }

    // 3. Crear artist_config.json base
    const now = new Date().toISOString();
    const newConfig: ArtistConfig = {
      id: id,
      name: folderName,
      genre: [],
      tags: [],
      services: [],
      status: 'active',
      createdAt: folderRes.data.createdTime || now,
      updatedAt: now,
    };

    await saveJsonFile('artist_config.json', newConfig, id);

    // 4. Actualizar la base de datos global de artistas
    const artistsDb = (await findAndReadJsonFile<ArtistConfig[]>('ezy_artists_db.json', process.env.DRIVE_ROOT_FOLDER_ID!)) || [];
    const index = artistsDb.findIndex(a => a.id === id);
    if (index !== -1) {
      artistsDb[index] = newConfig;
    } else {
      artistsDb.push(newConfig);
    }
    await saveJsonFile('ezy_artists_db.json', artistsDb, process.env.DRIVE_ROOT_FOLDER_ID!);

    return NextResponse.json({ success: true, artist: { ...newConfig, driveFolderId: id } });
  } catch (error: any) {
    console.error('API /artists/[id]/sync POST error:', error);
    return NextResponse.json({ error: 'Failed to sync artist folder', details: error.message }, { status: 500 });
  }
}
