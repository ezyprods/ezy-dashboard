'use client';

import { findBestMatch, getNormalizedBaseName, sortArtistsByRecent } from '@/lib/utils';
import { parseAudioFilename } from '@/lib/utils/audio';
import { getFolder } from '@/components/explorer/driveStore';
import { getExtension, stripExtension } from '@/components/explorer/fileKinds';
import type { DriveItem, Crumb } from '@/components/explorer/types';
import type { Artist } from '@/types';
import { relativePathOf } from './fileIntake';

export type UploadRole = 'bounce' | 'mix' | 'master' | 'stem' | 'cover' | 'other';
export type UploadKind = 'audio' | 'image' | 'video' | 'other';
export type UploadStatus = 'pending' | 'uploading' | 'done' | 'error' | 'cancelled';

/** Where a group of files goes. Per-file overrides use the same shape. */
export interface Destination {
  /** 'library' = the beat library (Proyectos personales) */
  targetType: 'artist' | 'library';
  artistId: string;
  /** Project folder inside the artist ('' = automatic: bounces → Bounces, rest → artist root) */
  projectId: string;
  /** Exact folder chosen by the user (or preselected by the page); overrides the automatic routing */
  lockedFolder: Crumb | null;
}

export interface UploadItem {
  id: string;
  file: File;
  kind: UploadKind;
  role: UploadRole;
  /** Name without extension, editable by the user */
  baseName: string;
  ext: string;
  nameEdited: boolean;
  bpm: number | null;
  key: string | null;
  analyzing: boolean;
  /** Subfolders coming from a dropped folder, e.g. ["Stems", "Vocals"] */
  subPath: string[];
  /** Destination just for this file (falls back to the shared one) */
  dest: Destination | null;
  replaceMode: 'replace' | 'new';
  status: UploadStatus;
  progress: number;
  error?: string;
  resultId?: string;
  resultFolderId?: string;
  resultFolderName?: string;
  replaced?: boolean;
}

export interface Plan {
  /** Existing destination folder (before the dropped-folder subpath) */
  baseFolderId?: string;
  /** Folder that has to be created first */
  baseCreate?: { name: string; parentId: string };
  /** Subfolders to create/reuse below the base */
  subPath: string[];
  label: string;
  error?: string;
}

const AUDIO_EXT = /\.(wav|mp3|aif|aiff|flac|m4a|aac|ogg|opus|wma)$/i;
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif|svg|bmp|tiff?)$/i;
const VIDEO_EXT = /\.(mp4|mov|m4v|webm|avi|mkv)$/i;

/** Artist-root folders that are not projects */
export const NON_PROJECT_FOLDERS = /^(images|releases|bounces?|documents|contracts|stems|01_legal_y_contratos|02_diseño_y_media|03_lanzamientos_y_proyectos|02_bounces_y_grabaciones)$/i;

export const ROLE_LABEL: Record<UploadRole, string> = {
  bounce: 'Bounce / Demo',
  mix: 'Mezcla',
  master: 'Master',
  stem: 'Stem / Pista',
  cover: 'Portada',
  other: 'Archivo',
};

export const EXPIRATION_OPTIONS = [
  { label: '1 h', ms: 60 * 60 * 1000 },
  { label: '6 h', ms: 6 * 60 * 60 * 1000 },
  { label: '24 h', ms: 24 * 60 * 60 * 1000 },
  { label: '3 días', ms: 3 * 24 * 60 * 60 * 1000 },
  { label: '7 días', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: '30 días', ms: 30 * 24 * 60 * 60 * 1000 },
];

export function detectKind(file: File): UploadKind {
  if (file.type.startsWith('audio/') || AUDIO_EXT.test(file.name)) return 'audio';
  if (file.type.startsWith('image/') || IMAGE_EXT.test(file.name)) return 'image';
  if (file.type.startsWith('video/') || VIDEO_EXT.test(file.name)) return 'video';
  return 'other';
}

export function detectRole(file: File, kind: UploadKind): UploadRole {
  const n = `${relativePathOf(file)}/${file.name}`.toLowerCase();
  if (kind === 'audio') {
    if (/master/.test(n)) return 'master';
    if (/\bmix\b|mezcla|_mix|mix_|mixdown/.test(n)) return 'mix';
    if (/\bstems?\b|pista|\btrack\s*\d|acapella|instrumental\b|\bvox\b|vocals?\b/.test(n)) return 'stem';
    return 'bounce';
  }
  if (kind === 'image' && /cover|portada|artwork|caratula|carátula/.test(n)) return 'cover';
  return 'other';
}

