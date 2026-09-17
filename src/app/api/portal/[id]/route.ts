export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { NextResponse } from 'next/server';
import { findAndReadJsonFile, getDriveService, listFolders, saveJsonFile } from '@/lib/drive';
import { DRIVE_ROOT_FOLDER_ID } from '@/lib/constants';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

// Artist-root folders that are never shown as projects in the portal
const SYSTEM_FOLDERS = new Set([
  'images', 'releases', 'documents', 'contracts', 'stems',
  '01_legal_y_contratos', '02_diseño_y_media', '03_lanzamientos_y_proyectos', '02_bounces_y_grabaciones',
]);
// Folders whose content never appears in the portal (release artwork, profile images…)
const HIDDEN_CONTENT_FOLDERS = new Set(['images', 'releases']);

const DEFAULT_MODULES = [
  { id: 'bounces', type: 'bounces', isVisible: true, order: 0, title: 'Últimas mezclas y archivos' },
  { id: 'releases', type: 'releases', isVisible: true, order: 1, title: 'Previews y lanzamientos' },
  { id: 'finances', type: 'finances', isVisible: false, order: 2, title: 'Resumen financiero' },
  { id: 'tasks', type: 'tasks', isVisible: true, order: 3, title: 'Estado del trabajo' },
];

const FIELDS = 'nextPageToken, files(id, name, mimeType, webViewLink, createdTime, modifiedTime, size, appProperties, thumbnailLink, parents)';

