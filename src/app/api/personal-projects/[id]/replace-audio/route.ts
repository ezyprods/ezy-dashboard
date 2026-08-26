export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { NextResponse } from 'next/server';
import { Readable } from 'stream';
import { 
  getDriveService, 
  findAndReadJsonFile, 
  saveJsonFile,
  createFolder
} from '@/lib/drive';
import { 
  getPersonalProjectsDb, 
  savePersonalProjectsDb 
} from '@/lib/personalProjects';
import { parseAudioFilename } from '@/lib/utils/audio';
import type { PersonalProject } from '@/types';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const drive = getDriveService();

    // 1. Obtener la configuración del proyecto
    const config = await findAndReadJsonFile<PersonalProject>('personal_project_config.json', id);
    if (!config) {
      return NextResponse.json({ error: 'Proyecto personal no encontrado' }, { status: 404 });
    }

    // 2. Extraer el archivo de audio del FormData
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No se ha proporcionado ningún archivo de audio' }, { status: 400 });
    }

    const isAudio = file.type?.startsWith('audio/') || /\.(mp3|wav|flac|m4a|ogg|aiff)$/i.test(file.name);
    if (!isAudio) {
      return NextResponse.json({ error: 'El archivo debe ser un formato de audio válido (.mp3, .wav, .flac, etc.)' }, { status: 400 });
    }

    // 3. Localizar o crear la subcarpeta 01_Bounces_y_Demos
    const subFolders = await drive.files.list({
      q: `'${id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    let bounceFolder = subFolders.data.files?.find(f => (f.name || '').toLowerCase().includes('01_bounces') || (f.name || '').toLowerCase().includes('bounces'));
    let bounceFolderId: string;

    if (bounceFolder && bounceFolder.id) {
      bounceFolderId = bounceFolder.id;
    } else {
      bounceFolderId = await createFolder('01_Bounces_y_Demos', id);
    }

    // 4. Eliminar FÍSICAMENTE cualquier archivo anterior de 01_Bounces_y_Demos para no dejar rastro
    const existingFiles = await drive.files.list({
      q: `'${bounceFolderId}' in parents and trashed=false`,
      fields: 'files(id, name)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    if (existingFiles.data.files && existingFiles.data.files.length > 0) {
      for (const oldFile of existingFiles.data.files) {
        if (oldFile.id) {
          try {
            await drive.files.delete({ fileId: oldFile.id, supportsAllDrives: true });
          } catch (delErr) {
            console.warn(`[replace-audio] Warning deleting old file ${oldFile.id}:`, delErr);
          }
        }
      }
    }

    // 5. Convertir File a Stream y subir el nuevo audio a Drive
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const stream = Readable.from(buffer);

    const uploadRes = await drive.files.create({
      requestBody: {
        name: file.name,
        parents: [bounceFolderId],
      },
      media: {
        mimeType: file.type || (file.name.toLowerCase().endsWith('.wav') ? 'audio/wav' : 'audio/mpeg'),
        body: stream,
      },
      fields: 'id, name, webViewLink, size',
      supportsAllDrives: true,
    });

    const newFileId = uploadRes.data.id!;
    const newFileName = uploadRes.data.name!;

    // 6. Analizar BPM y Key del nombre del nuevo archivo
    const parsed = parseAudioFilename(file.name);

    // 7. Actualizar metadatos del proyecto
    const updatedProject: PersonalProject = {
      ...config,
      id,
      driveFolderId: id,
      latestBounceFileId: newFileId,
      latestBounceName: newFileName,
      bpm: parsed.bpm || config.bpm,
      key: parsed.shortKey || parsed.key || config.key,
      status: 'terminado',
      updatedAt: new Date().toISOString(),
    };

    // 8. Guardar personal_project_config.json en la carpeta del proyecto
    await saveJsonFile('personal_project_config.json', updatedProject, id);

    // 9. Actualizar el índice maestro personal_projects_db.json
    try {
      const { projects, rootFolderId } = await getPersonalProjectsDb();
      const updatedList = projects.map(p => (p.id === id ? updatedProject : p));
      await savePersonalProjectsDb(updatedList, rootFolderId);
    } catch (syncErr) {
      console.warn('Warning: Failed to sync personal_projects_db.json on replace audio:', syncErr);
    }

    return NextResponse.json({
      success: true,
      project: updatedProject,
      newFile: {
        id: newFileId,
        name: newFileName,
        webViewLink: uploadRes.data.webViewLink,
      }
    });
  } catch (error: any) {
    console.error('API /personal-projects/[id]/replace-audio POST error:', error);
    return NextResponse.json(
      { error: 'Error al sustituir el archivo de audio', details: error.message },
      { status: 500 }
    );
  }
}
