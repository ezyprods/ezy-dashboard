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

    // 2. Extraer todo recursivamente
    const drive = getDriveService();
    const { folders: foldersWithFiles, files: rootFiles } = await fetchFoldersRecursively(drive, id);

    // Filtramos las carpetas que no tienen archivos para que la UI no quede sucia (opcional, pero recomendado)
    const activeFolders = foldersWithFiles.filter(f => f.files.length > 0);

    return NextResponse.json({ 
      project: { ...config, driveFolderId: id },
      folders: activeFolders,
      rootFiles
    });
  } catch (error: any) {
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

    const updatedConfig = { ...config, ...body };
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

    const drive = getDriveService();
    await drive.files.delete({
      fileId: id,
      supportsAllDrives: true,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('API /projects/[id] DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete project', details: error.message }, { status: 500 });
  }
}
