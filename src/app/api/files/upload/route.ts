import { NextResponse } from 'next/server';
import { getDriveService, listFolders } from '@/lib/drive';
import { Readable } from 'stream';

import { FOLDER_NAME_MAP } from '@/lib/constants';

// POST /api/files/upload
// Body: FormData with fields: artistId, folderType, file (repeatable)
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const artistId = formData.get('artistId') as string | null;
    const folderType = formData.get('folderType') as string | null;
    const files = formData.getAll('file') as File[];

    if (!artistId || !folderType || files.length === 0) {
      return NextResponse.json(
        { error: 'Missing artistId, folderType, or files' },
        { status: 400 }
      );
    }

    const drive = getDriveService();

    // 1. List project folders under artist folder
    const projectFolders = await listFolders(artistId);
    const ignoreFolders = [
      'Images', 'Documents', 'Contracts', 'Stems',
      '01_Legal_y_Contratos', '02_Diseño_y_Media', '03_Lanzamientos_y_Proyectos'
    ];
    const projects = projectFolders.filter(
      (f) => !ignoreFolders.includes(f.name || '')
    );

    // Find target folder across all projects – use the first project found, or
    // if no projects, look for the folder directly in artist folder.
    let targetFolderId: string | null = null;
    const mappedFolderName = (FOLDER_NAME_MAP as any)[folderType || ''] || folderType;

    for (const project of projects) {
      const subfolders = await listFolders(project.id!);
      const match = subfolders.find((f) => f.name === folderType || f.name === mappedFolderName);
      if (match) {
        targetFolderId = match.id!;
        break;
      }
    }

    // Fallback: look directly inside the artist folder for the named folder
    if (!targetFolderId) {
      const directChild = projectFolders.find((f) => f.name === folderType || f.name === mappedFolderName);
      if (directChild) targetFolderId = directChild.id!;
    }

    if (!targetFolderId) {
      return NextResponse.json(
        {
          error: `No se encontró la carpeta "${folderType}" dentro del artista. Asegúrate de tener al menos un proyecto con esa subcarpeta.`,
        },
        { status: 404 }
      );
    }

    // 2. Upload each file
    const uploaded: { id: string; name: string; webViewLink?: string }[] = [];

    for (const file of files) {
      const buffer = await file.arrayBuffer();
      const stream = new Readable();
      stream.push(Buffer.from(buffer));
      stream.push(null);

      const response = await drive.files.create({
        requestBody: {
          name: file.name,
          parents: [targetFolderId],
        },
        media: {
          mimeType: file.type || 'application/octet-stream',
          body: stream,
        },
        fields: 'id, name, webViewLink',
        supportsAllDrives: true,
      });

      uploaded.push({
        id: response.data.id!,
        name: response.data.name!,
        webViewLink: response.data.webViewLink ?? undefined,
      });
    }

    return NextResponse.json({ success: true, files: uploaded }, { status: 201 });
  } catch (error: any) {
    console.error('API /files/upload POST error:', error);
    return NextResponse.json(
      { error: 'Failed to upload files', details: error.message },
      { status: 500 }
    );
  }
}
