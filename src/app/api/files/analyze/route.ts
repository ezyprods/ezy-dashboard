import { NextResponse, NextRequest } from 'next/server';
import { getDriveService } from '@/lib/drive';

// GET: Find up to 5 audio files that don't have bpm or key in appProperties
export async function GET() {
  try {
    const drive = getDriveService();

    // Query: mimeType contains 'audio/' and appProperties does not have bpm
    // Drive API search doesn't support "not has property".
    // We fetch recent audio files and filter them in memory
    const response = await drive.files.list({
      q: "mimeType contains 'audio/' and trashed = false",
      fields: "files(id, name, mimeType, webViewLink, webContentLink, appProperties, createdTime)",
      orderBy: "createdTime desc",
      pageSize: 50,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const files = response.data.files || [];
    
    const unanalyzedFiles = files.filter(f => {
      const props = f.appProperties || {};
      return !props.bpm && !props.key;
    }).slice(0, 5); // Return only up to 5 at a time

    return NextResponse.json({ files: unanalyzedFiles });
  } catch (error: any) {
    console.error('API /api/files/analyze GET error:', error);
    return new NextResponse(error.message, { status: 500 });
  }
}

// PATCH: Update appProperties with bpm and key
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { fileId, bpm, key } = body;

    if (!fileId) {
      return new NextResponse('fileId is required', { status: 400 });
    }

    const drive = getDriveService();

    // Get current properties so we don't overwrite others
    const file = await drive.files.get({
      fileId,
      fields: 'appProperties',
      supportsAllDrives: true,
    });

    const currentProps = file.data.appProperties || {};
    const newProps = { ...currentProps };

    if (bpm !== undefined && bpm !== null) newProps.bpm = String(bpm);
    if (key) newProps.key = key;

    // If both are null/unknown, mark as analyzed so we don't keep retrying
    if (!bpm && !key) {
      newProps.bpm = 'Unknown';
      newProps.key = 'Unknown';
    }

    await drive.files.update({
      fileId,
      requestBody: {
        appProperties: newProps,
      },
      supportsAllDrives: true,
    });

    return NextResponse.json({ success: true, appProperties: newProps });
  } catch (error: any) {
    console.error('API /api/files/analyze PATCH error:', error);
    return new NextResponse(error.message, { status: 500 });
  }
}
