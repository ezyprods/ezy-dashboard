import { NextRequest, NextResponse } from 'next/server';
import { makeFilesPublic } from '@/lib/drive';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawIds = body?.fileIds || body?.fileId;
    const role = body?.role === 'reader' ? 'reader' : 'writer';

    if (!rawIds) {
      return NextResponse.json({ error: 'Missing fileIds or fileId parameter' }, { status: 400 });
    }

    const fileIds = (Array.isArray(rawIds) ? rawIds : [rawIds]).filter(
      (id): id is string => typeof id === 'string' && id.trim().length > 0
    );

    if (fileIds.length === 0) {
      return NextResponse.json({ error: 'No valid fileIds provided' }, { status: 400 });
    }

    const result = await makeFilesPublic(fileIds, role);

    return NextResponse.json({
      success: result.success,
      updated: result.updated,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (error: any) {
    console.error('API /api/files/share-public POST error:', error);
    return NextResponse.json(
      { error: 'Failed to set public permissions', details: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
