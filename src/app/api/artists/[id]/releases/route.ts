import { NextResponse } from 'next/server';
import { getDriveService, listFolders, createFolder, saveJsonFile, findAndReadJsonFile } from '@/lib/drive';
import { Release } from '@/types';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const drive = getDriveService();
  
  // Find 'Releases' folder inside the artist folder
  const query = `mimeType='application/vnd.google-apps.folder' and name='Releases' and '${id}' in parents and trashed=false`;
  const response = await drive.files.list({ q: query, fields: 'files(id)' });
  const files = response.data.files || [];
  
  if (files.length === 0) {
    return NextResponse.json([]); // No releases folder yet
  }
  
  const releasesFolderId = files[0].id!;
  
  // List all folders inside 'Releases'
  const releaseFolders = await listFolders(releasesFolderId);
  
  const releases: Release[] = [];
  
  for (const folder of releaseFolders) {
    const config = await findAndReadJsonFile<Release>('release_config.json', folder.id!);
    if (config) {
      releases.push(config);
    }
  }
  
  return NextResponse.json(releases);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { title } = await request.json();
  const drive = getDriveService();
  
  // Find 'Releases' folder inside the artist folder
  const query = `mimeType='application/vnd.google-apps.folder' and name='Releases' and '${id}' in parents and trashed=false`;
  const response = await drive.files.list({ q: query, fields: 'files(id)' });
  let files = response.data.files || [];
  
  let releasesFolderId: string;
  if (files.length === 0) {
    releasesFolderId = await createFolder('Releases', id);
  } else {
    releasesFolderId = files[0].id!;
  }
  
  // Create a new folder for the {title}
  const newReleaseFolderId = await createFolder(title, releasesFolderId);
  
  const newRelease: Release = {
    id: newReleaseFolderId,
    title,
    artistId: id,
    tracks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  await saveJsonFile('release_config.json', newRelease, newReleaseFolderId);
  
  return NextResponse.json(newRelease);
}
