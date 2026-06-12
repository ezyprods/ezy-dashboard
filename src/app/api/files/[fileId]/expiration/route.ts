import { NextResponse, NextRequest } from 'next/server';
import { setFileExpiration } from '@/lib/drive';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params;
    const body = await request.json();
    const { expiresInMs } = body;

    const expirationTimestamp = expiresInMs ? Date.now() + expiresInMs : null;
    
    await setFileExpiration(fileId, expirationTimestamp);

    return NextResponse.json({ success: true, expiresAt: expirationTimestamp });
  } catch (error: any) {
    console.error('API /api/files/[fileId]/expiration error:', error);
    return NextResponse.json({ error: 'Failed to set expiration', details: error.message }, { status: 500 });
  }
}
