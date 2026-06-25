import { NextResponse } from 'next/server';
import { findAndReadJsonFile, saveJsonFile } from '@/lib/drive';
import type { EzyConfig, Campaign } from '@/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams; // artist drive folder ID

    const config = await findAndReadJsonFile<EzyConfig>('ezy-config.json', id);
    return NextResponse.json({ campaigns: config?.campaigns || [] });
  } catch (error: any) {
    console.error('API /artists/[id]/campaigns GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch campaigns', details: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;
    const body: { campaigns: Campaign[] } = await request.json();

    const config = (await findAndReadJsonFile<EzyConfig>('ezy-config.json', id)) || { campaigns: [] };
    
    config.campaigns = body.campaigns || [];

    await saveJsonFile('ezy-config.json', config, id);

    return NextResponse.json({ campaigns: config.campaigns });
  } catch (error: any) {
    console.error('API /artists/[id]/campaigns PUT error:', error);
    return NextResponse.json({ error: 'Failed to save campaigns', details: error.message }, { status: 500 });
  }
}
