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
          fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, appProperties)',
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

          // Check expiration
          const expiresAt = file.appProperties?.expiresAt ? parseInt(file.appProperties.expiresAt, 10) : null;
          if (expiresAt && expiresAt < Date.now()) {
            // Delete asynchronously and skip adding to results
            drive.files.delete({ fileId: file.id!, supportsAllDrives: true }).catch(console.error);
            continue;
          }
          
          allItems.push({ 
            ...file, 
            parentFolderId: folderId,
            expiresAt 
          });
          
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
      fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, appProperties)',
      orderBy: 'folder, name',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      pageSize: 1000,
    });
    const items = response.data.files || [];
    
    const validItems: any[] = [];
    
    for (const f of items) {
      const name = f.name || '';
      if (SYSTEM_FILES.includes(name) || SYSTEM_FOLDERS.includes(name)) {
        continue;
      }

      const expiresAt = f.appProperties?.expiresAt ? parseInt(f.appProperties.expiresAt, 10) : null;
      if (expiresAt && expiresAt < Date.now()) {
        drive.files.delete({ fileId: f.id!, supportsAllDrives: true }).catch(console.error);
        continue;
      }

      validItems.push({
        ...f,
        expiresAt
      });
    }

    return NextResponse.json({ items: validItems });
  } catch (error: any) {
    console.error('API /files GET error:', error);
    return NextResponse.json({ error: 'Failed to list files', details: error.message }, { status: 500 });
  }
}


function cleanString(str: string): string {
  return str
    .toLowerCase()
    .replace(/\.[^/.]+$/, "") // Remove extension
    .replace(/[-_]?(v\d+|final|master|mix|demo|edit|ref|prod)/gi, "") // Remove common versions/suffixes
    .replace(/[^a-z0-9]/gi, "") // Keep only alphanumeric characters
    .trim();
}

function getLevenshteinDistance(s1: string, s2: string): number {
  const len1 = s1.length;
  const len2 = s2.length;
  const d = Array.from({ length: len1 + 1 }, () => Array(len2 + 1).fill(0));
  for (let i = 0; i <= len1; i++) d[i][0] = i;
  for (let j = 0; j <= len2; j++) d[0][j] = j;
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
    }
  }
  return d[len1][len2];
}

function getSimilarity(s1: string, s2: string): number {
  const c1 = cleanString(s1);
  const c2 = cleanString(s2);
  if (!c1 || !c2) return 0.0;
  if (c1 === c2) return 1.0;
  const dist = getLevenshteinDistance(c1, c2);
  const maxLen = Math.max(c1.length, c2.length);
  return maxLen === 0 ? 1.0 : 1 - dist / maxLen;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const parentId = formData.get('parentId') as string | null;
    const overwrite = formData.get('overwrite') === 'true';
    const targetFileId = formData.get('targetFileId') as string | null;
    const skipSimilarity = formData.get('skipSimilarity') === 'true';

    if (!file || !parentId) {
      return NextResponse.json({ error: 'Missing file or parentId' }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const stream = new Readable();
    stream.push(Buffer.from(buffer));
    stream.push(null);

    const drive = getDriveService();

    // 1. If explicit overwrite is requested
    if (overwrite && targetFileId) {
      const response = await drive.files.update({
        fileId: targetFileId,
        requestBody: {
          name: file.name,
        },
        media: {
          mimeType: file.type || 'application/octet-stream',
          body: stream,
        },
        fields: 'id, name, webViewLink, webContentLink',
      });

      return NextResponse.json({ 
        success: true, 
        file: response.data,
        overwritten: true
      }, { status: 200 });
    }

    // 2. Unless skipped, check if there's a file with a similar name in the folder
    if (!skipSimilarity) {
      const listResponse = await drive.files.list({
        q: `'${parentId}' in parents and trashed=false`,
        fields: 'files(id, name, mimeType, webViewLink, webContentLink)',
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        pageSize: 1000,
      });
      const existingFiles = listResponse.data.files || [];
      
      let bestMatch: any = null;
      let maxSim = 0;

      for (const f of existingFiles) {
        if (f.mimeType === 'application/vnd.google-apps.folder') continue;
        const sim = getSimilarity(file.name, f.name || '');
        if (sim > maxSim) {
          maxSim = sim;
          bestMatch = f;
        }
      }

      // If similarity is high (>= 80%), return 409 Conflict with details
      if (maxSim >= 0.8 && bestMatch) {
        return NextResponse.json({
          conflict: true,
          message: `Se ha encontrado un archivo similar: '${bestMatch.name}'`,
          similarFile: {
            id: bestMatch.id,
            name: bestMatch.name,
            webViewLink: bestMatch.webViewLink
          }
        }, { status: 409 });
      }
    }
    
    // 3. Otherwise, create a new file
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

    // Make file public to allow direct streaming and bypass Vercel bandwidth
    if (response.data.id) {
      await drive.permissions.create({
        fileId: response.data.id,
        requestBody: { role: 'reader', type: 'anyone' }
      }).catch(console.error);
    }

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
