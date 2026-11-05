// Cliente de la API de Instagram con "inicio de sesión unificado" (Facebook Login for Business +
// usuario del sistema). Host graph.facebook.com. El token no caduca.
//
// Basado en el cliente probado de otro proyecto, adaptado al nuevo inicio de sesión de Meta.

export const GRAPH_VERSION = 'v24.0';
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
export const IG_GRAPH_BASE = `https://graph.instagram.com/${GRAPH_VERSION}`;

/** Host con el que funciona el token de la cuenta conectada (se decide al conectar) */
export type GraphHost = 'facebook' | 'instagram';
let currentBase = GRAPH_BASE;
export function setGraphHost(host: GraphHost | undefined) {
  currentBase = host === 'instagram' ? IG_GRAPH_BASE : GRAPH_BASE;
}

export function metaConfig() {
  const appId = process.env.META_APP_ID || '';
  const appSecret = process.env.META_APP_SECRET || '';
  const configId = process.env.META_LOGIN_CONFIG_ID || '';
  return { appId, appSecret, configId, ok: Boolean(appId && appSecret && configId) };
}

export class GraphError extends Error {
  code?: number;
  subcode?: number;
  /** El token ya no vale: hay que volver a conectar */
  authExpired: boolean;
  /** Merece la pena reintentar más tarde */
  transient: boolean;
  constructor(message: string, data?: any) {
    super(message);
    this.code = data?.code;
    this.subcode = data?.error_subcode;
    this.authExpired = this.code === 190 || this.code === 102;
    this.transient = data?.is_transient === true || this.code === 1 || this.code === 2 || this.code === 4 || this.code === 17 || this.code === 32 || this.code === 341;
  }
}

/** Mensajes de error de Meta traducidos a algo que se entienda */
function friendlyError(err: any, status: number): string {
  const code = err?.code;
  const sub = err?.error_subcode;
  const msg = String(err?.error_user_msg || err?.message || `Error ${status} de Instagram`);
  if (code === 190) return 'La conexión con Instagram ha caducado o se ha revocado. Vuelve a conectar la cuenta.';
  if (code === 10 || code === 200) return 'Falta un permiso en la app de Meta para hacer esto.';
  if (code === 4 || code === 17 || code === 32) return 'Instagram está limitando las peticiones. Se reintentará en unos minutos.';
  if (code === 9 || sub === 2207042) return 'Has llegado al máximo de publicaciones por API en 24 h (100). Espera unas horas.';
  if (sub === 2207026) return 'Instagram no acepta el formato del vídeo. Usa MP4 o MOV en H.264 con audio AAC.';
  if (sub === 2207004 || sub === 2207005) return 'Instagram no pudo descargar la imagen. Inténtalo otra vez.';
  if (sub === 2207009) return 'La proporción de la imagen no está permitida en el feed (entre 4:5 y 1.91:1).';
  if (sub === 2207050) return 'La cuenta de Instagram está restringida temporalmente para publicar.';
  if (sub === 2207051) return 'Instagram ha bloqueado esta publicación por sus normas comunitarias o por spam.';
  if (/user_tags|usertag/i.test(msg)) return 'Alguna de las personas etiquetadas no existe o no se puede etiquetar.';
  if (/collaborator/i.test(msg)) return 'Algún colaborador no existe o no admite invitaciones de colaboración.';
  return msg;
}

type Params = Record<string, string | number | boolean | undefined | null>;

async function call<T = any>(method: 'GET' | 'POST' | 'DELETE', path: string, params: Params, token?: string, base = currentBase): Promise<T> {
  const clean = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    clean.append(k, String(v));
  }
  const url = `${base}${path}`;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    if (method === 'GET') {
      res = await fetch(`${url}?${clean}`, { headers, cache: 'no-store' });
    } else {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      res = await fetch(url, { method, headers, body: clean, cache: 'no-store' });
    }
  } catch (err) {
    const e = new GraphError(`No se pudo contactar con Instagram: ${(err as Error).message}`);
    e.transient = true;
    throw e;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    throw new GraphError(friendlyError(data?.error, res.status), data?.error);
  }
  return data as T;
}

// ── Conexión ─────────────────────────────────────────────────────────────────

