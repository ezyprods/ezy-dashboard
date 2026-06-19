import { NextResponse, NextRequest } from 'next/server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  try {
    const { fileId } = await params;
    const redirectUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    return NextResponse.redirect(redirectUrl, 302);
  } catch (error: any) {
    console.error('API /audio/[fileId] error:', error);
    return new NextResponse('Error fetching audio stream', { status: 500 });
  }
}


