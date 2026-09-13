import { NextResponse } from 'next/server';
import { getDriveService, listFolders, createFolder, saveJsonFile, findAndReadJsonFile } from '@/lib/drive';
import { Release } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const drive = getDriveService();
    
    // Find 'Releases' folder inside the artist folder
    const query = `mimeType='application/vnd.google-apps.folder' and name='Releases' and '${id}' in parents and trashed=false`;
    const response = await drive.files.list({ 
      q: query, 
      fields: 'files(id)',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true
    });
    const files = response.data.files || [];
    
    if (files.length === 0) {
      return NextResponse.json({ releases: [] });
    }
    
    const releasesFolderId = files[0].id!;
    
    // List all folders inside 'Releases'
    const releaseFolders = await listFolders(releasesFolderId);
    
    // Read every release config in parallel (keeps the folder order)
    const configs = await Promise.all(
      releaseFolders.map(folder =>
        findAndReadJsonFile<Release>('release_config.json', folder.id!).catch(() => null)
      )
    );
    const releases: Release[] = [];
    configs.forEach((config, i) => {
      if (config) {
        releases.push({ ...config, id: releaseFolders[i].id!, tracks: config.tracks || [] });
      }
    });

    return NextResponse.json({ releases });
  } catch (error: any) {
    console.error('API /api/artists/[id]/releases GET error:', error);
    return NextResponse.json({ releases: [], error: 'Failed to fetch releases', details: error.message }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) {
      return NextResponse.json({ error: 'El título es obligatorio' }, { status: 400 });
    }
    const drive = getDriveService();
    
    // Find Releases folder
    const query = `mimeType='application/vnd.google-apps.folder' and name='Releases' and '${id}' in parents and trashed=false`;
    const response = await drive.files.list({ 
      q: query, 
      fields: 'files(id)',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true
    });
    const files = response.data.files || [];
    
    let releasesFolderId = '';
    
    if (files.length === 0) {
      const parentFolderId = await createFolder('Releases', id);
      releasesFolderId = parentFolderId;
    } else {
      releasesFolderId = files[0].id!;
    }
    
    const newFolderId = await createFolder(title, releasesFolderId);
    
    const releaseConfig: Release = {
      id: newFolderId,
      artistId: id,
      title,
      tracks: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    await saveJsonFile('release_config.json', releaseConfig, newFolderId);
    
    return NextResponse.json(releaseConfig);
  } catch (error: any) {
    console.error('Error creating release:', error);
    return NextResponse.json({ error: 'Failed to create release', details: error.message }, { status: 500 });
  }
}
