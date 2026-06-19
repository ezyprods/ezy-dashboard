import { NextResponse } from 'next/server';
import { getDriveService } from '@/lib/drive';

// Función recursiva para obtener SOLO archivos de audio (búsqueda profunda en todas las subcarpetas)
async function fetchAudioFilesRecursively(drive: any, parentId: string, depth: number = 0): Promise<any[]> {
  // Limit depth to 6 levels to prevent infinite loops on very complex structures
  if (depth > 6) return [];

  let audioFiles: any[] = [];
  let items: any[] = [];
  let pageToken: string | undefined = undefined;

  do {
    const response: any = await drive.files.list({
      q: `'${parentId}' in parents and trashed=false`,
      fields: 'nextPageToken, files(id, name, mimeType, webViewLink, webContentLink, createdTime, size, modifiedTime)',
      orderBy: 'folder, name',
      pageSize: 1000,
      pageToken: pageToken,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
    
    if (response.data.files) {
      items = items.concat(response.data.files);
    }
    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);
  
  // Audio files at this level (by mimeType OR by extension)
  const AUDIO_EXTS = /\.(wav|mp3|m4a|flac|aiff|aif|ogg|opus|wma|alac)$/i;
  const files = items.filter((f: any) => 
    f.mimeType?.startsWith('audio/') || AUDIO_EXTS.test(f.name || '')
  );
  audioFiles = audioFiles.concat(files);

  // Recurse into sub-folders
  const folders = items.filter((f: any) => f.mimeType === 'application/vnd.google-apps.folder');

  const subResults = await Promise.all(
    folders.map((folder: any) => fetchAudioFilesRecursively(drive, folder.id, depth + 1))
  );
  for (const sub of subResults) {
    audioFiles = audioFiles.concat(sub);
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
