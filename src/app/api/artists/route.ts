import { NextResponse } from 'next/server';
import { listFolders, findAndReadJsonFile, createFolder, saveJsonFile } from '@/lib/drive';
import { DRIVE_ROOT_FOLDER_ID, ARTIST_FOLDER_STRUCTURE } from '@/lib/constants';
import type { Artist, ArtistConfig, CreateArtistInput } from '@/types';

export async function GET() {
  try {
    // Ejecutar ambas peticiones en paralelo para reducir el tiempo de carga a la mitad
    const [folders, artistsDbResult] = await Promise.all([
      listFolders(DRIVE_ROOT_FOLDER_ID),
      findAndReadJsonFile<ArtistConfig[]>('ezy_artists_db.json', DRIVE_ROOT_FOLDER_ID).catch(() => null)
    ]);
    
    const artistsDb = artistsDbResult || [];
    
    // 3. Cruzar datos (Extremadamente rápido)
    const validArtists = folders.map(folder => {
      const syncedData = artistsDb.find(a => a.id === folder.id);
      
      if (syncedData) {
        return {
          ...syncedData,
          driveFolderId: folder.id!,
        } as Artist;
      }
      
      // Artista no sincronizado (carpeta antigua)
      return {
        id: folder.id!,
        name: folder.name!,
        genre: [],
        tags: [],
        services: [],
        status: 'active',
        createdAt: folder.createdTime || new Date().toISOString(),
        updatedAt: folder.createdTime || new Date().toISOString(),
        driveFolderId: folder.id!,
      } as Artist;
    });

    return NextResponse.json({ artists: validArtists });
  } catch (error: any) {
    console.error('API /artists GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch artists', details: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body: CreateArtistInput = await request.json();
    
    if (!body.name) {
      return NextResponse.json({ error: 'Artist name is required' }, { status: 400 });
    }

    // 1. Crear la carpeta principal del artista en Drive
    const artistFolderId = await createFolder(body.name, DRIVE_ROOT_FOLDER_ID);

    // 2. Crear las subcarpetas predefinidas (ej: Images)
    for (const subfolder of ARTIST_FOLDER_STRUCTURE) {
      await createFolder(subfolder, artistFolderId);
    }

    // 3. Crear el JSON de configuración local
    const now = new Date().toISOString();
    const newConfig: ArtistConfig = {
      id: artistFolderId, 
      name: body.name,
      genre: body.genre || [],
      email: body.email,
      phone: body.phone,
      tags: body.tags || [],
      services: body.services || [],
      notes: body.notes,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    await saveJsonFile('artist_config.json', newConfig, artistFolderId);

    // 4. Actualizar la base de datos global de artistas
    const artistsDb = (await findAndReadJsonFile<ArtistConfig[]>('ezy_artists_db.json', DRIVE_ROOT_FOLDER_ID)) || [];
    artistsDb.push(newConfig);
    await saveJsonFile('ezy_artists_db.json', artistsDb, DRIVE_ROOT_FOLDER_ID);

    // 5. Devolver el artista creado
    const artist: Artist = {
      ...newConfig,
      driveFolderId: artistFolderId,
    };

    return NextResponse.json(artist, { status: 201 });
  } catch (error: any) {
    console.error('API /artists POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create artist', details: error.message },
      { status: 500 }
    );
  }
}