function todayStamp() {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}

/** Suggested file name (without extension) for the current role and target. */
export function suggestBaseName(item: Pick<UploadItem, 'file' | 'kind' | 'role' | 'bpm' | 'key'>, targetType: Destination['targetType']): string {
  const original = stripExtension(item.file.name);
  // The library keeps the exact name the file was dragged in with (BPM/key are still detected
  // and stored for filtering/badges, just not injected into the visible filename).
  if (targetType === 'library') return original;
  if (targetType === 'artist' && item.role === 'bounce') {
    // Bounces carry the upload date so the artist portal can order versions
    const clean = original.replace(/\s*\[\d{2}-\d{2}-\d{4}\]\s*$/, '').trim();
    return `${clean} [${todayStamp()}]`;
  }
  return original;
}

let itemSeq = 0;

export function makeItem(file: File, targetType: Destination['targetType'], dest: Destination | null = null): UploadItem {
  const kind = detectKind(file);
  const role = detectRole(file, kind);
  const parsed = kind === 'audio' ? parseAudioFilename(file.name) : null;
  const relative = relativePathOf(file);
  const base = {
    id: `u${++itemSeq}-${Math.random().toString(36).slice(2, 7)}`,
    file,
    kind,
    role,
    ext: getExtension(file.name) ? `.${getExtension(file.name)}` : '',
    bpm: parsed?.bpm ?? null,
    key: parsed?.key ?? null,
  };
  return {
    ...base,
    baseName: suggestBaseName(base, targetType),
    nameEdited: false,
    analyzing: kind === 'audio' && (!parsed?.bpm || !parsed?.key),
    subPath: relative ? relative.split('/').filter(Boolean) : [],
    dest,
    replaceMode: 'replace',
    status: 'pending',
    progress: 0,
  };
}

/** Finds the artist whose name appears in most of the file names. */
export function detectArtist(files: File[], artists: Artist[]): string {
  const sorted = sortArtistsByRecent(artists);
  const votes = new Map<string, number>();
  for (const file of files) {
    const normalized = getNormalizedBaseName(`${relativePathOf(file)} ${file.name}`);
    const squashed = normalized.replace(/\s+/g, '');
    let match = sorted.find(a => {
      const n = getNormalizedBaseName(a.name);
      return n.length > 2 && normalized.includes(n);
    });
    if (!match) {
      match = sorted.find(a => {
        const n = getNormalizedBaseName(a.name).replace(/\s+/g, '');
        return n.length > 3 && squashed.includes(n);
      });
    }
    if (match) votes.set(match.id, (votes.get(match.id) || 0) + 1);
  }
  let best = '';
  let bestVotes = 0;
  for (const [id, n] of votes) if (n > bestVotes) { best = id; bestVotes = n; }
  return best;
}

export function projectFoldersOf(artistId: string): DriveItem[] {
  return getFolder(artistId).items
    .filter(i => i.isFolder && !NON_PROJECT_FOLDERS.test(i.name.trim()) && !i.name.startsWith('00_'))
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
}

/** Project name without numbering, notes in brackets and accents: "1 - Escameando (Cedido)" → "escameando" */
function projectKey(name: string): string {
  return getNormalizedBaseName(
    name
      .replace(/^\s*\d{1,3}\s*[-_.)]\s*/, '')
      .replace(/\((?:cedido|old|backup|copia)[^)]*\)/gi, ''),
  ).replace(/\s+/g, '');
}

/** Project folder that matches a file name (or the folder it was dropped from). */
export function detectProjectForFile(file: File, artistId: string, artistName?: string): string {
  const projects = projectFoldersOf(artistId);
  if (projects.length === 0) return '';
  const artistKey = artistName ? getNormalizedBaseName(artistName).replace(/\s+/g, '') : '';
  const keyed = projects
    .map(p => ({ project: p, key: projectKey(p.name) }))
    .filter(p => p.key.length >= 4 && p.key !== artistKey);

  let fileKey = getNormalizedBaseName(`${relativePathOf(file)} ${stripExtension(file.name)}`).replace(/\s+/g, '');
  if (artistKey) fileKey = fileKey.replace(artistKey, '');
  const contained = keyed.filter(p => fileKey.includes(p.key)).sort((a, b) => b.key.length - a.key.length)[0];
  if (contained) return contained.project.id;

  const fuzzy = findBestMatch(stripExtension(file.name), projects, p => p.name.replace(/^\s*\d{1,3}\s*[-_.)]\s*/, ''), 0.8);
  return fuzzy ? fuzzy.id : '';
}

