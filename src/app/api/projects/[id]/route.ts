import { NextResponse } from 'next/server';
import { findAndReadJsonFile, getDriveService, saveJsonFile } from '@/lib/drive';

// Función recursiva para obtener todas las carpetas y sus archivos
async function fetchFoldersRecursively(drive: any, parentId: string, parentPath: string = ''): Promise<{folders: any[], files: any[]}> {
  let allFolders: any[] = [];
  let rootFiles: any[] = [];

  const response = await drive.files.list({
    q: `'${parentId}' in parents and trashed=false`,
    fields: 'files(id, name, mimeType, webViewLink, webContentLink, createdTime, size)',
    orderBy: 'folder, name',
  });

  const items = response.data.files || [];
  
  // Archivos directos en este parent
  const files = items.filter((f: any) => f.mimeType !== 'application/vnd.google-apps.folder');
  rootFiles = files;

  // Carpetas directas
  const folders = items.filter((f: any) => f.mimeType === 'application/vnd.google-apps.folder');

  for (const folder of folders) {
    const currentPath = parentPath ? `${parentPath} / ${folder.name}` : folder.name;
    const { folders: subFolders, files: subFiles } = await fetchFoldersRecursively(drive, folder.id, currentPath);
    
    allFolders.push({
      id: folder.id,
      name: currentPath, // Mostramos la ruta completa para dar contexto
      files: subFiles,
    });
    
    // Añadimos las subcarpetas encontradas
    allFolders = allFolders.concat(subFolders);
  }

  return { folders: allFolders, files: rootFiles };
}

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
