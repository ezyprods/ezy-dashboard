import { NextResponse, NextRequest } from 'next/server';
import { getDriveService } from '@/lib/drive';

export async function GET(request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  try {
    const { fileId } = await params;
    const drive = getDriveService();
    
    // Check if the file is already public
    const metaRes = await drive.files.get({ fileId, fields: 'permissions' });
    const isPublic = metaRes.data.permissions?.some(p => p.type === 'anyone' && p.role === 'reader');
    
    if (!isPublic) {
      // Make it public so the browser can stream it directly
      await drive.permissions.create({
        fileId,
        requestBody: { role: 'reader', type: 'anyone' }
      }).catch(err => console.error('Error making file public:', err));
    }
    
    // Redirect directly to Google Drive's download endpoint to bypass Vercel bandwidth completely
    return NextResponse.redirect(`https://drive.google.com/uc?export=download&id=${fileId}`);
  } catch (error: any) {
    console.error('API /audio/[fileId] error:', error);
    return new NextResponse('Error redirecting to audio', { status: 500 });
  }
}
