export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { NextResponse } from 'next/server';
import { 
  getPersonalProjectsDb, 
  createPersonalProject 
} from '@/lib/personalProjects';
import type { CreatePersonalProjectInput } from '@/types';

export async function GET() {
  try {
    const { projects, rootFolderId } = await getPersonalProjectsDb();
    return NextResponse.json({ projects, rootFolderId });
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
