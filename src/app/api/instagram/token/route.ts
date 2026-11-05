import { NextResponse } from 'next/server';
import { discoverInstagramAccounts, getAccount, setGraphHost, whoAmI } from '@/lib/instagram/graph';
import { encryptText } from '@/lib/instagram/secrets';
import { saveConnection, savePendingToken } from '@/lib/instagram/store';

export const dynamic = 'force-dynamic';

const PREFERRED_USERNAME = 'ezyprods';

/**
 * Conexión manual con un identificador de acceso generado en el portfolio (usuario del sistema
 * propio, "Generar identificador", sin caducidad). Privado: requiere la sesión del estudio.
 * El token se guarda cifrado en Drive y nunca se devuelve.
 */
export async function POST(request: Request) {
  try {
    const { token: raw } = await request.json().catch(() => ({}));
    const token = String(raw || '').trim();
    if (!/^[A-Za-z0-9_-]{40,}$/.test(token)) {
      return NextResponse.json({ error: 'Eso no parece un identificador de acceso de Meta.' }, { status: 400 });
    }
    const { accounts, host, notes } = await discoverInstagramAccounts(token);
    if (!accounts.length) {
      return NextResponse.json({
        error: 'Con este identificador no aparece ninguna cuenta de Instagram. Comprueba que asignaste @ezyprods al usuario del sistema.',
        notes,
      }, { status: 409 });
    }
    setGraphHost(host);
    const detailed = await Promise.all(accounts.map(a => (a.username ? Promise.resolve(a) : getAccount(a.id, token).catch(() => a))));
    const chosen = detailed.find(a => a.username?.toLowerCase() === PREFERRED_USERNAME) || detailed[0];
    const me = await whoAmI(token);
    await saveConnection({
      igUserId: chosen.id,
      username: chosen.username || PREFERRED_USERNAME,
      name: chosen.name,
      profilePictureUrl: chosen.profile_picture_url,
      token: encryptText(token),
      host,
      systemUserId: me.id,
      businessId: me.client_business_id,
      connectedAt: new Date().toISOString(),
    });
    await savePendingToken(null).catch(() => {});
    return NextResponse.json({ ok: true, username: chosen.username || PREFERRED_USERNAME });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
