export const dynamic = 'force-dynamic';
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

    const FIELDS = 'nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, appProperties, thumbnailLink, starred, shared, folderColorRgb, fileExtension, description, imageMediaMetadata(width, height), videoMediaMetadata(width, height, durationMillis), lastModifyingUser(displayName))';

    // Lists every child of a folder, following pagination (folders with >1000 items were truncated)
    const listChildren = async (folderId: string) => {
      const all: any[] = [];
      let pageToken: string | undefined = undefined;
      do {
        const response: any = await drive.files.list({
          q: `'${folderId}' in parents and trashed=false`,
          fields: FIELDS,
          orderBy: 'folder, name',
          includeItemsFromAllDrives: true,
          supportsAllDrives: true,
          pageSize: 1000,
          pageToken,
        });
        all.push(...(response.data.files || []));
        pageToken = response.data.nextPageToken || undefined;
      } while (pageToken);
      return all;
    };

    const now = Date.now();
    const processItems = (files: any[], folderId: string) => {
      const result: any[] = [];
      for (const file of files) {
        const name = file.name || '';
        if (SYSTEM_FILES.includes(name) || SYSTEM_FOLDERS.includes(name)) continue;

        // Expired temporary files are deleted in the background and hidden
        const expiresAt = file.appProperties?.expiresAt ? parseInt(file.appProperties.expiresAt, 10) : null;
        if (expiresAt && expiresAt < now) {
          drive.files.delete({ fileId: file.id!, supportsAllDrives: true }).catch(console.error);
          continue;
        }

        result.push({
          ...file,
          parentFolderId: folderId,
          expiresAt,
          bpm: file.appProperties?.bpm || null,
          key: file.appProperties?.key || null
        });
      }
      return result;
    };

    if (recursive) {
      const allItems: any[] = [];

      // Breadth-first traversal, each level fetched in parallel (much faster than one-by-one)
      let level: string[] = [parentId];
      let depth = 0;
      while (level.length > 0 && depth < 12) {
        const results = await Promise.all(level.map(async (folderId) => processItems(await listChildren(folderId), folderId)));
        const nextLevel: string[] = [];
        for (const items of results) {
          for (const item of items) {
            allItems.push(item);
            if (item.mimeType === 'application/vnd.google-apps.folder' && item.id) nextLevel.push(item.id);
          }
        }
        level = nextLevel;
        depth++;
      }

      return NextResponse.json({ items: allItems });
    }

    const validItems = processItems(await listChildren(parentId), parentId);

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
        requestBody: { role: 'writer', type: 'anyone' }
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

    // Permanent deletion is only used from the explorer's trash view (items already in the trash)
    if (searchParams.get('permanent') === 'true') {
      await drive.files.delete({ fileId, supportsAllDrives: true });
      return NextResponse.json({ success: true, permanent: true });
    }

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
    const { fileId, name, newParentId, oldParentId, trashed, starred, folderColorRgb, description } = body;

    if (!fileId) {
      return NextResponse.json({ error: 'Missing fileId' }, { status: 400 });
    }

    const drive = getDriveService();
    const updateParams: any = {
      fileId,
      supportsAllDrives: true,
      requestBody: {},
    };

    if (name && name.trim()) {
      updateParams.requestBody.name = name.trim();
    }
    
    if (trashed !== undefined) {
      updateParams.requestBody.trashed = Boolean(trashed);
    }

    if (starred !== undefined) {
      updateParams.requestBody.starred = Boolean(starred);
    }

    if (typeof folderColorRgb === 'string' && /^#[0-9a-fA-F]{6}$/.test(folderColorRgb)) {
      updateParams.requestBody.folderColorRgb = folderColorRgb;
    }

    if (typeof description === 'string') {
      updateParams.requestBody.description = description;
    }

    if (newParentId) {
      updateParams.addParents = newParentId;
      if (oldParentId) {
        updateParams.removeParents = oldParentId;
      } else {
        // Fetch current parents if oldParentId was not provided
        try {
          const currentFile = await drive.files.get({
            fileId,
            fields: 'parents',
            supportsAllDrives: true,
          });
          const currentParents = currentFile.data.parents || [];
          if (currentParents.length > 0) {
            updateParams.removeParents = currentParents.join(',');
          }
        } catch (e) {
          console.warn('Could not fetch existing parents for fileId:', fileId, e);
        }
      }
    }

    updateParams.fields = 'id, name, parents, trashed, starred, folderColorRgb, modifiedTime';
    const res = await drive.files.update(updateParams);
    return NextResponse.json({ success: true, file: res.data });
  } catch (error: any) {
    console.error('API /files PUT error:', error);
    return NextResponse.json({ error: 'Failed to update file', details: error.message }, { status: 500 });
  }
}

