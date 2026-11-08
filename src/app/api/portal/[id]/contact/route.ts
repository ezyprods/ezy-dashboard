import { NextResponse } from 'next/server';
import { findAndReadJsonFile, saveJsonFile } from '@/lib/drive';
import { DRIVE_ROOT_FOLDER_ID } from '@/lib/constants';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * PUT: the artist fills in their own email / phone from the portal (gear icon in the header).
 * They land in artist_config.json, the same fields the upload notifications read.
 * An empty value clears the field.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 200) : '';
    const phone = typeof body.phone === 'string' ? body.phone.replace(/[^\d+\s()-]/g, '').trim().slice(0, 30) : '';

    if (email && !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'El email no parece válido' }, { status: 400 });
    }
    if (phone && phone.replace(/\D/g, '').length < 8) {
      return NextResponse.json({ error: 'El teléfono no parece válido' }, { status: 400 });
    }

    const config = await findAndReadJsonFile<any>('artist_config.json', id);
    if (!config) return NextResponse.json({ error: 'Artist not found' }, { status: 404 });

    const withContact = (entry: any) => {
      const next = { ...entry, updatedAt: new Date().toISOString() };
      if (email) next.email = email; else delete next.email;
      if (phone) next.phone = phone; else delete next.phone;
      return next;
    };
    const updated = withContact(config);
    await saveJsonFile('artist_config.json', updated, id);

    // The dashboard (and the upload notifications) read the artist list from the global db
    const artistsDb = (await findAndReadJsonFile<any[]>('ezy_artists_db.json', DRIVE_ROOT_FOLDER_ID).catch(() => null)) || [];
    const index = artistsDb.findIndex(a => a?.id === id);
    if (index !== -1) artistsDb[index] = withContact(artistsDb[index]);
    else artistsDb.push(updated);
    await saveJsonFile('ezy_artists_db.json', artistsDb, DRIVE_ROOT_FOLDER_ID);

    return NextResponse.json({ success: true, contact: { email: updated.email || '', phone: updated.phone || '' } });
  } catch (error: any) {
    console.error('API /portal/[id]/contact PUT error:', error);
    return NextResponse.json({ error: 'No se pudo guardar', details: error.message }, { status: 500 });
  }
}
