import { NextRequest, NextResponse } from 'next/server';
import { discoverInstagramAccounts, exchangeCode, getAccount, setGraphHost, whoAmI } from '@/lib/instagram/graph';
import { encryptText, verifyOAuthState } from '@/lib/instagram/secrets';
import { saveConnection, savePendingToken } from '@/lib/instagram/store';

import { requireStudio } from '@/lib/routeAuth';
export const dynamic = 'force-dynamic';

const PREFERRED_USERNAME = 'ezyprods';

function back(request: NextRequest, params: Record<string, string>) {
  const url = new URL('/instagram', request.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const denied = await requireStudio();
  if (denied) return denied;
  const sp = request.nextUrl.searchParams;
  if (sp.get('error') || sp.get('error_reason')) {
    return back(request, { error: 'cancelled' });
  }
  if (!verifyOAuthState(sp.get('state'))) {
    return back(request, { error: 'state' });
  }
  const code = sp.get('code');
  if (!code) return back(request, { error: 'code' });

  try {
    const redirectUri = `${request.nextUrl.origin}/api/instagram/callback`;
    const token = await exchangeCode(code, redirectUri);
    const { accounts, host, notes } = await discoverInstagramAccounts(token);
    if (accounts.length === 0) {
      console.warn('[api/instagram/callback] sin cuentas:', notes);
      // Se guarda cifrado para poder diagnosticar y terminar la conexión sin volver a pasar por Meta
      const who = await whoAmI(token);
      await savePendingToken({ token: encryptText(token), businessId: who.client_business_id, systemUserId: who.id, at: new Date().toISOString() }).catch(() => {});
      return back(request, { error: 'no_accounts', msg: notes.join(' | ').slice(0, 600) });
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
    return back(request, { connected: chosen.username || '1' });
  } catch (err) {
    console.error('[api/instagram/callback]', err);
    return back(request, { error: 'exchange', msg: (err as Error).message.slice(0, 200) });
  }
}