/** Effective date of a file: "[DD-MM-YYYY]" in the name (bounces) wins over Drive's modifiedTime. */
function effectiveDate(file: any): number {
  const match = (file.name || '').match(/\[(\d{2})-(\d{2})-(\d{4})\]/);
  if (match) {
    const parsed = new Date(parseInt(match[3], 10), parseInt(match[2], 10) - 1, parseInt(match[1], 10)).getTime();
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return new Date(file.modifiedTime || file.createdTime || 0).getTime();
}

function isTrackable(col: any) {
  return !col?.type || col.type === 'status' || col.type === 'file';
}

function matrixStats(matrix: any) {
  const rows: any[] = matrix?.productionGrid?.rows || [];
  const cols: any[] = (matrix?.productionGrid?.columns || []).filter(isTrackable);
  const total = rows.length * cols.length;
  let done = 0;
  for (const r of rows) for (const c of cols) if (r?.cells?.[c.id]?.status === 'done') done++;
  return { total, done, percent: total ? Math.round((done / total) * 100) : 0 };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const drive = getDriveService();

    const [artistConfig, storedPortalConfig, matricesData, feedbackData, allPayments] = await Promise.all([
      findAndReadJsonFile<any>('artist_config.json', id),
      findAndReadJsonFile<any>('portal_config.json', id).catch(() => null),
      findAndReadJsonFile<any>('matrices.json', id).catch(() => null),
      findAndReadJsonFile<any>('portal_feedback.json', id).catch(() => null),
      findAndReadJsonFile<any[]>('payments_db.json', DRIVE_ROOT_FOLDER_ID).catch(() => null),
    ]);

    if (!artistConfig) {
      return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
    }

    const portalConfig: any = storedPortalConfig || { modules: DEFAULT_MODULES };
    if (!Array.isArray(portalConfig.modules)) portalConfig.modules = [...DEFAULT_MODULES];
    const existingTypes = new Set(portalConfig.modules.map((m: any) => m.type));
    for (const def of DEFAULT_MODULES) {
      if (!existingTypes.has(def.type)) portalConfig.modules.push({ ...def, order: portalConfig.modules.length });
    }
    const hiddenProjectIds = new Set<string>(Array.isArray(portalConfig.hiddenProjectIds) ? portalConfig.hiddenProjectIds : []);

    // ── 1. Breadth-first traversal of the artist folder, one level at a time in parallel ──
    const listChildren = async (folderId: string) => {
      const all: any[] = [];
      let pageToken: string | undefined;
      do {
        const res: any = await drive.files.list({
          q: `'${folderId}' in parents and trashed=false`,
          fields: FIELDS,
          includeItemsFromAllDrives: true,
          supportsAllDrives: true,
          pageSize: 1000,
          pageToken,
        });
        all.push(...(res.data.files || []));
        pageToken = res.data.nextPageToken || undefined;
      } while (pageToken);
      return all;
    };

    type FolderInfo = { id: string; name: string; path: string; projectId: string | null };
    const folderInfo = new Map<string, FolderInfo>([[id, { id, name: artistConfig.name, path: '', projectId: null }]]);
    const rootSubfolders: any[] = [];
    const allFiles: any[] = [];
    const now = Date.now();

    let level = [id];
    for (let depth = 0; level.length > 0 && depth < 12; depth++) {
      const results = await Promise.all(level.map(async folderId => ({ folderId, items: await listChildren(folderId) })));
      const next: string[] = [];
      for (const { folderId, items } of results) {
        const parent = folderInfo.get(folderId)!;
        for (const item of items) {
          const name: string = item.name || '';
          if (item.mimeType === FOLDER_MIME) {
            const lower = name.toLowerCase();
            if (folderId === id) {
              if (HIDDEN_CONTENT_FOLDERS.has(lower) || name.startsWith('00_') || name.startsWith('.')) continue;
              rootSubfolders.push(item);
            }
            const isProject = folderId === id && !SYSTEM_FOLDERS.has(lower) && !/^bounces?$/i.test(name);
            const projectId = folderId === id ? (isProject ? item.id : null) : parent.projectId;
            if (projectId && hiddenProjectIds.has(projectId)) continue;
            folderInfo.set(item.id, { id: item.id, name, path: parent.path ? `${parent.path} / ${name}` : name, projectId });
            next.push(item.id);
            continue;
          }
          if (name.endsWith('.json') || item.mimeType === 'application/json' || name.startsWith('.')) continue;
          const expiresAt = item.appProperties?.expiresAt ? parseInt(item.appProperties.expiresAt, 10) : null;
          if (expiresAt && expiresAt < now) {
            drive.files.delete({ fileId: item.id, supportsAllDrives: true }).catch(() => {});
            continue;
          }
          allFiles.push({
            id: item.id,
            name,
            mimeType: item.mimeType,
            size: item.size,
            createdTime: item.createdTime,
            modifiedTime: item.modifiedTime,
            webViewLink: item.webViewLink,
            thumbnailLink: item.thumbnailLink,
            parentFolderId: folderId,
            parentFolderName: parent.path,
            projectId: parent.projectId,
            expiresAt,
            bpm: item.appProperties?.bpm || null,
            key: item.appProperties?.key || null,
            effectiveDate: effectiveDate(item),
          });
        }
      }
      level = next;
    }

    allFiles.sort((a, b) => b.effectiveDate - a.effectiveDate);

    // ── 2. Projects ──
    const matrices: any[] = Array.isArray(matricesData?.matrices) ? matricesData.matrices : [];
    const projectFolders = rootSubfolders.filter(f => !SYSTEM_FOLDERS.has((f.name || '').toLowerCase()) && !/^bounces?$/i.test(f.name || '') && !hiddenProjectIds.has(f.id));

    const projectsData = await Promise.all(projectFolders.map(async folder => {
      const [projectConfig, tasksData] = await Promise.all([
        findAndReadJsonFile<any>('project_config.json', folder.id).catch(() => null),
        findAndReadJsonFile<any>('tasks.json', folder.id).catch(() => null),
      ]);
      const flatTasks: any[] = [];
      if (Array.isArray(tasksData?.groups)) {
        tasksData.groups.forEach((g: any) => (g.tasks || []).forEach((t: any) => flatTasks.push({ id: t.id, title: t.title, status: t.status === 'done' ? 'completed' : 'pending' })));
      } else if (Array.isArray(tasksData)) {
        tasksData.forEach((t: any) => flatTasks.push({ id: t.id, title: t.title, status: t.status === 'completed' ? 'completed' : 'pending' }));
      }
      const files = allFiles.filter(f => f.projectId === folder.id);
      const sharedMatrix = matrices.find(m => m.projectId === folder.id && m.sharedInPortal === true);
      return {
        id: folder.id,
        title: folder.name || projectConfig?.title || 'Proyecto',
        type: projectConfig?.type || 'single',
        status: projectConfig?.status || 'active',
        deliveryDate: projectConfig?.deliveryDate || null,
        releaseDate: projectConfig?.releaseDate || null,
        budget: projectConfig?.budget || 0,
        requirePaymentForDownload: !!projectConfig?.requirePaymentForDownload,
        driveUrl: folder.webViewLink,
        tasks: flatTasks,
        progress: sharedMatrix ? matrixStats(sharedMatrix).percent : null,
        lastActivity: files[0]?.effectiveDate || null,
        bounces: files,
        files,
      };
    }));

    projectsData.sort((a, b) => {
      if ((a.status === 'archived') !== (b.status === 'archived')) return a.status === 'archived' ? 1 : -1;
      return (b.lastActivity || 0) - (a.lastActivity || 0);
    });

    // Files outside any project (e.g. the artist's Bounces folder or loose files)
    const generalFiles = allFiles.filter(f => !f.projectId);
    if (generalFiles.length > 0) {
      projectsData.unshift({
        id: 'general',
        title: 'Bounces y archivos generales',
        type: 'general',
        status: 'active',
        deliveryDate: null,
        releaseDate: null,
        budget: 0,
        requirePaymentForDownload: false,
        driveUrl: '',
        tasks: [],
        progress: null,
        lastActivity: generalFiles[0]?.effectiveDate || null,
        bounces: generalFiles,
        files: generalFiles,
      });
    }

    // "All files" entry first (kept for the release player and backwards compatibility)
    projectsData.unshift({
      id: 'all',
      title: 'Todos los archivos',
      type: 'Global',
      status: 'active',
      deliveryDate: null,
      releaseDate: null,
      budget: 0,
      requirePaymentForDownload: false,
      driveUrl: '',
      tasks: projectsData.flatMap(p => p.tasks),
      progress: null,
      lastActivity: allFiles[0]?.effectiveDate || null,
      bounces: allFiles,
      files: allFiles,
    });

    // ── 3. Finances ──
    const artistPayments = (allPayments || []).filter((p: any) => p.artistId === id && p.status === 'paid');
    const totalBudget = projectsData.filter(p => p.id !== 'all' && p.id !== 'general').reduce((s, p) => s + (p.budget || 0), 0);
    const totalPaid = artistPayments.reduce((s: number, p: any) => s + (p.amount || 0), 0);
    const pendingPayment = Math.max(0, totalBudget - totalPaid);

    // ── 4. Shared matrices (auto-link audio files by row name when a file column is empty) ──
    const normalize = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
    const audioFiles = allFiles.filter(f => f.mimeType?.includes('audio/') || /\.(wav|mp3|m4a|flac|aiff?|ogg)$/i.test(f.name || ''));
    const sharedMatrices = matrices
      .filter(m => m.sharedInPortal === true && !(m.projectId && hiddenProjectIds.has(m.projectId)))
      .map(m => {
        let grid = m.productionGrid;
        if (grid && Array.isArray(grid.rows) && Array.isArray(grid.columns)) {
          grid = {
            ...grid,
            rows: grid.rows.map((row: any) => {
              const rowName = normalize(row.name);
              if (!rowName) return row;
              const cells = { ...row.cells };
              let changed = false;
              for (const col of grid.columns) {
                if (col.type !== 'file') continue;
                const cell = cells[col.id] || { status: 'todo' };
                if (cell.fileId) continue;
                const candidates = audioFiles.filter(f => (!m.projectId || f.projectId === m.projectId) && normalize(f.name).includes(rowName));
                const best = candidates.sort((a, b) => normalize(a.name).length - normalize(b.name).length)[0];
                if (best) {
                  cells[col.id] = { ...cell, fileId: best.id, fileName: best.name, status: 'done' };
                  changed = true;
                }
              }
              return changed ? { ...row, cells } : row;
            }),
          };
        }
        return { id: m.id, name: m.name, projectId: m.projectId || null, productionGrid: grid, stats: matrixStats({ productionGrid: grid }) };
      });

    // ── 5. Public releases ──
    let releases: any[] = [];
    try {
      const releasesRes = await drive.files.list({
        q: `mimeType='${FOLDER_MIME}' and name='Releases' and '${id}' in parents and trashed=false`,
        fields: 'files(id)',
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
      });
      const releasesFolderId = releasesRes.data.files?.[0]?.id;
      if (releasesFolderId) {
        const releaseFolders = await listFolders(releasesFolderId);
        const data = await Promise.all(releaseFolders.map(async rf => {
          const config = await findAndReadJsonFile<any>('release_config.json', rf.id!).catch(() => null);
          if (!config || !config.isPublic) return null;
          return { id: rf.id, title: config.title, coverArtId: config.coverArtId, tracks: config.tracks || [], isPublic: config.isPublic, createdAt: config.createdAt };
        }));
        releases = data.filter(Boolean);
      }
    } catch {
      // releases are optional
    }

    // The producer-only fields never reach the artist
    const { hiddenProjectIds: _hidden, ...publicConfig } = portalConfig;

    const response = NextResponse.json({
      artist: { id: artistConfig.id || id, name: artistConfig.name, photo: artistConfig.photo, photoUrl: artistConfig.photoUrl },
      producerName: portalConfig.producerName || 'EZY Studio',
      producerLogo: portalConfig.producerLogo,
      welcomeMessage: portalConfig.welcomeMessage || '',
      projects: projectsData,
      releases,
      finances: { totalBudget, totalPaid, pendingPayment },
      sharedMatrices,
      feedback: (feedbackData?.feedback || []).filter((f: any) => !f.fromProducer || f.visibleToArtist !== false).slice(0, 50),
      config: publicConfig,
    });
    response.headers.set('Cache-Control', 'no-store, max-age=0');
    return response;
  } catch (error: any) {
    console.error('API /portal/[id] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch portal details', details: error.message }, { status: 500 });
  }
}

// POST: the artist sends a comment from the portal
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const message = typeof body.message === 'string' ? body.message.trim().slice(0, 4000) : '';
    const authorName = typeof body.authorName === 'string' ? body.authorName.trim().slice(0, 80) : '';
    if (!message || !authorName) {
      return NextResponse.json({ error: 'Faltan el nombre o el mensaje' }, { status: 400 });
    }

    const portalConfig = await findAndReadJsonFile<any>('portal_config.json', id).catch(() => null);
    if (portalConfig && portalConfig.showFeedback === false) {
      return NextResponse.json({ error: 'Los comentarios están desactivados en este portal' }, { status: 403 });
    }

    const feedbackData = (await findAndReadJsonFile<any>('portal_feedback.json', id)) || { feedback: [] };
    const newFeedback = {
      id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      message,
      authorName,
      trackId: typeof body.trackId === 'string' ? body.trackId : null,
      trackTitle: typeof body.trackTitle === 'string' ? body.trackTitle.slice(0, 200) : null,
      projectId: typeof body.projectId === 'string' ? body.projectId : null,
      timestamp: new Date().toISOString(),
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
