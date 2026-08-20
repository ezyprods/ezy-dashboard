import { NextResponse, NextRequest } from 'next/server';
import { setFileExpiration } from '@/lib/drive';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params;
    const body = await request.json();
    const { expiresInMs, expiresAt } = body;

    let expirationTimestamp: number | null = null;
    if (expiresAt !== undefined && expiresAt !== null) {
      const parsed = typeof expiresAt === 'number' ? expiresAt : parseInt(expiresAt, 10);
      if (!isNaN(parsed) && parsed > 0) {
        expirationTimestamp = parsed;
      }
    } else if (expiresInMs !== undefined && expiresInMs !== null) {
      const parsedMs = typeof expiresInMs === 'number' ? expiresInMs : parseInt(expiresInMs, 10);
      if (!isNaN(parsedMs) && parsedMs > 0) {
        expirationTimestamp = Date.now() + parsedMs;
      }
    }
    
    await setFileExpiration(fileId, expirationTimestamp);

    return NextResponse.json({ success: true, expiresAt: expirationTimestamp });
  } catch (error: any) {
    console.error('API /api/files/[fileId]/expiration error:', error);
    return NextResponse.json({ error: 'Failed to set expiration', details: error.message }, { status: 500 });
  }
}

