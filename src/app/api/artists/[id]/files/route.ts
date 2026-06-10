import { NextResponse } from 'next/server';
import { getDriveService } from '@/lib/drive';

// Función recursiva para obtener SOLO archivos de audio
async function fetchAudioFilesRecursively(drive: any, parentId: string): Promise<any[]> {
  let audioFiles: any[] = [];
  let items: any[] = [];
  let pageToken: string | undefined = undefined;

  do {
    const response: any = await drive.files.list({
      q: `'${parentId}' in parents and trashed=false`,
      fields: 'nextPageToken, files(id, name, mimeType, webViewLink, webContentLink, createdTime, size)',
      orderBy: 'folder, name',
      pageSize: 1000,
      pageToken: pageToken,
    });
    
    if (response.data.files) {
      items = items.concat(response.data.files);
    }
    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);
  
  // Archivos de audio directos
  const files = items.filter((f: any) => f.mimeType?.startsWith('audio/'));
  audioFiles = audioFiles.concat(files);

  // Carpetas directas
  const folders = items.filter((f: any) => f.mimeType === 'application/vnd.google-apps.folder');

  for (const folder of folders) {
    // Evitamos buscar dentro de la carpeta Releases para no duplicar audios exportados
    if (folder.name.toLowerCase() === 'releases') continue;

    const subFiles = await fetchAudioFilesRecursively(drive, folder.id);
    audioFiles = audioFiles.concat(subFiles);
  }

  return audioFiles;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    const drive = getDriveService();
    const audioFiles = await fetchAudioFilesRecursively(drive, id);

    return NextResponse.json({ files: audioFiles });
  } catch (error: any) {
    console.error('API /artists/[id]/files GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch audio files', details: error.message }, { status: 500 });
  }
}
