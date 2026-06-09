import { NextResponse } from 'next/server';
import { getDriveService, findAndReadJsonFile, saveJsonFile } from '@/lib/drive';
import { Release, ReleaseTrack } from '@/types';
import { randomUUID } from 'crypto';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { originalFileId, title } = await request.json();
  const drive = getDriveService();
  
  const config = await findAndReadJsonFile<Release>('release_config.json', id);
  if (!config) {
    return NextResponse.json({ error: 'Release not found' }, { status: 404 });
  }
  
  try {
    const originalFile = await drive.files.get({
      fileId: originalFileId,
      fields: 'name',
    });
    
    const copiedFile = await drive.files.copy({
      fileId: originalFileId,
      requestBody: {
        name: originalFile.data.name,
        parents: [id],
      },
    });
    
    const newFileId = copiedFile.data.id!;
    
    const newTrack: ReleaseTrack = {
      id: randomUUID(),
      originalFileId,
      title,
      newFileId,
    };
    
    config.tracks.push(newTrack);
    config.updatedAt = new Date().toISOString();
    
    await saveJsonFile('release_config.json', config, id);
    
    return NextResponse.json(newTrack);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
