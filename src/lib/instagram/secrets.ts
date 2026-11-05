import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Cifrado del token de Meta guardado en Drive, firma de las URLs de medios que descarga Instagram
// y del parámetro `state` del inicio de sesión. Todo con BETTER_AUTH_SECRET, que ya existe.

function secret(): string {
  const s = process.env.BETTER_AUTH_SECRET;
  if (!s) throw new Error('Falta BETTER_AUTH_SECRET');
  return s;
}

function key(purpose: string): Buffer {
  return createHash('sha256').update(`ezy-instagram:${purpose}:${secret()}`).digest();
}

export function encryptText(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key('token'), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${data.toString('base64url')}`;
}

export function decryptText(payload: string): string {
  const [v, iv, tag, data] = String(payload || '').split('.');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Token guardado con un formato desconocido');
  const decipher = createDecipheriv('aes-256-gcm', key('token'), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}

function hmac(purpose: string, value: string): string {
  return createHmac('sha256', key(purpose)).update(value).digest('base64url').slice(0, 32);
}

function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Firma de /api/instagram/media/<fileId>: solo se sirven archivos que esta app ha firmado */
export function signMedia(fileId: string): string {
  return hmac('media', fileId);
}

export function verifyMedia(fileId: string, sig: string | null): boolean {
  return !!sig && safeEqual(signMedia(fileId), sig);
}

const STATE_MAX_AGE_MS = 15 * 60 * 1000;

export function createOAuthState(): string {
  const issued = Date.now().toString(36);
  const nonce = randomBytes(9).toString('base64url');
  return `${issued}.${nonce}.${hmac('state', `${issued}.${nonce}`)}`;
}

export function verifyOAuthState(state: string | null): boolean {
  const [issued, nonce, sig] = String(state || '').split('.');
  if (!issued || !nonce || !sig) return false;
  if (!safeEqual(hmac('state', `${issued}.${nonce}`), sig)) return false;
  const age = Date.now() - parseInt(issued, 36);
  return age >= 0 && age < STATE_MAX_AGE_MS;
}

/** Clave del activador: Bearer de Vercel Cron o ?key= del Apps Script */
export function isCronAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const auth = request.headers.get('authorization') || '';
  if (auth.startsWith('Bearer ') && safeEqual(auth.slice(7), expected)) return true;
  const k = new URL(request.url).searchParams.get('key');
  return !!k && safeEqual(k, expected);
}
