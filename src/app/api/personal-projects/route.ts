export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { NextResponse } from 'next/server';
import { 
  getPersonalProjectsDb, 
  createPersonalProject, 
  getOrCreatePersonalProjectsRoot 
} from '@/lib/personalProjects';
import { listFiles, listFolders } from '@/lib/drive';
import type { CreatePersonalProjectInput } from '@/types';

export async function GET() {
  try {
    const { projects, rootFolderId } = await getPersonalProjectsDb();

    // Resolve latest bounce for projects that don't have one cached
    const enrichedProjectsPromises = projects.map(async (proj) => {
      if (proj.latestBounceFileId) return proj;

      try {
        // Look inside project folder and subfolders
        const subfolders = await listFolders(proj.id).catch(() => []);
        const bounceSubfolder = subfolders.find(
          sf => (sf.name || '').toLowerCase().includes('bounce') || (sf.name || '').toLowerCase().includes('demo')
        );

        const targetFolderForFiles = bounceSubfolder ? bounceSubfolder.id! : proj.id;
        const files = await listFiles(targetFolderForFiles).catch(() => []);
        const audioFiles = files.filter(
          f => f.mimeType.startsWith('audio/') || /\.(mp3|wav|flac|m4a|ogg)$/i.test(f.name)
        );

        if (audioFiles.length > 0) {
          // Sort by modifiedTime descending
          audioFiles.sort((a, b) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime());
          return {
            ...proj,
            latestBounceFileId: audioFiles[0].id,
            latestBounceName: audioFiles[0].name,
          };
        }
      } catch (err) {
        console.error(`Error resolving bounce for personal project ${proj.id}:`, err);
      }

      return proj;
    });

    const enrichedProjects = await Promise.all(enrichedProjectsPromises);

    return NextResponse.json({ projects: enrichedProjects, rootFolderId });
  } catch (error: any) {
    if (error.message?.includes('invalid_grant') || error.message?.includes('credentials')) {
      return NextResponse.json(
        { projects: [], needsAuth: true, error: 'Token de Google expirado o inválido.' },
        { status: 401 }
      );
    }
    console.error('API /personal-projects GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch personal projects', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body: CreatePersonalProjectInput = await request.json();

    if (!body.title || !body.title.trim()) {
      return NextResponse.json({ error: 'El título del proyecto es obligatorio' }, { status: 400 });
    }

    if (!body.category) {
      return NextResponse.json({ error: 'La categoría es obligatoria' }, { status: 400 });
    }

    const project = await createPersonalProject({
      ...body,
      title: body.title.trim(),
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (error: any) {
    console.error('API /personal-projects POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create personal project', details: error.message },
      { status: 500 }
    );
  }
}
