import { NextResponse } from 'next/server';
import { getDriveService, listFolders, listFiles } from '@/lib/drive';
import { Readable } from 'stream';

import { FOLDER_NAME_MAP } from '@/lib/constants';
import { getNormalizedBaseName, stringSimilarity } from '@/lib/utils';

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

    if (folderType === 'Bounces') {
      // For Bounces, always use or create a Bounces folder in the Artist root
      const subfolders = await listFolders(artistId);
      const match = subfolders.find((f) => f.name?.toLowerCase() === 'bounces');
      if (match) {
        targetFolderId = match.id!;
      } else {
        const response = await drive.files.create({
          requestBody: {
            name: 'Bounces',
            mimeType: 'application/vnd.google-apps.folder',
            parents: [artistId],
          },
          fields: 'id',
          supportsAllDrives: true,
        });
        targetFolderId = response.data.id!;
      }
    } else {
      // Standard logic for other folder types
      for (const project of projects) {
        const subfolders = await listFolders(project.id!);
        const match = subfolders.find((f) => f.name === folderType || f.name === mappedFolderName);
        if (match) {
          targetFolderId = match.id!;
          break;
        }
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

    // 2. Fetch existing files in target folder to detect fuzzy duplicates
    const existingFiles = await listFiles(targetFolderId);

    // 3. Upload or Overwrite each file
    const uploaded: { id: string; name: string; webViewLink?: string }[] = [];

    for (const file of files) {
      const buffer = await file.arrayBuffer();
      const stream = new Readable();
      stream.push(Buffer.from(buffer));
      stream.push(null);

      // Smart Renaming for Masters
      let finalName = file.name;
      if (folderType === 'Master') {
        const extMatch = file.name.match(/\.[^.]+$/);
        const ext = extMatch ? extMatch[0] : '';
        let base = extMatch ? file.name.slice(0, -ext.length) : file.name;
        
        // Remove existing "Master", "24Bits", "48kHz" to avoid duplicates if they typed it slightly differently
        base = base.replace(/(?:\s*-?\s*master.*|\s*-?\s*24bits.*)/i, '').trim();
        finalName = `${base} Master 24Bits 48kHz${ext}`;
      }

      // Fuzzy Overwrite Detection
      const newNormalized = getNormalizedBaseName(finalName);
      let matchFound = false;
      let matchedFileId = null;

      if (newNormalized.length > 2) {
        let bestScore = 0;
        let bestMatch = null;

        for (const existing of existingFiles) {
          const existingNormalized = getNormalizedBaseName(existing.name);
          if (existingNormalized.length > 2) {
            const similarity = stringSimilarity(newNormalized, existingNormalized);
            if (similarity > bestScore) {
              bestScore = similarity;
              bestMatch = existing;
            }
          }
        }

        // If similarity is >= 85%, we consider it the same track
        if (bestScore >= 0.85 && bestMatch) {
          matchFound = true;
          matchedFileId = bestMatch.id;
        }
      }

      if (matchFound && matchedFileId) {
        // OVERWRITE existing file
        const response = await drive.files.update({
          fileId: matchedFileId,
          requestBody: {
            name: finalName, // Update the name to the new correct one
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
      } else {
        // CREATE new file
        const response = await drive.files.create({
          requestBody: {
            name: finalName,
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
