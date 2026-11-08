import { findAndReadJsonFile, listFolders } from '@/lib/drive';
import { DRIVE_ROOT_FOLDER_ID, isSystemOrSpecialFolder } from '@/lib/constants';
import { listPosts } from '@/lib/instagram/store';
import type { Payment } from '@/types';
import type { IgPost } from '@/types/instagram';

/**
 * Read-only snapshot of everything the hub feed needs. It only reads: unlike GET /api/projects or
 * /api/artists/<id>, it never creates a missing JSON file, so asking the hub never changes Drive.
 */

export interface HubProject {
  id: string;
  title: string;
  status?: string;
  deliveryDate?: string;
  releaseDate?: string;
  updatedAt?: string;
  productionGrid?: unknown;
}

export interface HubMessage {
  id: string;
  authorIsProducer: boolean;
  isRead: boolean;
  timestamp?: string;
  trackTitle?: string | null;
}

export interface HubMatrix {
  id: string;
  name?: string;
  forceStatus?: string;
  productionGrid?: unknown;
}

export interface HubArtist {
  id: string;
  name: string;
  matrices: HubMatrix[];
  messages: HubMessage[];
  projects: HubProject[];
}

export interface HubSnapshot {
  artists: HubArtist[];
  payments: Payment[];
  posts: IgPost[];
}

/** Runs `fn` over `items` with at most `limit` Drive calls in flight. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

const readJson = <T>(name: string, folderId: string) => findAndReadJsonFile<T>(name, folderId).catch(() => null);
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

interface ProjectConfigLike { title?: unknown; status?: unknown; deliveryDate?: unknown; releaseDate?: unknown; updatedAt?: unknown }
interface FeedbackLike { id?: unknown; fromProducer?: unknown; isRead?: unknown; timestamp?: unknown; trackTitle?: unknown }

async function readProject(folder: { id?: string | null; name?: string | null }): Promise<HubProject | null> {
  const id = folder.id;
  if (!id) return null;
  // Only folders the dashboard already treats as projects (they have a project_config.json)
  const config = await readJson<ProjectConfigLike>('project_config.json', id);
  if (!config) return null;
  const tasks = await readJson<{ productionGrid?: unknown } | unknown[]>('tasks.json', id);
  return {
    id,
    // The folder name wins, as in GET /api/projects (it may have been renamed in Drive)
    title: folder.name || str(config.title) || 'Proyecto',
    status: str(config.status),
    deliveryDate: str(config.deliveryDate),
    releaseDate: str(config.releaseDate),
    updatedAt: str(config.updatedAt),
    productionGrid: tasks && !Array.isArray(tasks) ? tasks.productionGrid : undefined,
  };
}

async function readArtist(folder: { id?: string | null; name?: string | null }): Promise<HubArtist | null> {
  const id = folder.id;
  if (!id) return null;
  const [matricesData, feedbackData, subfolders] = await Promise.all([
    readJson<{ matrices?: unknown }>('matrices.json', id),
    readJson<{ feedback?: unknown }>('portal_feedback.json', id),
    listFolders(id).catch(() => []),
  ]);
  const projects = (await mapLimit(subfolders.filter((f: { name?: string | null }) => !isSystemOrSpecialFolder(f.name)), 4, readProject))
    .filter((p): p is HubProject => p !== null);
  const feedback: FeedbackLike[] = Array.isArray(feedbackData?.feedback) ? feedbackData.feedback : [];
  const matrices: HubMatrix[] = (Array.isArray(matricesData?.matrices) ? matricesData.matrices : [])
    .filter((m: { id?: unknown }) => typeof m?.id === 'string');
  return {
    id,
    name: folder.name || 'Artista',
    matrices,
    messages: feedback.map((f) => ({
      id: String(f.id),
      authorIsProducer: !!f.fromProducer,
      isRead: !!f.isRead,
      timestamp: typeof f.timestamp === 'string' ? f.timestamp : undefined,
      trackTitle: typeof f.trackTitle === 'string' ? f.trackTitle : null,
    })),
    projects,
  };
}

export async function collectHubSnapshot(): Promise<HubSnapshot> {
  if (!DRIVE_ROOT_FOLDER_ID) throw new Error('Falta DRIVE_ROOT_FOLDER_ID');
  const [folders, payments, posts] = await Promise.all([
    listFolders(DRIVE_ROOT_FOLDER_ID),
    findAndReadJsonFile<Payment[]>('payments_db.json', DRIVE_ROOT_FOLDER_ID).catch(() => null),
    listPosts(['PENDING', 'PROCESSING', 'FAILED']).catch(() => [] as IgPost[]),
  ]);
  const artistFolders = folders.filter((f: { name?: string | null }) => !isSystemOrSpecialFolder(f.name));
  const artists = (await mapLimit(artistFolders, 8, readArtist)).filter((a): a is HubArtist => a !== null);
  return { artists, payments: Array.isArray(payments) ? payments : [], posts };
}
