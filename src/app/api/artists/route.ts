export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
import { NextResponse } from 'next/server';
import { listFolders, findAndReadJsonFile, createFolder, saveJsonFile } from '@/lib/drive';
import { DRIVE_ROOT_FOLDER_ID, ARTIST_FOLDER_STRUCTURE } from '@/lib/constants';
import type { Artist, ArtistConfig, CreateArtistInput } from '@/types';

export async function GET() {
  try {
    const [folders, artistsDbResult] = await Promise.all([
      listFolders(DRIVE_ROOT_FOLDER_ID).catch(e => {
        if (e.message?.includes('invalid_grant') || e.message?.includes('credentials')) {
          throw new Error('AUTH_REQUIRED');
        }
        throw e;
      }),
      findAndReadJsonFile<ArtistConfig[]>('ezy_artists_db.json', DRIVE_ROOT_FOLDER_ID).catch(() => null)
    ]);
    
    const artistsDb = artistsDbResult || [];
    
    // Resolve last project for each artist folder in parallel
    const validArtistsPromises = folders.map(async (folder) => {
      const syncedData = artistsDb.find(a => a.id === folder.id);
      
      let lastProjectName = '';
      try {
        // Fetch project folders in parallel
        const artistSubfolders = await listFolders(folder.id!);
        const excludeFolders = ['Images', 'images', 'Bounces', 'bounces', 'Documents', 'documents', 'Contracts', 'contracts', 'Stems', 'stems'];
        const projectFolders = artistSubfolders.filter(f => !excludeFolders.includes(f.name || ''));
        
        if (projectFolders.length > 0) {
          // Sort by creation/update date, newest first. Drive returns createdTime.
          // Since we want the latest project, sort by createdTime descending.
          projectFolders.sort((a, b) => {
            const timeA = a.createdTime ? new Date(a.createdTime).getTime() : 0;
            const timeB = b.createdTime ? new Date(b.createdTime).getTime() : 0;
            return timeB - timeA;
          });
          lastProjectName = projectFolders[0].name || '';
        }
      } catch (err) {
        console.error(`Error resolving last project for artist ${folder.name}:`, err);
      }

      const artistBase = syncedData ? { ...syncedData, driveFolderId: folder.id! } : {
        id: folder.id!,
        name: folder.name!,
        genre: [],
        tags: [],
        services: [],
        status: 'active',
        createdAt: folder.createdTime || new Date().toISOString(),
        updatedAt: folder.createdTime || new Date().toISOString(),
        driveFolderId: folder.id!,
      };

      return {
        ...artistBase,
        activeProject: lastProjectName ? lastProjectName : 'Sin proyectos',
      } as Artist;
    });

    const validArtists = await Promise.all(validArtistsPromises);

    return NextResponse.json({ artists: validArtists });
  } catch (error: any) {
    if (error.message === 'AUTH_REQUIRED') {
      return NextResponse.json({ artists: [], needsAuth: true, error: 'Token de Google expirado o inválido. Debes reconectar.' });
    }
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

