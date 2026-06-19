import { NextResponse } from 'next/server';
import { getDriveAuthClient } from '@/lib/drive';

export async function POST(request: Request) {
  try {
    const { name, mimeType, parentId, fileId } = await request.json();

    if (!name || !parentId) {
      if (!fileId) {
        return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
      }
    }

    const auth = getDriveAuthClient();
    const token = await auth.getAccessToken();

    if (!token || !token.token) {
      throw new Error('Failed to get access token for Google Drive');
    }

    let fetchUrl = '';
    let method = '';
    
    if (fileId) {
       // OVERWRITE EXISTING FILE
       fetchUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=resumable&supportsAllDrives=true`;
       method = 'PATCH';
    } else {
       // NEW FILE
       fetchUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true';
       method = 'POST';
    }

    const bodyData = fileId ? {} : { name, parents: [parentId] };

    // Extract origin from request to forward it to Google for CORS
    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const fetchRes = await fetch(fetchUrl, {
      method,
      headers: {
        Authorization: `Bearer ${token.token}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': mimeType || 'application/octet-stream',
        'Origin': origin,
      },
      body: JSON.stringify(bodyData)
    });

    if (!fetchRes.ok) {
      const err = await fetchRes.text();
      throw new Error(`Google API error: ${err}`);
    }

    const uploadUrl = fetchRes.headers.get('Location');
    
    if (!uploadUrl) {
      throw new Error('No Location header returned from Google Drive API');
    }

    return NextResponse.json({ uploadUrl });
  } catch (error: any) {
    console.error('API /files/upload-session POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create upload session', details: error.message },
      { status: 500 }
    );
  }
}
