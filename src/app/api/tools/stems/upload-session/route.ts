import { NextRequest, NextResponse } from 'next/server';
import { getDriveAuthClient } from '@/lib/drive';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { filename, mimeType } = body;

    if (!filename) {
      return NextResponse.json({ error: 'Se requiere el nombre del archivo' }, { status: 400 });
    }

    const auth = getDriveAuthClient();
    const token = await auth.getAccessToken();

    if (!token || !token.token) {
      return NextResponse.json({ error: 'No se pudo autenticar con Google Drive' }, { status: 500 });
    }

    const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const fetchUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true';

    const parentId = process.env.DRIVE_ROOT_FOLDER_ID;

    const safeName = filename.replace(/[\\/:*?"<>|]/g, '_').trim() || 'audio_stem';

    const driveRes = await fetch(fetchUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.token}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': mimeType || 'audio/mpeg',
        'Origin': origin,
      },
      body: JSON.stringify({
        name: `temp_stem_${Date.now()}_${safeName}`,
        parents: parentId ? [parentId] : undefined,
        appProperties: {
          isTemporary: 'true',
          purpose: 'stems_split',
          expiresAt: (Date.now() + 1000 * 60 * 60).toString(), // 1 hora de seguridad máxima
        }
      })
    });

    if (!driveRes.ok) {
      const errText = await driveRes.text();
      console.error('[Stems Upload Session] Google Drive API error:', errText);
      return NextResponse.json({ error: `Error de Google Drive: ${errText}` }, { status: driveRes.status });
    }

    const uploadUrl = driveRes.headers.get('Location');
    if (!uploadUrl) {
      return NextResponse.json({ error: 'No se recibió la URL de subida de Google Drive' }, { status: 500 });
    }

    return NextResponse.json({ uploadUrl });
  } catch (err: any) {
    console.error('[Stems Upload Session] Error:', err);
    return NextResponse.json({ error: err.message || 'Error interno del servidor' }, { status: 500 });
  }
}
