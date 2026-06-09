import { NextResponse } from 'next/server';
import { listFolders, findAndReadJsonFile, createFolder, saveJsonFile } from '@/lib/drive';
import { PROJECT_FOLDER_STRUCTURE } from '@/lib/constants';
import type { Project, CreateProjectInput } from '@/types';

// Obtener todos los proyectos de un artista
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const artistId = searchParams.get('artistId');

    if (!artistId) {
      return NextResponse.json({ error: 'artistId is required' }, { status: 400 });
    }

    // 1. Obtener todas las carpetas dentro del artista
    const folders = await listFolders(artistId);
    
    // 2. Filtrar subcarpetas estándar (como 'Images')
    const excludeFolders = ['Images', 'images'];
    const projectFolders = folders.filter(f => !excludeFolders.includes(f.name || ''));

    // 3. Leer project_config.json
    const projectsPromises = projectFolders.map(async (folder) => {
      try {
        const config = await findAndReadJsonFile<Project>('project_config.json', folder.id!);
        if (config) {
          return { ...config, driveFolderId: folder.id! };
        }
        return null;
      } catch (err) {
        return null;
      }
    });

    const projectsResult = await Promise.all(projectsPromises);
    const validProjects = projectsResult.filter((p): p is Project => p !== null);

    return NextResponse.json({ projects: validProjects });
  } catch (error: any) {
    console.error('API /projects GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch projects', details: error.message }, { status: 500 });
  }
}

// Crear un nuevo proyecto
export async function POST(request: Request) {
  try {
    const body: CreateProjectInput = await request.json();
    
    if (!body.artistId || !body.title || !body.type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Nombre de la carpeta: "Tipo - Título"
    const folderName = `${body.type.toUpperCase()} - ${body.title}`;
    
    // 1. Crear carpeta del proyecto
    const projectFolderId = await createFolder(folderName, body.artistId);

    // 2. Crear subcarpetas (Sessions, Bounces, etc.)
    for (const subfolder of PROJECT_FOLDER_STRUCTURE) {
      await createFolder(subfolder, projectFolderId);
    }

    // 3. Crear JSON
    const now = new Date().toISOString();
    const newProject: Project = {
      id: projectFolderId,
      artistId: body.artistId,
      title: body.title,
      type: body.type,
      status: 'active',
      songs: [],
      createdAt: now,
      updatedAt: now,
      driveFolderId: projectFolderId,
      releaseDate: body.releaseDate,
      deliveryDate: body.deliveryDate,
    };

    await saveJsonFile('project_config.json', newProject, projectFolderId);

    return NextResponse.json({ project: newProject }, { status: 201 });
  } catch (error: any) {
    console.error('API /projects POST error:', error);
    return NextResponse.json({ error: 'Failed to create project', details: error.message }, { status: 500 });
  }
}
