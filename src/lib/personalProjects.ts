import { 
  getDriveService, 
  createFolder, 
  saveJsonFile, 
  findAndReadJsonFile, 
  listFolders, 
  listFiles, 
  fetchFoldersRecursively 
} from '@/lib/drive';
import { 
  DRIVE_ROOT_FOLDER_ID, 
  PERSONAL_PROJECTS_ROOT_FOLDER_NAME, 
  PERSONAL_PROJECT_CATEGORIES, 
  PERSONAL_PROJECT_SUBFOLDERS 
} from '@/lib/constants';
import type { 
  PersonalProject, 
  PersonalProjectCategory, 
  CreatePersonalProjectInput, 
  PersonalTasksData,
  Project,
  ArtistConfig
} from '@/types';

/**
 * Obtiene o crea la carpeta raíz "00_PROYECTOS_PERSONALES" y las subcarpetas de categorías
 */
export async function getOrCreatePersonalProjectsRoot(): Promise<{
  rootFolderId: string;
  categoryFolders: Record<PersonalProjectCategory, string>;
}> {
  const drive = getDriveService();
  const rootFolders = await listFolders(DRIVE_ROOT_FOLDER_ID);
  
  let rootFolder = rootFolders.find(
    f => (f.name || '').trim().toLowerCase() === PERSONAL_PROJECTS_ROOT_FOLDER_NAME.toLowerCase()
  );

  let rootFolderId: string;
  if (!rootFolder) {
    rootFolderId = await createFolder(PERSONAL_PROJECTS_ROOT_FOLDER_NAME, DRIVE_ROOT_FOLDER_ID);
  } else {
    rootFolderId = rootFolder.id!;
  }

  // Comprobar / crear subcarpetas de categorías
  const existingSubfolders = await listFolders(rootFolderId);
  const categoryFolders: Record<string, string> = {};

  for (const [catKey, catConfig] of Object.entries(PERSONAL_PROJECT_CATEGORIES)) {
    const found = existingSubfolders.find(
      f => (f.name || '').trim().toLowerCase() === catConfig.folderName.toLowerCase()
    );
    if (found) {
      categoryFolders[catKey] = found.id!;
    } else {
      const createdId = await createFolder(catConfig.folderName, rootFolderId);
      categoryFolders[catKey] = createdId;
    }
  }

  return {
    rootFolderId,
    categoryFolders: categoryFolders as Record<PersonalProjectCategory, string>,
  };
}

/**
 * Lee el índice maestro personal_projects_db.json o lo reconstruye escaneando Drive
 */
export async function getPersonalProjectsDb(rootFolderId?: string): Promise<{
  projects: PersonalProject[];
  rootFolderId: string;
}> {
  let targetRootId = rootFolderId;
  let categoryFolders: Record<PersonalProjectCategory, string> | null = null;

  if (!targetRootId) {
    const rootData = await getOrCreatePersonalProjectsRoot();
    targetRootId = rootData.rootFolderId;
    categoryFolders = rootData.categoryFolders;
  }

  const existingDb = await findAndReadJsonFile<PersonalProject[]>(
    'personal_projects_db.json',
    targetRootId
  ).catch(() => null);

  if (Array.isArray(existingDb) && existingDb.length > 0) {
    return { projects: existingDb, rootFolderId: targetRootId };
  }

  // Si no existe el DB o está vacío, escaneamos las subcarpetas de categorías para auto-reconstruir
  if (!categoryFolders) {
    const rootData = await getOrCreatePersonalProjectsRoot();
    categoryFolders = rootData.categoryFolders;
  }

  const scannedProjects: PersonalProject[] = [];
  const now = new Date().toISOString();

  for (const [catKey, catFolderId] of Object.entries(categoryFolders)) {
    try {
      const projFolders = await listFolders(catFolderId);
      for (const pFolder of projFolders) {
        const config = await findAndReadJsonFile<PersonalProject>(
          'personal_project_config.json',
          pFolder.id!
        ).catch(() => null);

        if (config) {
          scannedProjects.push({
            ...config,
            id: pFolder.id!,
            driveFolderId: pFolder.id!,
            driveUrl: pFolder.webViewLink || undefined,
          });
        } else {
          // Auto-inicializar configuración básica para carpeta huérfana
          const newProj: PersonalProject = {
            id: pFolder.id!,
            title: pFolder.name || 'Proyecto sin título',
            category: catKey as PersonalProjectCategory,
            tags: [],
            status: 'idea',
            driveFolderId: pFolder.id!,
            driveUrl: pFolder.webViewLink || undefined,
            createdAt: pFolder.createdTime || now,
            updatedAt: pFolder.createdTime || now,
          };
          await saveJsonFile('personal_project_config.json', newProj, pFolder.id!);
          scannedProjects.push(newProj);
        }
      }
    } catch (err) {
      console.error(`Error scanning category folder ${catKey}:`, err);
    }
  }

  // Guardar el DB reconstruido
  await saveJsonFile('personal_projects_db.json', scannedProjects, targetRootId);

  return { projects: scannedProjects, rootFolderId: targetRootId };
}

