import { NextResponse } from 'next/server';
import { findAndReadJsonFile, getDriveService, listFolders } from '@/lib/drive';
import { DRIVE_ROOT_FOLDER_ID } from '@/lib/constants';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    // 1. Obtener la configuración del artista
    const artistConfig = await findAndReadJsonFile<any>('artist_config.json', id);
    if (!artistConfig) {
      return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
    }

    // 2. Obtener los proyectos del artista
    const folders = await listFolders(id);
    // Ignorar las carpetas por defecto de la estructura (Images, etc.)
    const ignoreFolders = ['Images', 'Documents', 'Contracts', 'Stems'];
    const projectFolders = folders.filter(f => !ignoreFolders.includes(f.name || ''));

    // 3. Para cada proyecto, obtener sus Bounces y la lista de tareas
    const projectsData = await Promise.all(
      projectFolders.map(async (projectFolder) => {
        // Leer config del proyecto (para saber tipo y portada)
        const projectConfig = await findAndReadJsonFile<any>('project_config.json', projectFolder.id!) || { title: projectFolder.name, type: 'Project' };
        // Leer progreso del proyecto (formato FlexBoardData)
        const tasksData = await findAndReadJsonFile<any>('tasks.json', projectFolder.id!) || { groups: [] };
        const flatTasks: any[] = [];
        if (tasksData && Array.isArray(tasksData.groups)) {
          tasksData.groups.forEach((g: any) => {
            if (Array.isArray(g.tasks)) {
              g.tasks.forEach((t: any) => {
                flatTasks.push({
                  id: t.id,
                  title: t.title,
                  status: t.status === 'done' ? 'completed' : 'pending',
                });
              });
            }
          });
        } else if (Array.isArray(tasksData)) {
          tasksData.forEach((t: any) => {
            flatTasks.push({
              id: t.id,
              title: t.title,
              status: t.status === 'completed' ? 'completed' : 'pending',
            });
          });
        }
        
        
        // Obtener subcarpetas del proyecto (Bounces)
        const subfolders = await listFolders(projectFolder.id!);
        const bouncesFolder = subfolders.find(f => f.name === 'Bounces');
        
        let bounces: any[] = [];
        if (bouncesFolder) {
          const drive = getDriveService();
          const res = await drive.files.list({
            q: `'${bouncesFolder.id}' in parents and trashed=false and mimeType contains 'audio/'`,
            fields: 'files(id, name, mimeType, webViewLink, createdTime)',
            orderBy: 'createdTime desc',
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
          });
          bounces = res.data.files || [];
        }

        return {
          id: projectFolder.id,
          title: projectConfig.title,
          type: projectConfig.type,
          status: projectConfig.status || 'active',
          budget: projectConfig.budget || 0,
          tasks: flatTasks,
          bounces,
        };
      })
    );

    // 4. Obtener resumen de pagos del artista (sin exponer IDs ni datos sensibles)
    const allPayments = await findAndReadJsonFile<any[]>('payments_db.json', DRIVE_ROOT_FOLDER_ID) || [];
    const artistPayments = allPayments.filter(p => p.artistId === id && p.status === 'paid');
    
    let totalBudget = 0;
    let totalPaid = 0;
    
    projectsData.forEach(p => {
      totalBudget += (p.budget || 0);
    });
    
    artistPayments.forEach(p => {
      totalPaid += (p.amount || 0);
    });

    const pendingPayment = Math.max(0, totalBudget - totalPaid);

    return NextResponse.json({ 
      artist: {
        id,
        name: artistConfig.name,
      },
      projects: projectsData,
      producerName: process.env.NEXT_PUBLIC_PRODUCER_NAME || 'EZY Studio',
      payments: {
        totalBudget,
        totalPaid,
        pendingPayment
      }
    });
  } catch (error: any) {
    console.error('API /portal/[id] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch portal details', details: error.message }, { status: 500 });
  }
}
