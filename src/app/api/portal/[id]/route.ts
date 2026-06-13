import { NextResponse } from 'next/server';
import { findAndReadJsonFile, getDriveService, listFolders, saveJsonFile, fetchFoldersRecursively } from '@/lib/drive';
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

    // 1.5 Obtener configuración del portal
    let portalConfig = await findAndReadJsonFile<any>('portal_config.json', id);
    const defaultModules = [
      { id: 'bounces', type: 'bounces', isVisible: true, order: 0, title: 'Últimas Mezclas / Audios' },
      { id: 'releases', type: 'releases', isVisible: true, order: 1, title: 'Previews y Lanzamientos' },
      { id: 'finances', type: 'finances', isVisible: false, order: 2, title: 'Resumen Financiero' },
      { id: 'tasks', type: 'tasks', isVisible: true, order: 3, title: 'Estado del Trabajo' },
    ];
    if (!portalConfig) {
      portalConfig = { modules: defaultModules };
    } else if (portalConfig.modules) {
      const existingTypes = new Set(portalConfig.modules.map((m: any) => m.type));
      defaultModules.forEach(defMod => {
        if (!existingTypes.has(defMod.type)) {
          portalConfig.modules.push({ ...defMod, order: portalConfig.modules.length });
        }
      });
    } else {
      portalConfig.modules = defaultModules;
    }

    // 2. Obtener los proyectos del artista
    const folders = await listFolders(id);
    const ignoreFolders = ['Images', 'Documents', 'Contracts', 'Stems', 'Releases'];
    const projectFolders = folders.filter(f => !ignoreFolders.includes(f.name || ''));

    // 3. Para cada proyecto, obtener sus Bounces y la lista de tareas
    const projectsData = await Promise.all(
      projectFolders.map(async (projectFolder) => {
        const projectConfig = await findAndReadJsonFile<any>('project_config.json', projectFolder.id!) || { title: projectFolder.name, type: 'Project' };
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

        let bounces: any[] = [];
        try {
          const drive = getDriveService();
          const { folders: foldersWithFiles, files: rootFiles } = await fetchFoldersRecursively(drive, projectFolder.id!);
          const allFiles = [
            ...rootFiles,
            ...foldersWithFiles.flatMap(f => f.files)
          ];
          
          bounces = allFiles
            .filter((f: any) => f.mimeType?.includes('audio/') || /\.(wav|mp3|m4a|flac|aiff|ogg)$/i.test(f.name || ''))
            .sort((a: any, b: any) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime());
            
        } catch (e) {
          console.error('Error fetching project audios:', e);
        }

        return {
          id: projectFolder.id,
          title: projectConfig.title,
          type: projectConfig.type,
          status: projectConfig.status || 'active',
          budget: projectConfig.budget || 0,
          requirePaymentForDownload: !!projectConfig.requirePaymentForDownload,
          driveUrl: projectFolder.webViewLink,
          tasks: flatTasks,
          bounces,
        };
      })
    );

    // 4. Obtener resumen de pagos del artista
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

    // 4.5 Obtener las matrices compartidas
    const matricesData = await findAndReadJsonFile<any>('matrices.json', id) || { matrices: [] };
    const sharedMatrices = await Promise.all((matricesData.matrices || []).map(async (m: any) => {
      let grid = m.productionGrid;
      if (m.projectId && grid) {
        try {
          const drive = getDriveService();
          const { folders: foldersWithFiles, files: rootFiles } = await fetchFoldersRecursively(drive, m.projectId);
          const allFiles = [
            ...rootFiles,
            ...foldersWithFiles.flatMap(f => f.files)
          ];
          const audioFiles = allFiles.filter((f: any) => 
            f.mimeType?.includes('audio/') || 
            /\.(wav|mp3|m4a|flac|aiff|ogg)$/i.test(f.name || '')
          );

          const normalize = (s: string) => {
            if (!s) return '';
            return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
          };

          const newRows = grid.rows.map((row: any) => {
            const rowNameNorm = normalize(row.name);
            if (!rowNameNorm) return row;
            
            const newCells = { ...row.cells };
            let rowModified = false;

            for (const col of grid.columns) {
              if (col.type === 'file') {
                const cell = newCells[col.id] || { status: 'todo' };
                if (!cell.fileId) {
                  let bestMatch = null;
                  let bestScore = 0;
                  for (const file of audioFiles) {
                    const fileNameNorm = normalize(file.name);
                    if (fileNameNorm.includes(rowNameNorm)) {
                      const score = 1000 - (fileNameNorm.length - rowNameNorm.length);
                      if (score > bestScore) {
                        bestScore = score;
                        bestMatch = file;
                      }
                    }
                  }
                  if (bestMatch) {
                    newCells[col.id] = { ...cell, fileId: bestMatch.id, fileName: bestMatch.name, status: 'done' };
                    rowModified = true;
                  }
                }
              }
            }
            return rowModified ? { ...row, cells: newCells } : row;
          });
          
          grid = { ...grid, rows: newRows };
        } catch (e) {
          console.error(`Error auto-matching files for matrix ${m.id}:`, e);
        }
      }

      return {
        id: m.id,
        name: m.name,
        productionGrid: grid
      };
    }));

    // 5. Obtener releases públicas del artista
    let releases: any[] = [];
    try {
      const drive = getDriveService();
      const releasesQuery = `mimeType='application/vnd.google-apps.folder' and name='Releases' and '${id}' in parents and trashed=false`;
      const releasesRes = await drive.files.list({
        q: releasesQuery,
        fields: 'files(id)',
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
      });
      
      if (releasesRes.data.files && releasesRes.data.files.length > 0) {
        const releasesFolderId = releasesRes.data.files[0].id!;
        const releaseFolders = await listFolders(releasesFolderId);

        const releaseData = await Promise.all(
          releaseFolders.map(async (rf) => {
            const config = await findAndReadJsonFile<any>('release_config.json', rf.id!);
            if (!config || !config.isPublic) return null;
            return {
              id: rf.id,
              title: config.title,
              coverArtId: config.coverArtId,
              tracks: config.tracks || [],
              isPublic: config.isPublic,
              createdAt: config.createdAt,
            };
          })
        );
        releases = releaseData.filter(Boolean);
      }
    } catch (e) {
      // silently ignore
    }

    // 6. Leer feedbacks guardados
    const feedbackData = await findAndReadJsonFile<any>('portal_feedback.json', id) || { feedback: [] };

    return NextResponse.json({ 
      artist: {
        id: artistConfig.id,
        name: artistConfig.name,
        photo: artistConfig.photo,
      },
      producerName: portalConfig.producerName || 'EZY Studio',
      producerLogo: portalConfig.producerLogo,
      projects: projectsData,
      releases,
      finances: {
        totalBudget,
        totalPaid,
        pendingPayment,
      },
      sharedMatrices,
      feedback: feedbackData.feedback || [],
      config: portalConfig
    });
  } catch (error: any) {
    console.error('API /portal/[id] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch portal details', details: error.message }, { status: 500 });
  }
}

// POST: guardar feedback del artista en el portal
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { message, authorName, trackId, trackTitle, timestamp } = body;

    if (!message || !authorName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const feedbackData = await findAndReadJsonFile<any>('portal_feedback.json', id) || { feedback: [] };

    const newFeedback = {
      id: `fb_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      message,
      authorName,
      trackId: trackId || null,
      trackTitle: trackTitle || null,
      timestamp: timestamp || new Date().toISOString(),
      isRead: false,
    };

    feedbackData.feedback = [newFeedback, ...(feedbackData.feedback || [])];
    await saveJsonFile('portal_feedback.json', feedbackData, id);

    return NextResponse.json({ success: true, feedback: newFeedback });
  } catch (error: any) {
    console.error('API /portal/[id] POST error:', error);
    return NextResponse.json({ error: 'Failed to save feedback', details: error.message }, { status: 500 });
  }
}