/**
 * Guarda el índice maestro personal_projects_db.json
 */
export async function savePersonalProjectsDb(
  projects: PersonalProject[],
  rootFolderId: string
): Promise<void> {
  await saveJsonFile('personal_projects_db.json', projects, rootFolderId);
}

/**
 * Crea un nuevo proyecto personal
 */
export async function createPersonalProject(
  input: CreatePersonalProjectInput
): Promise<PersonalProject> {
  const { rootFolderId, categoryFolders } = await getOrCreatePersonalProjectsRoot();
  const catFolderId = categoryFolders[input.category] || categoryFolders.beat;

  const now = new Date();
  const year = (input.year && !isNaN(Number(input.year)) && Number(input.year) > 1900) ? Number(input.year) : now.getFullYear();
  const month = (input.month && !isNaN(Number(input.month)) && Number(input.month) >= 1 && Number(input.month) <= 12) ? Number(input.month) : (now.getMonth() + 1);

  // 1. Crear carpeta del proyecto en Drive dentro de la categoría
  const projectFolderId = await createFolder(input.title, catFolderId);

  // 2. Crear subcarpetas estándar (Bounces, Stems, Backup)
  for (const subfolder of PERSONAL_PROJECT_SUBFOLDERS) {
    await createFolder(subfolder, projectFolderId);
  }

  // 3. Crear metadata del proyecto
  const newProject: PersonalProject = {
    id: projectFolderId,
    title: input.title,
    category: input.category,
    tags: input.tags || [],
    status: input.status || 'idea',
    bpm: input.bpm,
    key: input.key,
    year,
    month,
    collaborators: input.collaborators || [],
    notes: input.notes,
    driveFolderId: projectFolderId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  // 4. Guardar personal_project_config.json
  await saveJsonFile('personal_project_config.json', newProject, projectFolderId);

  // 5. Inicializar personal_tasks.json
  const initialTasks: PersonalTasksData = {
    tasks: [],
    workSessions: [],
  };
  await saveJsonFile('personal_tasks.json', initialTasks, projectFolderId);

  // 6. Actualizar índice maestro personal_projects_db.json
  const { projects } = await getPersonalProjectsDb(rootFolderId);
  const updatedProjects = [newProject, ...projects.filter(p => p.id !== projectFolderId)];
  await savePersonalProjectsDb(updatedProjects, rootFolderId);

  return newProject;
}

/**
 * Clona un proyecto personal a la carpeta de un artista
 */
export async function clonePersonalProjectToArtist(
  projectId: string,
  artistId: string,
  customTitle?: string,
  projectType: string = 'single'
): Promise<{
  clonedProjectId: string;
  artistId: string;
  project: PersonalProject;
}> {
  const drive = getDriveService();
  const { rootFolderId } = await getOrCreatePersonalProjectsRoot();

  // 1. Leer proyecto personal original
  const personalConfig = await findAndReadJsonFile<PersonalProject>(
    'personal_project_config.json',
    projectId
  );
  if (!personalConfig) {
    throw new Error('Proyecto personal no encontrado');
  }

  // 2. Leer nombre del artista
  const artistsDb = await findAndReadJsonFile<ArtistConfig[]>(
    'ezy_artists_db.json',
    DRIVE_ROOT_FOLDER_ID
  ).catch(() => []);
  const artist = (artistsDb || []).find(a => a.id === artistId);
  const artistName = artist?.name || 'Artista';

  // 3. Crear carpeta de proyecto en el artista
  const finalTitle = customTitle?.trim() || personalConfig.title;
  const clonedProjectFolderId = await createFolder(finalTitle, artistId);

  // 4. Crear subcarpetas estándar en el proyecto del artista
  const artistSubfolders = [
    '01_Sesiones_y_DAW',
    'Bounces',
    '03_Revisiones_y_Mezclas',
    '04_Masters_Finales',
    '05_Referencias_y_Otros',
  ];
  const createdSubfolders: Record<string, string> = {};
  for (const sub of artistSubfolders) {
    const subId = await createFolder(sub, clonedProjectFolderId);
    createdSubfolders[sub] = subId;
  }

  // 5. Copiar archivos de audio/bounces existentes del proyecto personal a Bounces del artista
  try {
    const { folders, files } = await fetchFoldersRecursively(drive, projectId);
    const allProjectFiles = [
      ...files,
      ...folders.flatMap(f => f.files || []),
    ];

    const audioFiles = allProjectFiles.filter(
      (f: any) => f.mimeType?.startsWith('audio/') || /\.(mp3|wav|flac|m4a|ogg)$/i.test(f.name || '')
    );

    const targetBouncesFolderId = createdSubfolders['Bounces'] || clonedProjectFolderId;

    for (const audioFile of audioFiles) {
      if (audioFile.id) {
        await drive.files.copy({
          fileId: audioFile.id,
          requestBody: {
            name: audioFile.name,
            parents: [targetBouncesFolderId],
          },
          supportsAllDrives: true,
        }).catch(err => {
          console.warn(`Could not copy audio file ${audioFile.name}:`, err);
        });
      }
    }
  } catch (copyErr) {
    console.error('Error copying files to artist project:', copyErr);
  }

  // 6. Crear project_config.json dentro del nuevo proyecto del artista
  const now = new Date().toISOString();
  const artistProjectConfig: Project = {
    id: clonedProjectFolderId,
    artistId: artistId,
    title: finalTitle,
    type: projectType as any,
    status: 'active',
    songs: [
      {
        id: Math.random().toString(36).substring(2, 9),
        trackNumber: 1,
        title: finalTitle,
        services: [{ type: 'production', status: 'in_progress' }],
        checklist: [],
        linkedFiles: [],
        versions: [],
        workSessions: [],
      },
    ],
    notes: personalConfig.notes 
      ? `[Cedido desde Proyectos Personales]\n${personalConfig.notes}` 
      : `[Cedido desde Proyectos Personales: ${personalConfig.title}]`,
    driveFolderId: clonedProjectFolderId,
    createdAt: now,
    updatedAt: now,
  };

  await saveJsonFile('project_config.json', artistProjectConfig, clonedProjectFolderId);

  // 7. Actualizar proyecto personal original: estado -> 'cedido_a_artista'
  const updatedPersonalConfig: PersonalProject = {
    ...personalConfig,
    status: 'cedido_a_artista',
    linkedArtistId: artistId,
    linkedArtistProjectId: clonedProjectFolderId,
    linkedArtistName: artistName,
    updatedAt: now,
  };

  await saveJsonFile('personal_project_config.json', updatedPersonalConfig, projectId);

  // 8. Actualizar personal_projects_db.json
  const { projects } = await getPersonalProjectsDb(rootFolderId);
  const updatedDb = projects.map(p => (p.id === projectId ? updatedPersonalConfig : p));
  await savePersonalProjectsDb(updatedDb, rootFolderId);

  return {
    clonedProjectId: clonedProjectFolderId,
    artistId,
    project: updatedPersonalConfig,
  };
}
