import { NextResponse } from 'next/server';
import { getDriveService } from '@/lib/drive';
import { Readable } from 'stream';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const parentId = formData.get('parentId') as string | null;

    if (!file || !parentId) {
      return NextResponse.json({ error: 'Missing file or parentId' }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const stream = new Readable();
    stream.push(Buffer.from(buffer));
    stream.push(null);

    const drive = getDriveService();
    
    // Upload directly to Drive
    const response = await drive.files.create({
      requestBody: {
        name: file.name,
        parents: [parentId],
      },
      media: {
        mimeType: file.type || 'application/octet-stream',
        body: stream,
      },
      fields: 'id, name, webViewLink, webContentLink',
    });

    return NextResponse.json({ 
      success: true, 
      file: response.data 
    }, { status: 201 });
  } catch (error: any) {
    console.error('API /files POST error:', error);
    return NextResponse.json({ error: 'Failed to upload file', details: error.message }, { status: 500 });
  }
}
