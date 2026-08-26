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

    // 5. Población Lazy de packTracks y latestBounce si hay audios
    let updatedProjectConfig = { ...config, driveFolderId: id, id };
    if (bounces.length > 0) {
      const packTracks = bounces.map((b: any) => ({
        fileId: b.id,
        fileName: b.name,
        driveUrl: b.webViewLink,
      }));

      const needsSync = !config.latestBounceFileId || 
        config.latestBounceFileId !== bounces[0].id ||
        !config.packTracks || 
        config.packTracks.length !== packTracks.length;

      if (needsSync) {
        updatedProjectConfig = {
          ...updatedProjectConfig,
          latestBounceFileId: bounces[0].id,
          latestBounceName: bounces[0].name,
          packTracks,
          updatedAt: new Date().toISOString(),
        };

        // Guardar de fondo sin bloquear
        saveJsonFile('personal_project_config.json', updatedProjectConfig, id).catch(() => {});
        getPersonalProjectsDb().then(({ projects, rootFolderId }) => {
          const updatedList = projects.map(p => (p.id === id ? updatedProjectConfig : p));
          return savePersonalProjectsDb(updatedList, rootFolderId);
        }).catch(() => {});
      } else {
        updatedProjectConfig.packTracks = config.packTracks || packTracks;
      }
    }

    return NextResponse.json({
      project: updatedProjectConfig,
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

    // 1. Intentar eliminar carpeta en Google Drive
    //    Si ya no existe (404), se considera eliminada correctamente
    const drive = getDriveService();
    try {
      await drive.files.delete({
        fileId: id,
        supportsAllDrives: true,
      });
    } catch (driveErr: any) {
      const is404 = driveErr?.code === 404 || driveErr?.status === 404 ||
        driveErr?.message?.includes('File not found') ||
        driveErr?.message?.includes('not found');
      if (!is404) {
        // Solo relanzar si NO es un 404 (el archivo/carpeta ya no existía)
        throw driveErr;
      }
      console.warn(`[DELETE personal-project] Drive folder ${id} already gone (404), removing from DB only.`);
    }

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