export function loginDialogUrl(redirectUri: string, state: string): string {
  const { appId, configId } = metaConfig();
  const p = new URLSearchParams({
    client_id: appId,
    config_id: configId,
    redirect_uri: redirectUri,
    response_type: 'code',
    override_default_response_type: 'true',
    state,
  });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${p}`;
}

export async function exchangeCode(code: string, redirectUri: string): Promise<string> {
  const { appId, appSecret } = metaConfig();
  const data = await call<{ access_token?: string }>('GET', '/oauth/access_token', {
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  }, undefined, GRAPH_BASE);
  if (!data.access_token) throw new GraphError('Meta no devolvió el token de acceso.');
  return data.access_token;
}

export interface IgAccount {
  id: string;
  username: string;
  name?: string;
  profile_picture_url?: string;
}

export async function whoAmI(token: string): Promise<{ id?: string; client_business_id?: string }> {
  return call('GET', '/me', { fields: 'id,client_business_id' }, token, GRAPH_BASE).catch(() => ({}));
}

export interface Discovery {
  accounts: IgAccount[];
  host: GraphHost;
  /** Qué respondió cada vía, para poder diagnosticar si no aparece ninguna cuenta */
  notes: string[];
}

/**
 * Busca la cuenta de Instagram que se compartió al conectar. Meta la expone por sitios distintos
 * según el tipo de inicio de sesión, así que se prueban varias vías en orden.
 */
export async function discoverInstagramAccounts(token: string): Promise<Discovery> {
  const notes: string[] = [];
  const attempt = async <T,>(label: string, fn: () => Promise<T>): Promise<T | null> => {
    try {
      return await fn();
    } catch (err) {
      notes.push(`${label}: ${(err as Error).message}`);
      return null;
    }
  };

  // 1. Usuario del sistema con cuentas asignadas (inicio de sesión unificado)
  const assigned = await attempt('assigned', () => call<{ data?: IgAccount[] }>('GET', '/me/assigned_instagram_accounts', { fields: 'id,username' }, token, GRAPH_BASE));
  if (assigned?.data?.length) return { accounts: assigned.data, host: 'facebook', notes };
  if (assigned) notes.push('assigned: vacío');

  // 2. Token compatible con el inicio de sesión de Instagram (graph.instagram.com)
  const igMe = await attempt('graph.instagram', () => call<{ user_id?: string; id?: string; username?: string; name?: string; profile_picture_url?: string }>(
    'GET', '/me', { fields: 'user_id,username,name,profile_picture_url' }, token, IG_GRAPH_BASE));
  if (igMe && (igMe.user_id || igMe.id)) {
    return {
      accounts: [{ id: String(igMe.user_id || igMe.id), username: igMe.username || '', name: igMe.name, profile_picture_url: igMe.profile_picture_url }],
      host: 'instagram',
      notes,
    };
  }

  // 3. Cuentas de Instagram de la empresa del cliente
  const me = await whoAmI(token);
  if (me.client_business_id) {
    for (const edge of ['owned_instagram_accounts', 'instagram_business_accounts', 'instagram_accounts']) {
      const r = await attempt(edge, () => call<{ data?: IgAccount[] }>('GET', `/${me.client_business_id}/${edge}`, { fields: 'id,username' }, token, GRAPH_BASE));
      if (r?.data?.length) return { accounts: r.data, host: 'facebook', notes };
    }
  } else {
    notes.push(`sin client_business_id (me=${me.id || '?'})`);
  }

  // 4. Páginas de Facebook con Instagram vinculado
  const pages = await attempt('pages', () => call<{ data?: { instagram_business_account?: IgAccount }[] }>(
    'GET', '/me/accounts', { fields: 'instagram_business_account{id,username,name,profile_picture_url}' }, token, GRAPH_BASE));
  const fromPages = (pages?.data || []).map(p => p.instagram_business_account).filter((a): a is IgAccount => !!a?.id);
  if (fromPages.length) return { accounts: fromPages, host: 'facebook', notes };

  // 5. Los ids concedidos que aparecen en el propio token
  const { appId, appSecret } = metaConfig();
  const dbg = await attempt('debug_token', () => call<{ data?: { type?: string; granular_scopes?: { scope: string; target_ids?: string[] }[] } }>(
    'GET', '/debug_token', { input_token: token, access_token: `${appId}|${appSecret}` }, undefined, GRAPH_BASE));
  const ids = new Set<string>();
  for (const sc of dbg?.data?.granular_scopes || []) {
    if (sc.scope.startsWith('instagram_')) (sc.target_ids || []).forEach(id => ids.add(id));
  }
  if (dbg) notes.push(`token ${dbg.data?.type || '?'} · scopes ${(dbg.data?.granular_scopes || []).map(g => g.scope + (g.target_ids?.length ? `(${g.target_ids.length})` : '')).join(',') || 'ninguno'}`);
  return { accounts: [...ids].map(id => ({ id, username: '' })), host: 'facebook', notes };
}

export async function getAccount(igUserId: string, token: string): Promise<IgAccount> {
  return call('GET', `/${igUserId}`, { fields: 'id,username,name,profile_picture_url' }, token);
}

export async function publishingQuota(igUserId: string, token: string): Promise<{ usage: number; total: number } | null> {
  try {
    const d = await call<{ data?: { quota_usage?: number; config?: { quota_total?: number } }[] }>(
      'GET', `/${igUserId}/content_publishing_limit`, { fields: 'quota_usage,config' }, token
    );
    const row = d.data?.[0];
    return { usage: Number(row?.quota_usage) || 0, total: Number(row?.config?.quota_total) || 100 };
  } catch {
    return null;
  }
}

// ── Publicación ──────────────────────────────────────────────────────────────

export interface ContainerParams {
  media_type?: 'STORIES' | 'REELS' | 'CAROUSEL' | 'VIDEO';
  image_url?: string;
  video_url?: string;
  caption?: string;
  is_carousel_item?: boolean;
  children?: string[];
  user_tags?: { username: string; x?: number; y?: number }[];
  collaborators?: string[];
  alt_text?: string;
  cover_url?: string;
  thumb_offset?: number;
  share_to_feed?: boolean;
  audio_name?: string;
  trial_params?: { graduation_strategy: 'MANUAL' | 'SS_PERFORMANCE' };
}

export async function createContainer(igUserId: string, token: string, p: ContainerParams): Promise<string> {
  const params: Params = {
    media_type: p.media_type,
    image_url: p.image_url,
    video_url: p.video_url,
    caption: p.caption,
    is_carousel_item: p.is_carousel_item ? 'true' : undefined,
    children: p.children?.length ? p.children.join(',') : undefined,
    user_tags: p.user_tags?.length ? JSON.stringify(p.user_tags) : undefined,
    collaborators: p.collaborators?.length ? JSON.stringify(p.collaborators) : undefined,
    alt_text: p.alt_text,
    cover_url: p.cover_url,
    thumb_offset: p.thumb_offset,
    share_to_feed: typeof p.share_to_feed === 'boolean' ? String(p.share_to_feed) : undefined,
    audio_name: p.audio_name,
    trial_params: p.trial_params ? JSON.stringify(p.trial_params) : undefined,
  };
  const d = await call<{ id?: string }>('POST', `/${igUserId}/media`, params, token);
  if (!d.id) throw new GraphError('Instagram no devolvió el contenedor de la publicación.');
  return d.id;
}

export type ContainerStatus = 'IN_PROGRESS' | 'FINISHED' | 'PUBLISHED' | 'ERROR' | 'EXPIRED' | string;

export async function containerStatus(containerId: string, token: string): Promise<{ code: ContainerStatus; detail?: string }> {
  const d = await call<{ status_code?: string; status?: string }>('GET', `/${containerId}`, { fields: 'status_code,status' }, token);
  return { code: String(d.status_code || 'IN_PROGRESS').toUpperCase(), detail: d.status };
}

export async function publishContainer(igUserId: string, containerId: string, token: string): Promise<string> {
  const d = await call<{ id?: string }>('POST', `/${igUserId}/media_publish`, { creation_id: containerId }, token);
  if (!d.id) throw new GraphError('Instagram no devolvió el ID de la publicación.');
  return d.id;
}

export async function mediaInfo(mediaId: string, token: string): Promise<{ permalink?: string; timestamp?: string }> {
  return call('GET', `/${mediaId}`, { fields: 'permalink,timestamp' }, token).catch(() => ({}));
}

export async function postComment(mediaId: string, message: string, token: string): Promise<void> {
  await call('POST', `/${mediaId}/comments`, { message }, token);
}

export interface RecentMedia {
  id: string;
  timestamp?: string;
  media_product_type?: string;
  permalink?: string;
}

export async function recentMedia(igUserId: string, token: string, limit = 25): Promise<RecentMedia[]> {
  const d = await call<{ data?: RecentMedia[] }>('GET', `/${igUserId}/media`, { fields: 'id,timestamp,media_product_type,permalink', limit }, token);
  return d.data || [];
}

export async function recentStories(igUserId: string, token: string): Promise<RecentMedia[]> {
  const d = await call<{ data?: RecentMedia[] }>('GET', `/${igUserId}/stories`, { fields: 'id,timestamp,media_product_type,permalink' }, token).catch(() => ({ data: [] }));
  return d.data || [];
}
