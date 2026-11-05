import { NextResponse } from 'next/server';
import { accountInfo } from '@/lib/instagram/account';
import { getFolders, readSettings, saveSettings } from '@/lib/instagram/store';
import type { IgBootstrap, IgSettings } from '@/types/instagram';

export const dynamic = 'force-dynamic';

// Estado de la cuenta, carpeta de subida y ajustes: lo primero que pide la página de Instagram
export async function GET() {
  try {
    const [account, folders, settings] = await Promise.all([accountInfo(), getFolders(), readSettings()]);
    const body: IgBootstrap = { account, mediaFolderId: folders.media, settings };
    return NextResponse.json(body);
  } catch (err) {
    console.error('[api/instagram] GET', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// Guardar hashtags y plantillas
export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Partial<IgSettings>;
    const clean = <T extends { id: string; name: string }>(list: unknown, field: 'tags' | 'text') =>
      (Array.isArray(list) ? list : [])
        .filter((x: any) => x && typeof x.name === 'string' && typeof x[field] === 'string')
        .slice(0, 50)
        .map((x: any) => ({ id: String(x.id || crypto.randomUUID()).slice(0, 64), name: x.name.slice(0, 60), [field]: x[field].slice(0, 2200) })) as unknown as T[];
    const settings: IgSettings = {
      hashtagSets: clean(body.hashtagSets, 'tags'),
      captionTemplates: clean(body.captionTemplates, 'text'),
    };
    await saveSettings(settings);
    return NextResponse.json({ settings });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
