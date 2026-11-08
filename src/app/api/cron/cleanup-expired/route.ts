export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';
import { cleanupExpiredFiles } from '@/lib/drive';
import { isCronAuthorized } from '@/lib/instagram/secrets';

export async function GET(request: Request) {
  // Vercel Cron sends Authorization: Bearer CRON_SECRET. Without CRON_SECRET the route stays closed.
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await cleanupExpiredFiles();
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error: any) {
    console.error('API /api/cron/cleanup-expired error:', error);
    return NextResponse.json(
      { error: 'Failed to run cleanup cron', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
