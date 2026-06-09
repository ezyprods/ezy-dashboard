import { NextResponse } from 'next/server';
import { findAndReadJsonFile, getDriveService } from '@/lib/drive';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    // 1. Obtener la configuración del proyecto
    const config = await findAndReadJsonFile<any>('project_config.json', id);
    if (!config) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // 2. Listar TODO el contenido (carpetas y archivos)
    const drive = getDriveService();
    const response = await drive.files.list({
      q: `'${id}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType, webViewLink, createdTime, size)',
      orderBy: 'folder, name',
    });

    const items = response.data.files || [];
    const folders = items.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
    
    // 3. Para cada carpeta clave (ej. Bounces), listar sus archivos
    const foldersWithFiles = await Promise.all(
      folders.map(async (folder) => {
        const res = await drive.files.list({
          q: `'${folder.id}' in parents and trashed=false`,
          fields: 'files(id, name, mimeType, webViewLink, createdTime, size)',
          orderBy: 'createdTime desc',
        });
        return {
          id: folder.id,
          name: folder.name,
          files: res.data.files || [],
        };
      })
    );

    return NextResponse.json({ 
      project: { ...config, driveFolderId: id },
      folders: foldersWithFiles,
      rootFiles: items.filter(f => f.mimeType !== 'application/vnd.google-apps.folder')
    });
  } catch (error: any) {
    console.error('API /projects/[id] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch project details', details: error.message }, { status: 500 });
  }
}
