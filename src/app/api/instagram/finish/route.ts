import { NextResponse } from 'next/server';
import { discoverInstagramAccounts, getAccount, setGraphHost } from '@/lib/instagram/graph';
import { readPendingToken, saveConnection, savePendingToken } from '@/lib/instagram/store';
import { decryptText } from '@/lib/instagram/secrets';

export const dynamic = 'force-dynamic';

const PREFERRED_USERNAME = 'ezyprods';

/**
 * Termina una conexión que Meta autorizó pero cuya cuenta no se pudo localizar en ese momento
 * (p. ej. porque la cuenta de Instagram aún no estaba asignada al usuario del sistema).
 * Usa el token guardado en 00_INSTAGRAM/pendiente.json, sin volver a pasar por Meta.
 */
export async function POST() {
  try {
    const pending = await readPendingToken();
    if (!pending) return NextResponse.json({ error: 'No hay ninguna conexión pendiente. Pulsa Conectar.' }, { status: 404 });
    const token = decryptText(pending.token);
    const { accounts, host, notes } = await discoverInstagramAccounts(token);
    if (!accounts.length) return NextResponse.json({ error: 'La cuenta sigue sin aparecer.', notes }, { status: 409 });
    setGraphHost(host);
    const detailed = await Promise.all(accounts.map(a => (a.username ? Promise.resolve(a) : getAccount(a.id, token).catch(() => a))));
    const chosen = detailed.find(a => a.username?.toLowerCase() === PREFERRED_USERNAME) || detailed[0];
    await saveConnection({
      igUserId: chosen.id,
      username: chosen.username || PREFERRED_USERNAME,
      name: chosen.name,
      profilePictureUrl: chosen.profile_picture_url,
      token: pending.token,
      host,
      systemUserId: pending.systemUserId,
      businessId: pending.businessId,
      connectedAt: new Date().toISOString(),
    });
    await savePendingToken(null);
    return NextResponse.json({ ok: true, username: chosen.username, igUserId: chosen.id });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
