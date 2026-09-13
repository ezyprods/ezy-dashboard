import { NextResponse } from 'next/server';
import { findAndReadJsonFile, saveJsonFile, getDriveService } from '@/lib/drive';
import { DRIVE_ROOT_FOLDER_ID } from '@/lib/constants';
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
      supportsAllDrives: true,
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

    let config = await findAndReadJsonFile<ArtistConfig>('artist_config.json', id);
    
    if (!config) {
      // Auto-inicializar si no existía el json en Drive
      const drive = getDriveService();
      const folderRes = await drive.files.get({
        fileId: id,
        fields: 'id, name, createdTime',
      }).catch(() => null);

      config = {
        id: id,
        name: folderRes?.data?.name || body.name || 'Artista',
        genre: [],
        tags: [],
        services: [],
        status: 'active',
        createdAt: folderRes?.data?.createdTime || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    // Never persist computed/joined fields sent back by the client
    const { driveFolderId: _drive, activeProject: _active, projectCount: _count, photoUrl: _photo, ...safeBody } = body as any;
    const updatedConfig: ArtistConfig = {
      ...config,
      ...safeBody,
      id,
      updatedAt: new Date().toISOString(),
    };

    await saveJsonFile('artist_config.json', updatedConfig, id);

    // Actualizar la base de datos global
    const artistsDb = (await findAndReadJsonFile<ArtistConfig[]>('ezy_artists_db.json', DRIVE_ROOT_FOLDER_ID)) || [];
    const index = artistsDb.findIndex(a => a.id === id);
    if (index !== -1) {
      artistsDb[index] = updatedConfig;
    } else {
      artistsDb.push(updatedConfig);
    }
    await saveJsonFile('ezy_artists_db.json', artistsDb, DRIVE_ROOT_FOLDER_ID);

    // Opcional: si el nombre cambia, renombrar la carpeta en Drive
    if (body.name && body.name !== config.name) {
      const drive = getDriveService();
      await drive.files.update({
        fileId: id,
        requestBody: {
          name: body.name,
        },
        supportsAllDrives: true,
      });
    }

    return NextResponse.json({ artist: { ...updatedConfig, driveFolderId: id } });
  } catch (error: any) {
    console.error('API /artists/[id] PUT error:', error);
    return NextResponse.json({ error: 'Failed to update artist', details: error.message }, { status: 500 });
  }
}

// Eliminar un artista: su carpeta se mueve a la papelera de Google Drive (recuperable)
// y se quita de la base de datos global de artistas.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id || id === DRIVE_ROOT_FOLDER_ID) {
      return NextResponse.json({ error: 'Artista no válido' }, { status: 400 });
    }

    const drive = getDriveService();

    // Safety check: only direct children of the studio root folder can be deleted as artists
    const folderRes = await drive.files.get({ fileId: id, fields: 'id, parents, mimeType', supportsAllDrives: true });
    const isArtistFolder = folderRes.data.mimeType === 'application/vnd.google-apps.folder'
      && (folderRes.data.parents || []).includes(DRIVE_ROOT_FOLDER_ID);
    if (!isArtistFolder) {
      return NextResponse.json({ error: 'La carpeta no corresponde a un artista' }, { status: 400 });
    }

    await drive.files.update({ fileId: id, requestBody: { trashed: true }, supportsAllDrives: true });

    try {
      const artistsDb = (await findAndReadJsonFile<ArtistConfig[]>('ezy_artists_db.json', DRIVE_ROOT_FOLDER_ID)) || [];
      const filtered = artistsDb.filter(a => a.id !== id);
      if (filtered.length !== artistsDb.length) {
        await saveJsonFile('ezy_artists_db.json', filtered, DRIVE_ROOT_FOLDER_ID);
      }
    } catch (dbErr) {
      console.warn('Warning: could not update ezy_artists_db.json after deleting artist', dbErr);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.code === 404 || error?.status === 404) {
      return NextResponse.json({ success: true, message: 'La carpeta ya no existía' });
    }
    console.error('API /artists/[id] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete artist', details: error.message }, { status: 500 });
  }
}
