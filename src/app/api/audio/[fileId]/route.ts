import { NextResponse, NextRequest } from 'next/server';
import { getDriveService } from '@/lib/drive';

export async function GET(request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  try {
    const { fileId } = await params;
    const drive = getDriveService();
    
    // We only fetch metadata (very fast, no large data transfer)
    const metaRes = await drive.files.get({ fileId, fields: 'mimeType', supportsAllDrives: true });
    const mimeType = metaRes.data.mimeType || 'audio/mpeg';
    
    // Redirect the browser directly to Google Drive's endpoint.
    // This completely bypasses Vercel's Edge/Serverless data transfer, saving 100% of Fast Origin Transfer.
    const isImage = mimeType.startsWith('image/');
    const directUrl = isImage 
      ? `https://drive.google.com/uc?export=view&id=${fileId}`
      : `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
    
    return NextResponse.redirect(directUrl, 302);
  } catch (error: any) {
    console.error('API /audio/[fileId] error:', error);
    return new NextResponse('Error streaming audio', { status: 500 });
  }
}
