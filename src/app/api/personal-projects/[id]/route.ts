export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { NextResponse } from 'next/server';
import { 
  findAndReadJsonFile, 
  saveJsonFile, 
  getDriveService, 
  fetchFoldersRecursively 
} from '@/lib/drive';
import { 
  getPersonalProjectsDb, 
  savePersonalProjectsDb 
} from '@/lib/personalProjects';
import type { PersonalProject, PersonalTasksData } from '@/types';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 1. Obtener la configuración del proyecto personal
    const config = await findAndReadJsonFile<PersonalProject>('personal_project_config.json', id);
    if (!config) {
      return NextResponse.json({ error: 'Proyecto personal no encontrado' }, { status: 404 });
    }

    // 2. Leer tareas y sesiones de tiempo
    const tasksData = (await findAndReadJsonFile<PersonalTasksData>('personal_tasks.json', id)) || {
      tasks: [],
      workSessions: [],
    };

    // 3. Extraer carpetas y archivos recursivamente
    const drive = getDriveService();
    const { folders, files: rootFiles } = await fetchFoldersRecursively(drive, id);

    // 4. Identificar archivos de audio / bounces para el reproductor
    const allFiles = [
      ...rootFiles,
      ...folders.flatMap(f => f.files || []),
    ];
    const bounces = allFiles.filter(
      (f: any) => f.mimeType?.startsWith('audio/') || /\.(mp3|wav|flac|m4a|ogg|aiff)$/i.test(f.name || '')
    );

    return NextResponse.json({
      project: { ...config, driveFolderId: id, id },
      folders,
      rootFiles,
      tasks: tasksData.tasks || [],
      workSessions: tasksData.workSessions || [],
      bounces,
    });
  } catch (error: any) {
    if (error.code === 404 || error.status === 404 || error.message?.includes('File not found')) {
      return NextResponse.json({ error: 'Carpeta de proyecto no encontrada en Google Drive' }, { status: 404 });
    }
    console.error('API /personal-projects/[id] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch personal project detail', details: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const config = await findAndReadJsonFile<PersonalProject>('personal_project_config.json', id);
    if (!config) {
      return NextResponse.json({ error: 'Proyecto personal no encontrado' }, { status: 404 });
    }

    const updatedConfig: PersonalProject = {
      ...config,
      ...body,
      id,
      driveFolderId: id,
      updatedAt: new Date().toISOString(),
    };

    // 1. Guardar en personal_project_config.json local
    await saveJsonFile('personal_project_config.json', updatedConfig, id);

    // 2. Sincronizar en personal_projects_db.json
    try {
      const { projects, rootFolderId } = await getPersonalProjectsDb();
      const updatedList = projects.map(p => (p.id === id ? updatedConfig : p));
      await savePersonalProjectsDb(updatedList, rootFolderId);
    } catch (syncErr) {
      console.warn('Warning: Failed to sync personal_projects_db.json on PUT:', syncErr);
    }

    return NextResponse.json({ project: updatedConfig });
  } catch (error: any) {
    console.error('API /personal-projects/[id] PUT error:', error);
    return NextResponse.json(
      { error: 'Failed to update personal project', details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 1. Eliminar carpeta en Google Drive
    const drive = getDriveService();
    await drive.files.delete({
      fileId: id,
      supportsAllDrives: true,
    });

    // 2. Eliminar del índice maestro personal_projects_db.json
    try {
      const { projects, rootFolderId } = await getPersonalProjectsDb();
      const updatedList = projects.filter(p => p.id !== id);
      await savePersonalProjectsDb(updatedList, rootFolderId);
    } catch (syncErr) {
      console.warn('Warning: Failed to sync personal_projects_db.json on DELETE:', syncErr);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('API /personal-projects/[id] DELETE error:', error);
    return NextResponse.json(
      { error: 'Failed to delete personal project', details: error.message },
      { status: 500 }
    );
  }
}
