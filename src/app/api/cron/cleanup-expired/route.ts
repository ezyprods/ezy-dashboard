export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';
import { cleanupExpiredFiles } from '@/lib/drive';

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    // When CRON_SECRET is configured, Vercel Cron sends it as a Bearer token: enforce it
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      const url = new URL(request.url);
      const queryKey = url.searchParams.get('key');
      if (queryKey !== cronSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

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
