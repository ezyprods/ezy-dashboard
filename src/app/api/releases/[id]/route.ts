import { NextResponse } from 'next/server';
import { getDriveService, findAndReadJsonFile, saveJsonFile } from '@/lib/drive';
import { Release } from '@/types';
import { requireStudio } from '@/lib/routeAuth';
import { checkPublicFileAccess } from '@/lib/driveScope';

export const dynamic = 'force-dynamic';

// Public: the /previews/<id> share page reads it. Only release folders inside the studio folder.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await checkPublicFileAccess(id);
  if (access.denied) return NextResponse.json({ error: 'Release not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });

  const config = await findAndReadJsonFile<Release>('release_config.json', id);
  if (!config) {
    return NextResponse.json({ error: 'Release not found' }, { status: 404 });
  }

  // Fetch artist name
  let artistName = 'Unknown Artist';
  if (config.artistId) {
    try {
      const artistConfig = await findAndReadJsonFile<any>('artist_config.json', config.artistId);
      if (artistConfig && artistConfig.name) {
        artistName = artistConfig.name;
      }
    } catch (err) {
      console.warn('Could not fetch artist name for release', id);
    }
  }
  
  // Wrap in { release, artistName } so both the dashboard edit page and the public preview page
  // can use data.release consistently
  return NextResponse.json({ release: config, artistName });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireStudio();
  if (denied) return denied;
  const { id } = await params;
  const updates = await request.json();
  
  const config = await findAndReadJsonFile<Release>('release_config.json', id);
  if (!config) {
    return NextResponse.json({ error: 'Release not found' }, { status: 404 });
  }
  
  const updatedRelease = {
    ...config,
    ...updates,
    id, // Ensure ID is not changed
    updatedAt: new Date().toISOString(),
  };
  
  await saveJsonFile('release_config.json', updatedRelease, id);
  
  return NextResponse.json({ release: updatedRelease });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireStudio();
  if (denied) return denied;
  const { id } = await params;
  const drive = getDriveService();
  
  try {
    await drive.files.delete({
      fileId: id,
      supportsAllDrives: true,
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.status === 404 || error?.code === 404 || error?.message?.includes('File not found')) {
      return NextResponse.json({ success: true, message: 'File was already deleted' });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
