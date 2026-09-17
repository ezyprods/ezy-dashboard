import { NextResponse } from 'next/server';
import { findAndReadJsonFile, getDriveService, saveJsonFile, fetchFoldersRecursively } from '@/lib/drive';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    // 1. Obtener la configuración del proyecto
    const config = await findAndReadJsonFile<any>('project_config.json', id);
    if (!config) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // 2. Extraer carpetas y matriz vinculada en paralelo
    const drive = getDriveService();
    const [foldersData, matricesData] = await Promise.all([
      fetchFoldersRecursively(drive, id),
      config.artistId
        ? findAndReadJsonFile<any>('matrices.json', config.artistId).catch(() => null)
        : Promise.resolve(null)
    ]);

    const { folders: foldersWithFiles, files: rootFiles } = foldersData;
    const activeFolders = foldersWithFiles.filter(f => f.files.length > 0);

    // matrices.json is stored as { matrices: [...] } (legacy files may be a plain array)
    const matrices: any[] = Array.isArray(matricesData)
      ? matricesData
      : (Array.isArray(matricesData?.matrices) ? matricesData.matrices : []);

    const linkedMatrix = matrices.find(m =>
      m.projectId === id || m.projectId === config.id || (config.driveFolderId && m.projectId === config.driveFolderId)
    ) || null;

    return NextResponse.json({ 
      project: { ...config, driveFolderId: id },
      folders: activeFolders,
      rootFiles,
      linkedMatrix
    });
  } catch (error: any) {
    if (error.code === 404 || error.status === 404 || error.message?.includes('File not found')) {
      return NextResponse.json({ error: 'Project folder not found on Drive' }, { status: 404 });
    }
    console.error('API /projects/[id] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch project details', details: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;
    const body = await request.json();

    const config = await findAndReadJsonFile<any>('project_config.json', id);
    if (!config) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Never let the client overwrite identity fields
    const { id: _id, driveFolderId: _drive, artistId: _artist, ...safeBody } = body || {};
    const updatedConfig = { ...config, ...safeBody, updatedAt: new Date().toISOString() };

    // Renaming the project also renames its Drive folder
    if (typeof safeBody.title === 'string' && safeBody.title.trim() && safeBody.title.trim() !== config.title) {
      updatedConfig.title = safeBody.title.trim();
      const drive = getDriveService();
      await drive.files.update({ fileId: id, requestBody: { name: updatedConfig.title }, supportsAllDrives: true });
    }

    await saveJsonFile('project_config.json', updatedConfig, id);

    return NextResponse.json({ project: updatedConfig });
  } catch (error: any) {
    console.error('API /projects/[id] PUT error:', error);
    return NextResponse.json({ error: 'Failed to update project config', details: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    // Move to the Drive trash (recoverable) instead of deleting permanently
    const drive = getDriveService();
    await drive.files.update({
      fileId: id,
      requestBody: { trashed: true },
      supportsAllDrives: true,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('API /projects/[id] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete project', details: error.message }, { status: 500 });
  }
}
