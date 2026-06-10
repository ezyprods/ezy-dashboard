import { NextResponse } from 'next/server';
import { createFolder } from '@/lib/drive';

export async function POST(request: Request) {
  try {
    const { name, parentId } = await request.json();
    
    if (!name || !parentId) {
      return NextResponse.json({ error: 'Missing name or parentId' }, { status: 400 });
    }

    const folderId = await createFolder(name, parentId);
    return NextResponse.json({ success: true, folderId });
  } catch (error: any) {
    console.error('API /folders POST error:', error);
    return NextResponse.json({ error: 'Failed to create folder', details: error.message }, { status: 500 });
  }
}
