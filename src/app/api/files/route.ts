import { NextResponse } from 'next/server';
import { getDriveService } from '@/lib/drive';
import { Readable } from 'stream';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parentId = searchParams.get('folderId');
    const recursive = searchParams.get('recursive') === 'true';

    if (!parentId) {
      return NextResponse.json({ error: 'Missing folderId' }, { status: 400 });
    }

    const drive = getDriveService();
    
    const SYSTEM_FILES = [
      'artist_config.json', 
      'project_config.json', 
      'release_config.json', 
      'notes.json', 
      'payments.json', 
      'payments_db.json',
      'matrices.json',
      'portal_config.json',
      'tasks.json'
    ];
    
    const SYSTEM_FOLDERS = [
      'Images',
      'images',
      'Releases',
      'releases'
    ];

    if (recursive) {
      const allItems: any[] = [];
      
      async function traverse(folderId: string) {
        const query = `'${folderId}' in parents and trashed=false`;
        const response = await drive.files.list({
          q: query,
          fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink)',
          orderBy: 'folder, name',
          includeItemsFromAllDrives: true,
          supportsAllDrives: true,
          pageSize: 1000,
        });
        const files = response.data.files || [];
        
        for (const file of files) {
          const name = file.name || '';
          if (SYSTEM_FILES.includes(name) || SYSTEM_FOLDERS.includes(name)) {
            continue;
          }
          
          allItems.push({ ...file, parentFolderId: folderId });
          
          if (file.mimeType === 'application/vnd.google-apps.folder' && file.id) {
            await traverse(file.id);
          }
        }
      }
      
      await traverse(parentId);
      return NextResponse.json({ items: allItems });
    }

    const query = `'${parentId}' in parents and trashed=false`;
    const response = await drive.files.list({
      q: query,
      fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink)',
      orderBy: 'folder, name',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      pageSize: 1000,
    });
    const items = response.data.files || [];
    
    const validItems = items.filter(f => {
      const name = f.name || '';
      return !SYSTEM_FILES.includes(name) && !SYSTEM_FOLDERS.includes(name);
    });

    return NextResponse.json({ items: validItems });
  } catch (error: any) {
    console.error('API /files GET error:', error);
    return NextResponse.json({ error: 'Failed to list files', details: error.message }, { status: 500 });
  }
}


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

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get('id');

    if (!fileId) {
      return NextResponse.json({ error: 'Missing file id' }, { status: 400 });
    }

    const drive = getDriveService();
    // Use update to move to trash instead of permanent delete
    await drive.files.update({ 
      fileId,
      supportsAllDrives: true,
      requestBody: {
        trashed: true
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('API /files DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete item', details: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { fileId, name, newParentId, oldParentId, trashed } = body;

    if (!fileId) {
      return NextResponse.json({ error: 'Missing fileId' }, { status: 400 });
    }

    const drive = getDriveService();
    const updateParams: any = {
      fileId,
      supportsAllDrives: true,
      requestBody: {},
    };

    if (name) {
      updateParams.requestBody.name = name;
    }
    
    if (trashed !== undefined) {
      updateParams.requestBody.trashed = trashed;
    }

    if (newParentId && oldParentId) {
      updateParams.addParents = newParentId;
      updateParams.removeParents = oldParentId;
    }

    const res = await drive.files.update(updateParams);
    return NextResponse.json({ success: true, file: res.data });
  } catch (error: any) {
    console.error('API /files PUT error:', error);
    return NextResponse.json({ error: 'Failed to update file', details: error.message }, { status: 500 });
  }
}
