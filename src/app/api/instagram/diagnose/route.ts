import { NextResponse } from 'next/server';
import { GRAPH_BASE, IG_GRAPH_BASE, metaConfig } from '@/lib/instagram/graph';
import { decryptText } from '@/lib/instagram/secrets';
import { readConnection, readPendingToken } from '@/lib/instagram/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Diagnóstico privado de la conexión con Meta (requiere la sesión del estudio, ver src/proxy.ts).
 * Prueba con el token guardado las consultas con las que se puede localizar la cuenta de Instagram y
 * devuelve las respuestas originales de Meta. El token nunca sale en la respuesta.
 */
export async function GET() {
  const conn = await readConnection(true);
  const pending = conn ? null : await readPendingToken();
  const enc = conn?.token || pending?.token;
  if (!enc) return NextResponse.json({ error: 'No hay ningún token guardado. Conecta primero.' }, { status: 404 });
  const token = decryptText(enc);
  const { appId, appSecret } = metaConfig();

  const raw = async (base: string, path: string, params: Record<string, string> = {}, useAppToken = false) => {
    const qs = new URLSearchParams(params);
    if (useAppToken) qs.set('access_token', `${appId}|${appSecret}`);
    const res = await fetch(`${base}${path}?${qs}`, {
      headers: useAppToken ? {} : { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  };

  const out: Record<string, unknown> = { source: conn ? 'connection' : 'pending' };
  const dbg = await raw(GRAPH_BASE, '/debug_token', { input_token: token }, true);
  // Sin el token ni datos innecesarios
  const d = (dbg.body as any)?.data || {};
  out.debug_token = { status: dbg.status, type: d.type, app_id: d.app_id, user_id: d.user_id, profile_id: d.profile_id, expires_at: d.expires_at, is_valid: d.is_valid, scopes: d.scopes, granular_scopes: d.granular_scopes, error: (dbg.body as any)?.error };

  const me = await raw(GRAPH_BASE, '/me', { fields: 'id,name,client_business_id' });
  out.me = me;
  const biz = (me.body as any)?.client_business_id || pending?.businessId || conn?.businessId;

  const probes: [string, string, string, Record<string, string>][] = [
    ['assigned_instagram_accounts', GRAPH_BASE, '/me/assigned_instagram_accounts', { fields: 'id,username' }],
    ['me_instagram_accounts', GRAPH_BASE, '/me/instagram_accounts', { fields: 'id,username' }],
    ['me_accounts', GRAPH_BASE, '/me/accounts', { fields: 'id,name,instagram_business_account{id,username}' }],
    ['me_businesses', GRAPH_BASE, '/me/businesses', { fields: 'id,name' }],
    ['ig_graph_me', IG_GRAPH_BASE, '/me', { fields: 'user_id,username' }],
  ];
  if (biz) {
    for (const edge of ['owned_instagram_accounts', 'instagram_business_accounts', 'instagram_accounts', 'client_instagram_accounts']) {
      probes.push([`biz_${edge}`, GRAPH_BASE, `/${biz}/${edge}`, { fields: 'id,username' }]);
    }
  }
  for (const [name, base, path, params] of probes) out[name] = await raw(base, path, params);

  // Ids de Instagram que aparezcan en los permisos concedidos: se prueba a leerlos como cuenta
  const ids = new Set<string>();
  for (const g of (d.granular_scopes || []) as { target_ids?: string[] }[]) (g.target_ids || []).forEach(id => ids.add(id));
  for (const id of ids) out[`target_${id}`] = await raw(GRAPH_BASE, `/${id}`, { fields: 'id,username,name' });

  return NextResponse.json(out);
}
