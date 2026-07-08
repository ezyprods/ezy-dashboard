import { NextResponse } from 'next/server';
import { getDriveService } from '@/lib/drive';
import { Readable } from 'stream';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const drive = getDriveService();
    const buffer = await file.arrayBuffer();
    const stream = new Readable();
    stream.push(Buffer.from(buffer));
    stream.push(null);

    // Upload to root (no parents specified) or a specific temp folder if needed.
    // For now, root is fine since it will be moved shortly.
    const fileMetadata: any = {
      name: `[TEMP] ${file.name}`,
    };

    const media = {
      mimeType: file.type || 'application/octet-stream',
      body: stream,
    };

    const uploadRes = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, name',
      supportsAllDrives: true,
    });

    return NextResponse.json({ 
      fileId: uploadRes.data.id,
      name: uploadRes.data.name
    });
  } catch (error: any) {
    console.error('API /upload/temp POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get('id');

    if (!fileId) {
      return NextResponse.json({ error: 'No fileId provided' }, { status: 400 });
    }

    const drive = getDriveService();
    
    await drive.files.delete({
      fileId: fileId,
      supportsAllDrives: true,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('API /upload/temp DELETE error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
