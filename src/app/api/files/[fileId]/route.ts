import { NextResponse, NextRequest } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params;
    
    // Redirect the browser directly to Google Drive's download endpoint.
    // Adding confirm=t bypasses the virus scan warning for large files.
    // This completely bypasses Vercel's Edge/Serverless infrastructure, saving 100% of Fast Origin Transfer.
    const directUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
    
    return NextResponse.redirect(directUrl, 302);
  } catch (error: any) {
    console.error('API /api/files/[fileId] GET error:', error);
    return new NextResponse('Error fetching file', { status: 500 });
  }
}
