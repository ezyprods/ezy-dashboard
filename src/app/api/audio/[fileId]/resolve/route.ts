import { NextResponse, NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  try {
    const { fileId } = await params;
    if (!fileId) {
      return NextResponse.json({ error: 'File ID is required' }, { status: 400 });
    }

    return NextResponse.json({ url: `/api/audio/${fileId}` });
  } catch (error: any) {
    console.error('API /audio/[fileId]/resolve error:', error);
    return NextResponse.json({ error: 'Failed to resolve audio URL' }, { status: 500 });
  }
}

