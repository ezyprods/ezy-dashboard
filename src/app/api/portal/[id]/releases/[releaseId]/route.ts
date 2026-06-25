import { NextResponse, NextRequest } from 'next/server';
import { findAndReadJsonFile, saveJsonFile } from '@/lib/drive';
import type { Release } from '@/types';

// We need to protect this route. The portal client sends requests here.
// Since the portal is public but secured by a token, we expect the token in the request body.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; releaseId: string }> }
) {
  try {
    const resolvedParams = await params;
    const { id: artistId, releaseId } = resolvedParams;

    // Parse body
    const body = await request.json();
    const { token, release } = body as { token: string; release: Release };

    if (!token || !release) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 });
    }

    // Verify token
    const portalConfig = await findAndReadJsonFile<any>('portal_config.json', artistId);
    if (!portalConfig || portalConfig.token !== token) {
      return NextResponse.json({ error: 'No autorizado (token inválido)' }, { status: 401 });
    }

    // Verify if editing is allowed
    const releasesModule = portalConfig.modules?.find((m: any) => m.type === 'releases');
    if (!releasesModule || !releasesModule.config?.allowArtistEdit) {
      return NextResponse.json({ error: 'Edición no permitida por el administrador' }, { status: 403 });
    }

    // Read current releases
    const data = await findAndReadJsonFile<any>('releases.json', artistId) || { releases: [] };
    const releases = data.releases || [];

    const idx = releases.findIndex((r: any) => r.id === releaseId);
    if (idx === -1) {
      return NextResponse.json({ error: 'Release no encontrado' }, { status: 404 });
    }

    // Update release
    // Ensure we preserve creation date and public status (only update mutable fields)
    const currentRelease = releases[idx];
    releases[idx] = {
      ...currentRelease,
      tracks: release.tracks,
      coverArtId: release.coverArtId,
      coverHistory: release.coverHistory || currentRelease.coverHistory,
      updatedAt: new Date().toISOString()
    };

    data.releases = releases;

    // Save
    await saveJsonFile('releases.json', data, artistId);

    return NextResponse.json({ success: true, release: releases[idx] });
  } catch (error: any) {
    console.error('API /api/portal/[id]/releases/[releaseId] PUT error:', error);
    return new NextResponse(error.message, { status: 500 });
  }
}
