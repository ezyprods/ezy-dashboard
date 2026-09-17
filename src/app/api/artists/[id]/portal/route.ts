import { NextResponse } from 'next/server';
import { findAndReadJsonFile, saveJsonFile } from '@/lib/drive';
import type { PortalConfig } from '@/types';
import { randomBytes } from 'crypto';

export const dynamic = 'force-dynamic';

const DEFAULT_MODULES = [
  { id: 'bounces', type: 'bounces', isVisible: true, order: 0, title: 'Últimas mezclas y archivos' },
  { id: 'releases', type: 'releases', isVisible: true, order: 1, title: 'Previews y lanzamientos' },
  { id: 'finances', type: 'finances', isVisible: false, order: 2, title: 'Resumen financiero' },
  { id: 'tasks', type: 'tasks', isVisible: true, order: 3, title: 'Estado del trabajo' },
];

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    let config = await findAndReadJsonFile<PortalConfig>('portal_config.json', id);
    
    if (!config) {
      config = {
        artistId: id,
        token: randomBytes(16).toString('hex'),
        producerName: 'EZY Studio',
        showFeedback: true,
        welcomeMessage: '',
        hiddenProjectIds: [],
        createdAt: new Date().toISOString(),
        modules: DEFAULT_MODULES as any
      };
      await saveJsonFile('portal_config.json', config, id);
    } else {
      let changed = false;
      if (!config.modules) {
        config.modules = DEFAULT_MODULES as any;
        changed = true;
      } else {
        const existingTypes = new Set(config.modules.map((m: any) => m.type));
        DEFAULT_MODULES.forEach(defMod => {
          if (!existingTypes.has(defMod.type)) {
            config!.modules!.push({ ...defMod, order: config!.modules!.length } as any);
            changed = true;
          }
        });
      }
      if (changed) {
        await saveJsonFile('portal_config.json', config, id);
      }
    }
    
    return NextResponse.json({ config });
  } catch (error: any) {
    console.error('API /portal GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch portal config' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    const config = await findAndReadJsonFile<PortalConfig>('portal_config.json', id);
    if (!config) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    
    // The artist id and portal token can never be changed from the client
    const { token: _token, artistId: _artistId, createdAt: _createdAt, ...safeBody } = body || {};
    const updatedConfig = { ...config, ...safeBody, artistId: config.artistId || id, token: config.token };
    await saveJsonFile('portal_config.json', updatedConfig, id);
    
    return NextResponse.json({ config: updatedConfig });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to update portal config' }, { status: 500 });
  }
}
