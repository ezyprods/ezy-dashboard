import { NextResponse } from 'next/server';
import { findAndReadJsonFile, saveJsonFile } from '@/lib/drive';
import type { PortalConfig } from '@/types';

const DEFAULT_MODULES = [
  { id: 'projects', type: 'projects', isVisible: true, order: 0, title: 'Proyectos Activos' },
  { id: 'bounces', type: 'bounces', isVisible: true, order: 1, title: 'Últimas Mezclas / Audios' },
  { id: 'finances', type: 'finances', isVisible: true, order: 2, title: 'Resumen Financiero' },
  { id: 'tasks', type: 'tasks', isVisible: true, order: 3, title: 'Estado del Trabajo' },
  { id: 'releases', type: 'releases', isVisible: true, order: 4, title: 'Releases / Previews' }
];

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    let config = await findAndReadJsonFile<PortalConfig>('portal_config.json', id);
    
    if (!config) {
      config = {
        artistId: id,
        token: Math.random().toString(36).substring(2, 15),
        producerName: 'Productor',
        showFeedback: true,
        createdAt: new Date().toISOString(),
        modules: DEFAULT_MODULES as any
      };
      await saveJsonFile('portal_config.json', config, id);
    } else if (!config.modules) {
      config.modules = DEFAULT_MODULES as any;
      await saveJsonFile('portal_config.json', config, id);
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
    
    const updatedConfig = { ...config, ...body };
    await saveJsonFile('portal_config.json', updatedConfig, id);
    
    return NextResponse.json({ config: updatedConfig });
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to update portal config' }, { status: 500 });
  }
}
