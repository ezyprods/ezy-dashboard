import { NextResponse, NextRequest } from 'next/server';
import { Readable } from 'stream';
import { findAndReadJsonFile, saveJsonFile, getDriveService } from '@/lib/drive';
import type { Release } from '@/types';

export const dynamic = 'force-dynamic';

/**
 * Verifies the portal token and that the artist is allowed to edit releases.
 * Returns an error response or null when access is granted.
 */
async function verifyPortalAccess(artistId: string, token: string | null | undefined) {
  if (!token) {
    return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
  }

  const portalConfig = await findAndReadJsonFile<any>('portal_config.json', artistId);
  if (!portalConfig || portalConfig.token !== token) {
    return NextResponse.json({ error: 'No autorizado (token inválido)' }, { status: 401 });
  }

  const releasesModule = portalConfig.modules?.find((m: any) => m.type === 'releases');
  if (!releasesModule || !releasesModule.config?.allowArtistEdit) {
    return NextResponse.json({ error: 'Edición no permitida por el administrador' }, { status: 403 });
  }

  return null;
}

/**
 * Reads the release config (stored as release_config.json inside the release folder)
 * and checks it belongs to the artist of the portal.
 */
async function readArtistRelease(artistId: string, releaseId: string) {
  const config = await findAndReadJsonFile<Release>('release_config.json', releaseId).catch(() => null);
  if (!config || (config.artistId && config.artistId !== artistId)) {
    return null;
  }
  return config;
}

// The portal client sends requests here. The portal is public but secured by a token
// (sent in the request body), and editing must be enabled by the producer.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; releaseId: string }> }
) {
  try {
    const { id: artistId, releaseId } = await params;

    const body = await request.json();
    const { token, release } = body as { token: string; release: Release };

    if (!release) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
    }

    const denied = await verifyPortalAccess(artistId, token);
    if (denied) return denied;

    const currentRelease = await readArtistRelease(artistId, releaseId);
    if (!currentRelease) {
      return NextResponse.json({ error: 'Release no encontrado' }, { status: 404 });
    }

    // Only update the fields the artist is allowed to edit, preserving creation date & public status
    const updatedRelease: Release = {
      ...currentRelease,
      id: releaseId,
      tracks: Array.isArray(release.tracks) ? release.tracks : currentRelease.tracks,
      coverArtId: release.coverArtId !== undefined ? release.coverArtId : currentRelease.coverArtId,
      coverHistory: release.coverHistory || currentRelease.coverHistory,
      updatedAt: new Date().toISOString(),
    };

    await saveJsonFile('release_config.json', updatedRelease, releaseId);

    return NextResponse.json({ success: true, release: updatedRelease });
  } catch (error: any) {
    console.error('API /api/portal/[id]/releases/[releaseId] PUT error:', error);
    return NextResponse.json({ error: error.message || 'Error al guardar' }, { status: 500 });
  }
}

// Upload a new cover image for the release (artist portal)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; releaseId: string }> }
) {
  try {
    const { id: artistId, releaseId } = await params;
    const formData = await request.formData();
    const token = formData.get('token') as string | null;
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No se proporcionó ninguna imagen' }, { status: 400 });
    }
    if (!file.type?.startsWith('image/')) {
      return NextResponse.json({ error: 'El archivo debe ser una imagen' }, { status: 400 });
    }

    const denied = await verifyPortalAccess(artistId, token);
    if (denied) return denied;

    const currentRelease = await readArtistRelease(artistId, releaseId);
    if (!currentRelease) {
      return NextResponse.json({ error: 'Release no encontrado' }, { status: 404 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const drive = getDriveService();
    const version = (currentRelease.coverHistory?.length || 0) + 1;
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const cleanTitle = (currentRelease.title || 'Preview').replace(/[^a-z0-9]/gi, '_');

    const created = await drive.files.create({
      requestBody: {
        name: `Portada - ${cleanTitle} - v${version}.${ext}`,
        parents: [releaseId],
      },
      media: {
        mimeType: file.type,
        body: Readable.from(buffer),
      },
      fields: 'id, name',
      supportsAllDrives: true,
    });

    const fileId = created.data.id;
    if (!fileId) {
      return NextResponse.json({ error: 'No se pudo guardar la imagen' }, { status: 500 });
    }

    // Covers are shown through Google's thumbnail CDN, which requires link access
    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
      supportsAllDrives: true,
    }).catch(() => {});

    return NextResponse.json({ success: true, fileId });
  } catch (error: any) {
    console.error('API /api/portal/[id]/releases/[releaseId] POST error:', error);
    return NextResponse.json({ error: error.message || 'Error al subir la portada' }, { status: 500 });
  }
}
