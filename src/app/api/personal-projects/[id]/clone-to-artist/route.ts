export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { NextResponse } from 'next/server';
import { clonePersonalProjectToArtist } from '@/lib/personalProjects';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const { artistId, projectTitle, projectType } = body;

    if (!artistId) {
      return NextResponse.json({ error: 'artistId es obligatorio' }, { status: 400 });
    }

    const result = await clonePersonalProjectToArtist(
      id,
      artistId,
      projectTitle,
      projectType || 'single'
    );

    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    console.error('API /personal-projects/[id]/clone-to-artist POST error:', error);
    return NextResponse.json(
      { error: 'Error al ceder proyecto al artista', details: error.message },
      { status: 500 }
    );
  }
}
