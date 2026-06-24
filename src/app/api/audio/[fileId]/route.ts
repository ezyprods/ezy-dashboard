import { NextResponse, NextRequest } from 'next/server';
import { getDriveService, getDriveAuthClient } from '@/lib/drive';

export async function GET(request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  try {
    const { fileId } = await params;
    const drive = getDriveService();
    
    const metaRes = await drive.files.get({ fileId, fields: 'mimeType' });
    const mimeType = metaRes.data.mimeType || 'audio/mpeg';
    
    const authClient = getDriveAuthClient();
    const tokenInfo = await authClient.getAccessToken();
    
    if (!tokenInfo.token) throw new Error("Failed to retrieve access token");

    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    
    const range = request.headers.get('range');
    const fetchHeaders: Record<string, string> = {
      Authorization: `Bearer ${tokenInfo.token}`
    };
    if (range) fetchHeaders['Range'] = range;

    const gDriveRes = await fetch(url, { headers: fetchHeaders });
    
    if (!gDriveRes.ok) {
      throw new Error(`Google Drive API error: ${gDriveRes.statusText}`);
    }

    const responseHeaders = new Headers(gDriveRes.headers);
    responseHeaders.set('Content-Type', mimeType);
    responseHeaders.set('Cache-Control', 'public, max-age=3600');
    
    // Stream directly back to the client
    return new NextResponse(gDriveRes.body, {
      status: gDriveRes.status,
      headers: responseHeaders
    });
  } catch (error: any) {
    console.error('API /audio/[fileId] error:', error);
    return new NextResponse('Error streaming audio', { status: 500 });
  }
}