/** Project shared by most of the files (used for the shared destination). */
export function detectProject(files: File[], artistId: string, artistName?: string): string {
  const votes = new Map<string, number>();
  for (const file of files) {
    const id = detectProjectForFile(file, artistId, artistName);
    if (id) votes.set(id, (votes.get(id) || 0) + 1);
  }
  let best = '';
  let bestVotes = 0;
  for (const [id, n] of votes) if (n > bestVotes) { best = id; bestVotes = n; }
  return best;
}

function findSub(parentId: string, pattern: RegExp): DriveItem | undefined {
  return getFolder(parentId).items.filter(i => i.isFolder).find(f => pattern.test(f.name.trim()));
}

export function effectiveDest(item: UploadItem, shared: Destination): Destination {
  return item.dest || shared;
}

export interface DestinationNames {
  artistName?: string;
  projectName?: string;
  libraryRootId?: string;
  libraryName?: string;
}

/** Computes where a file will be stored (using the explorer's folder cache). */
export function planDestination(item: UploadItem, dest: Destination, names: DestinationNames): Plan {
  const subPath = item.subPath;
  const withSub = (plan: Omit<Plan, 'subPath' | 'label'> & { label: string }): Plan => ({
    ...plan,
    subPath,
    label: subPath.length ? `${plan.label} / ${subPath.join(' / ')}` : plan.label,
  });

  if (dest.lockedFolder) return withSub({ baseFolderId: dest.lockedFolder.id, label: dest.lockedFolder.name });

  // The library has no automatic routing: the user organises it with free folders
  if (dest.targetType === 'library') {
    if (!names.libraryRootId) return { subPath, label: '', error: 'Cargando la biblioteca…' };
    return withSub({ baseFolderId: names.libraryRootId, label: names.libraryName || 'Proyectos personales' });
  }

  const aid = dest.artistId;
  if (!aid) return { subPath, label: '', error: 'Elige un artista' };
  const artistName = names.artistName || 'Artista';

  if (dest.projectId) {
    const projectName = names.projectName || 'Proyecto';
    const base = `${artistName} / ${projectName}`;
    const patterns: Partial<Record<UploadRole, RegExp>> = {
      master: /master/i,
      mix: /mezcla|\bmix|revision|revisión/i,
      stem: /stem|pista/i,
      bounce: /bounce/i,
    };
    // A dropped folder keeps its own structure: don't also route by type
    const pattern = item.kind === 'audio' && subPath.length === 0 ? patterns[item.role] : undefined;
    const sub = pattern ? findSub(dest.projectId, pattern) : undefined;
    return sub
      ? withSub({ baseFolderId: sub.id, label: `${base} / ${sub.name}` })
      : withSub({ baseFolderId: dest.projectId, label: base });
  }

  if (item.kind === 'audio' && item.role === 'bounce' && subPath.length === 0) {
    const bounces = findSub(aid, /^bounces?$/i) || findSub(aid, /bounce/i);
    return bounces
      ? withSub({ baseFolderId: bounces.id, label: `${artistName} / ${bounces.name}` })
      : withSub({ baseCreate: { name: 'Bounces', parentId: aid }, label: `${artistName} / Bounces` });
  }
  return withSub({ baseFolderId: aid, label: artistName });
}

/** Existing audio file with the same name in the destination (masters & mixes replace it by default). */
export function findReplaceCandidate(item: UploadItem, plan: Plan): DriveItem | null {
  if (!plan.baseFolderId || plan.subPath.length > 0) return null;
  if (item.kind !== 'audio' || (item.role !== 'master' && item.role !== 'mix')) return null;
  const target = `${item.baseName}${item.ext}`.toLowerCase();
  return getFolder(plan.baseFolderId).items.find(i => !i.isFolder && i.name.toLowerCase() === target) || null;
}
