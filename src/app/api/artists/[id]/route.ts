import { NextResponse } from 'next/server';
import { findAndReadJsonFile, saveJsonFile, getDriveService } from '@/lib/drive';
import type { Artist, ArtistConfig } from '@/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

// Obtener detalle de un artista
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    // Obtener información básica de la carpeta
    const drive = getDriveService();
    const folderRes = await drive.files.get({
      fileId: id,
      fields: 'id, name, createdTime',
    });

    // Intentar leer el json
    const config = await findAndReadJsonFile<ArtistConfig>('artist_config.json', id);

    let artist: Artist;

    if (config) {
      artist = {
        ...config,
        driveFolderId: id,
      };
    } else {
      // Artista no inicializado (carpeta antigua de Drive) -> Auto-inicializamos
      artist = {
        id: id,
        name: folderRes.data.name!,
        genre: [],
        tags: [],
        services: [],
        status: 'active',
        createdAt: folderRes.data.createdTime || new Date().toISOString(),
        updatedAt: folderRes.data.createdTime || new Date().toISOString(),
        driveFolderId: id,
      };
      
      // Guardar en background el json para auto-sincronizar
      await saveJsonFile('artist_config.json', {
        id: artist.id,
        name: artist.name,
        genre: artist.genre,
        tags: artist.tags,
        services: artist.services,
        status: artist.status,
        createdAt: artist.createdAt,
        updatedAt: artist.updatedAt
      }, id);
    }

    return NextResponse.json({ artist });
  } catch (error: any) {
    console.error('API /artists/[id] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch artist details', details: error.message }, { status: 500 });
  }
}

// Actualizar un artista
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;
    const body: Partial<ArtistConfig> = await request.json();

    const config = await findAndReadJsonFile<ArtistConfig>('artist_config.json', id);
    
    if (!config) {
      return NextResponse.json({ error: 'Artist config not found. Sync folder first.' }, { status: 404 });
    }

    const updatedConfig: ArtistConfig = {
      ...config,
      ...body,
      updatedAt: new Date().toISOString(),
    };

    await saveJsonFile('artist_config.json', updatedConfig, id);

    // Actualizar la base de datos global
    const artistsDb = (await findAndReadJsonFile<ArtistConfig[]>('ezy_artists_db.json', process.env.DRIVE_ROOT_FOLDER_ID!)) || [];
    const index = artistsDb.findIndex(a => a.id === id);
    if (index !== -1) {
      artistsDb[index] = updatedConfig;
    } else {
      artistsDb.push(updatedConfig);
    }
    await saveJsonFile('ezy_artists_db.json', artistsDb, process.env.DRIVE_ROOT_FOLDER_ID!);

    // Opcional: si el nombre cambia, renombrar la carpeta en Drive
    if (body.name && body.name !== config.name) {
      const drive = getDriveService();
      await drive.files.update({
        fileId: id,
        requestBody: {
          name: body.name,
        },
      });
    }

    return NextResponse.json({ artist: { ...updatedConfig, driveFolderId: id } });
  } catch (error: any) {
    console.error('API /artists/[id] PUT error:', error);
    return NextResponse.json({ error: 'Failed to update artist', details: error.message }, { status: 500 });
  }
}
