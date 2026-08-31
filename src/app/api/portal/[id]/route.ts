export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { NextResponse } from 'next/server';
import { findAndReadJsonFile, getDriveService, listFolders, saveJsonFile } from '@/lib/drive';
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
      { id: 'bounces', type: 'bounces', isVisible: true, order: 0, title: 'Últimas Mezclas / Archivos' },
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

    const drive = getDriveService();

    // 2. Traversal recursivo — acumula todos los archivos y mapea carpetas de proyectos
    const SYSTEM_FILES_SET = new Set([
      'artist_config.json', 'portal_config.json', 'portal_feedback.json', 
      'matrices.json', 'payments.json', 'tasks.json', 'project_config.json', 
      'release_config.json', 'notes.json', 'payments_db.json', 'ezy-config.json'
    ]);

    const allArtistFiles: any[] = [];
    const folderFilesMap = new Map<string, any[]>(); // folderId -> todos los archivos de esa carpeta y sus subcarpetas
    const rootSubfolders: { id: string; name: string; webViewLink?: string }[] = [];

    async function traverse(folderId: string, pathLabel: string, isRoot: boolean): Promise<any[]> {
      const query = `'${folderId}' in parents and trashed=false`;
      let pageToken: string | undefined = undefined;
      const allFilesInBranch: any[] = [];

      do {
        const response: any = await drive.files.list({
          q: query,
          fields: 'nextPageToken, files(id, name, mimeType, webViewLink, webContentLink, createdTime, modifiedTime, size, appProperties)',
          orderBy: 'folder, name',
          includeItemsFromAllDrives: true,
          supportsAllDrives: true,
          pageSize: 1000,
          pageToken,
        });
        const items = response.data.files || [];

        for (const item of items) {
          const name = item.name || '';
          if (item.mimeType === 'application/vnd.google-apps.folder') {
            if (isRoot) rootSubfolders.push({ id: item.id, name: item.name, webViewLink: item.webViewLink });
            // Recursión en toda subcarpeta
            const subFiles = await traverse(item.id, pathLabel ? `${pathLabel} / ${name}` : name, false);
            allFilesInBranch.push(...subFiles);
          } else {
            // Filtrar archivos de sistema
            if (SYSTEM_FILES_SET.has(name) || name.endsWith('.json') || item.mimeType === 'application/json') continue;
            // Filtrar expirados
            const expiresAt = item.appProperties?.expiresAt ? parseInt(item.appProperties.expiresAt, 10) : null;
            if (expiresAt && expiresAt < Date.now()) {
              drive.files.delete({ fileId: item.id, supportsAllDrives: true }).catch(console.error);
              continue;
            }
            const fileObj = {
              ...item,
              parentFolderId: folderId,
              parentFolderName: pathLabel,
              expiresAt,
              bpm: item.appProperties?.bpm || null,
              key: item.appProperties?.key || null,
            };
            allFilesInBranch.push(fileObj);
            allArtistFiles.push(fileObj);
          }
        }
        pageToken = response.data.nextPageToken || undefined;
      } while (pageToken);

      folderFilesMap.set(folderId, allFilesInBranch);
      return allFilesInBranch;
    }

    await traverse(id, '', true);

    const getEffectiveDate = (file: any) => {
      const match = (file.name || '').match(/\[(\d{2})-(\d{2})-(\d{4})\]/);
      if (match) {
        const [, day, month, year] = match;
        const parsed = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10)).getTime();
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
      return new Date(file.modifiedTime || file.createdTime || 0).getTime();
    };

    const dateSorter = (a: any, b: any) => {
      return getEffectiveDate(b) - getEffectiveDate(a);
    };

    allArtistFiles.sort(dateSorter);

    // 3. Proyectos del artista — carpetas de la raíz del artista que NO son carpetas del sistema
    const SYSTEM_FOLDERS = new Set([
      'Images', 'images', 'Releases', 'releases',
      '01_Legal_y_Contratos', '02_Diseño_y_Media', '03_Lanzamientos_y_Proyectos', '02_Bounces_y_Grabaciones',
      'Bounces', 'bounces', 'Documents', 'documents', 'Contracts', 'contracts', 'Stems', 'stems'
    ]);
    const projectFolders = rootSubfolders.filter(f => !SYSTEM_FOLDERS.has(f.name || ''));
    const projectsData = await Promise.all(
      projectFolders.map(async (projectFolder) => {
        const projectConfig = await findAndReadJsonFile<any>('project_config.json', projectFolder.id) || { title: projectFolder.name, type: 'Project' };
        const tasksData = await findAndReadJsonFile<any>('tasks.json', projectFolder.id) || { groups: [] };
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

        const projectFiles = (folderFilesMap.get(projectFolder.id) || []).sort(dateSorter);

        return {
          id: projectFolder.id,
          title: projectConfig.title || projectFolder.name,
          type: projectConfig.type || 'Project',
          status: projectConfig.status || 'active',
          budget: projectConfig.budget || 0,
          requirePaymentForDownload: !!projectConfig.requirePaymentForDownload,
          driveUrl: projectFolder.webViewLink,
          tasks: flatTasks,
          bounces: projectFiles,
          files: projectFiles,
        };
      })
    );

    // Entrada global "Todos los archivos" siempre al inicio
    projectsData.unshift({
      id: 'all',
      title: 'Todos los archivos',
      type: 'Global',
      status: 'active',
      budget: 0,
      requirePaymentForDownload: false,
      driveUrl: '',
      tasks: projectsData.flatMap(p => p.tasks),
      bounces: allArtistFiles,
      files: allArtistFiles,
    });

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

    // 4.5 Obtener las matrices compartidas (solo las que tienen sharedInPortal === true)
    const matricesData = await findAndReadJsonFile<any>('matrices.json', id) || { matrices: [] };
    const sharedMatricesList = (matricesData.matrices || []).filter((m: any) => m.sharedInPortal === true);
    const audioFilesForMatrix = allArtistFiles.filter((f: any) => 
      f.mimeType?.includes('audio/') || 
      /\.(wav|mp3|m4a|flac|aiff|ogg)$/i.test(f.name || '')
    );

    const normalize = (s: string) => {
      if (!s) return '';
      return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    };

    const sharedMatrices = sharedMatricesList.map((m: any) => {
      let grid = m.productionGrid;
      if (m.projectId && grid) {
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
                for (const file of audioFilesForMatrix) {
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
      }

      return {
        id: m.id,
        name: m.name,
        productionGrid: grid
      };
    });

    // 5. Obtener releases públicas del artista
    let releases: any[] = [];
    try {
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

    const response = NextResponse.json({ 
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

    response.headers.set('Cache-Control', 'no-store, max-age=0');
    return response;
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
