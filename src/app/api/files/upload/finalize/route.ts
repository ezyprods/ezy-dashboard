import { NextResponse } from 'next/server';
import { getDriveService, listFolders, listFiles } from '@/lib/drive';
import { FOLDER_NAME_MAP } from '@/lib/constants';

export async function POST(request: Request) {
  try {
    const { artistId, folderType, tempFiles } = await request.json();

    if (!artistId || !folderType || !tempFiles || tempFiles.length === 0) {
      return NextResponse.json(
        { error: 'Missing artistId, folderType, or tempFiles' },
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

    let targetFolderId: string | null = null;
    const mappedFolderName = (FOLDER_NAME_MAP as any)[folderType] || folderType;

    if (folderType === 'Bounces') {
      const subfolders = await listFolders(artistId);
      const match = subfolders.find((f) => f.name?.toLowerCase() === 'bounces');
      if (match) {
        targetFolderId = match.id!;
      } else {
        targetFolderId = artistId;
      }
    } else {
      for (const project of projects) {
        const subfolders = await listFolders(project.id!);
        const match = subfolders.find((f) => f.name === folderType || f.name === mappedFolderName);
        if (match) {
          targetFolderId = match.id!;
          break;
        }
      }
    }

    if (!targetFolderId) {
      const directChild = projectFolders.find((f) => f.name === folderType || f.name === mappedFolderName);
      if (directChild) targetFolderId = directChild.id!;
    }

    if (!targetFolderId) {
      return NextResponse.json(
        { error: `No se encontró la carpeta "${folderType}" dentro del artista.` },
        { status: 404 }
      );
    }

    // 2. Upload/Overwrite each file
    const uploaded: { id: string; name: string; webViewLink?: string }[] = [];
    const existingFiles = await listFiles(targetFolderId);

    for (const tempFile of tempFiles) {
      const { tempId, originalName } = tempFile;

      let finalName = originalName;
      if (folderType === 'Master') {
        const extMatch = originalName.match(/\.[^.]+$/);
        const ext = extMatch ? extMatch[0] : '';
        let base = extMatch ? originalName.slice(0, -ext.length) : originalName;
        base = base.replace(/(?:\s*-?\s*master.*|\s*-?\s*24bits.*)/i, '').trim();
        finalName = `${base} Master 24Bits 48kHz${ext}`;
      }

      // Check if file exists to overwrite
      let fileIdToUpdate = tempId;
      const existingMatch = existingFiles.find(
        (f) =>
          f.name?.toLowerCase() === finalName.toLowerCase() ||
          (f.name && finalName && f.name.replace(/\.[^/.]+$/, "").toLowerCase() === finalName.replace(/\.[^/.]+$/, "").toLowerCase())
      );

      if (existingMatch) {
        // If it exists, we could ideally update the existing file with the new content,
        // but since it's already uploaded as a new temp file, the easiest way is to 
        // delete the old one and move the new one in its place.
        // (Google Drive doesn't allow merging two existing files).
        // Let's delete the old one.
        try {
          await drive.files.delete({ fileId: existingMatch.id!, supportsAllDrives: true });
        } catch (e) {
          console.warn('Could not delete existing file for overwrite', e);
        }
      }

      // Move the temp file to the target folder and rename it
      // To move a file, we need its current parents
      const fileRes = await drive.files.get({ fileId: tempId, fields: 'parents', supportsAllDrives: true });
      const previousParents = fileRes.data.parents?.join(',') || '';

      const updatedFile = await drive.files.update({
        fileId: tempId,
        addParents: targetFolderId,
        removeParents: previousParents,
        requestBody: { name: finalName },
        fields: 'id, name, webViewLink',
        supportsAllDrives: true,
      });

      uploaded.push({
        id: updatedFile.data.id!,
        name: updatedFile.data.name!,
        webViewLink: updatedFile.data.webViewLink!,
      });
    }

    return NextResponse.json({ success: true, files: uploaded });
  } catch (error: any) {
    console.error('API /upload/finalize POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
