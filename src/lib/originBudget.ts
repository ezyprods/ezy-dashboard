import { NextResponse, after } from 'next/server';
import { getDriveService } from '@/lib/drive';
import { DRIVE_ROOT_FOLDER_ID } from '@/lib/constants';

/**
 * Freno de consumo para el plan Hobby de Vercel.
 *
 * Vercel pausa el equipo entero durante 30 días si "Fast Origin Transfer" pasa de
 * 10 GB en los últimos 30 días. Ya pasó una vez (24 nov 2026) y el periodo de gracia
 * está gastado: el siguiente exceso tumba la web sin aviso. En Hobby no hay API para
 * consultar ese consumo, así que se mide aquí: cada byte que una función devuelve
 * es Fast Origin Transfer (los aciertos de caché del CDN no ejecutan la función y no
 * cuentan), y las rutas que sirven archivos son casi todo el gasto.
 *
 * Al acercarse al límite se apaga lo prescindible antes que la web:
 *  - SOFT: descargador y descargas de stems vía servidor (lo que más gasta y menos falta hace).
 *  - HARD: todo lo que sirve archivos salvo Instagram. La web, las fichas y el audio
 *    ya guardado en cada dispositivo siguen funcionando.
 * Se reactivan solos cuando los días antiguos salen de la ventana de 30 días.
 *
 * Los umbrales dejan ~2 GB para lo que no se mide (páginas, JSON).
 * El registro vive en Drive: 00_SISTEMA/consumo-vercel.json ({ dias: { 'AAAA-MM-DD': bytes } }).
 */

const GB = 1e9;
export const SOFT_BYTES = 6 * GB;
export const HARD_BYTES = 8 * GB;
const WINDOW_DAYS = 30;
const FLUSH_BYTES = 16 * 1024 * 1024;
const FLUSH_MS = 2 * 60 * 1000;
const READ_TTL_MS = 60 * 1000;

const FOLDER_NAME = '00_SISTEMA';
const FILE_NAME = 'consumo-vercel.json';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export type OriginKind = 'audio' | 'files' | 'downloader' | 'tools' | 'instagram';
export type OriginLevel = 'ok' | 'soft' | 'hard';

interface UsageFile {
  dias: Record<string, number>;
}

let fileId: string | null = null;
let snapshot: { data: UsageFile; at: number } | null = null;
let pending = 0;
let lastFlush = Date.now();
let flushing: Promise<void> | null = null;

const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);

async function locateFile(): Promise<string> {
  if (fileId) return fileId;
  const drive = getDriveService();
  const find = async (q: string) =>
    (await drive.files.list({ q, fields: 'files(id)', orderBy: 'createdTime', pageSize: 1, supportsAllDrives: true, includeItemsFromAllDrives: true })).data.files?.[0]?.id;

  let folder = await find(`'${DRIVE_ROOT_FOLDER_ID}' in parents and name = '${FOLDER_NAME}' and mimeType = '${FOLDER_MIME}' and trashed = false`);
  if (!folder) {
    folder = (await drive.files.create({
      requestBody: { name: FOLDER_NAME, mimeType: FOLDER_MIME, parents: [DRIVE_ROOT_FOLDER_ID] },
      fields: 'id',
      supportsAllDrives: true,
    })).data.id!;
  }
  let id = await find(`'${folder}' in parents and name = '${FILE_NAME}' and trashed = false`);
  if (!id) {
    id = (await drive.files.create({
      requestBody: { name: FILE_NAME, mimeType: 'application/json', parents: [folder] },
      media: { mimeType: 'application/json', body: JSON.stringify({ dias: {} }) },
      fields: 'id',
      supportsAllDrives: true,
    })).data.id!;
  }
  fileId = id;
  return id;
}

async function readUsage(): Promise<UsageFile> {
  const drive = getDriveService();
  const res = await drive.files.get({ fileId: await locateFile(), alt: 'media', supportsAllDrives: true });
  const data = (typeof res.data === 'string' ? JSON.parse(res.data) : res.data) as UsageFile;
  return { dias: data?.dias || {} };
}

async function flush(): Promise<void> {
  if (!pending) return;
  const bytes = pending;
  pending = 0;
  lastFlush = Date.now();
  try {
    const data = await readUsage();
    const today = dayKey(Date.now());
    data.dias[today] = (data.dias[today] || 0) + bytes;
    const oldest = dayKey(Date.now() - (WINDOW_DAYS + 5) * 86400000);
    for (const day of Object.keys(data.dias)) if (day < oldest) delete data.dias[day];
    await getDriveService().files.update({
      fileId: await locateFile(),
      media: { mimeType: 'application/json', body: JSON.stringify(data) },
      supportsAllDrives: true,
    });
    snapshot = { data, at: Date.now() };
  } catch (err) {
    pending += bytes; // se reintenta en el siguiente envío
    console.error('[originBudget] flush failed:', (err as Error)?.message || err);
  }
}

function flushIfDue(): Promise<void> {
  if (flushing || !pending) return flushing || Promise.resolve();
  if (pending < FLUSH_BYTES && Date.now() - lastFlush < FLUSH_MS) return Promise.resolve();
  flushing = flush().finally(() => { flushing = null; });
  return flushing;
}

/** Cuenta bytes que una función va a devolver. */
export function meterBytes(bytes: number) {
  if (bytes > 0) pending += bytes;
}

/** Envuelve un cuerpo en streaming para contar lo que de verdad sale. */
export function meterStream(body: ReadableStream<Uint8Array> | null): ReadableStream<Uint8Array> | null {
  if (!body) return body;
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      pending += chunk.byteLength;
      controller.enqueue(chunk);
    },
  }));
}

export interface OriginStatus {
  level: OriginLevel;
  used30: number;
  /** Día (AAAA-MM-DD) en que se vuelve a estar por debajo del umbral alcanzado */
  reopensOn: string | null;
}

export async function originStatus(): Promise<OriginStatus> {
  if (!snapshot || Date.now() - snapshot.at > READ_TTL_MS) {
    try {
      snapshot = { data: await readUsage(), at: Date.now() };
    } catch (err) {
      // Sin registro no se bloquea nada: la web no debe caerse por el freno.
      console.error('[originBudget] read failed:', (err as Error)?.message || err);
      return { level: 'ok', used30: pending, reopensOn: null };
    }
  }
  const from = dayKey(Date.now() - (WINDOW_DAYS - 1) * 86400000);
  const days = Object.entries(snapshot.data.dias).filter(([d]) => d >= from).sort(([a], [b]) => a.localeCompare(b));
  const used30 = days.reduce((sum, [, b]) => sum + b, 0) + pending;
  const level: OriginLevel = used30 >= HARD_BYTES ? 'hard' : used30 >= SOFT_BYTES ? 'soft' : 'ok';

  let reopensOn: string | null = null;
  if (level !== 'ok') {
    const target = level === 'hard' ? HARD_BYTES : SOFT_BYTES;
    let left = used30;
    for (const [day, bytes] of days) {
      left -= bytes;
      if (left < target) {
        reopensOn = dayKey(Date.parse(day) + WINDOW_DAYS * 86400000);
        break;
      }
    }
  }
  return { level, used30, reopensOn };
}

const BLOCKED_AT: Record<OriginKind, OriginLevel[]> = {
  downloader: ['soft', 'hard'],
  tools: ['soft', 'hard'],
  audio: ['hard'],
  files: ['hard'],
  instagram: [],
};

/**
 * Llamar al principio de cada ruta que sirve archivos. Devuelve una respuesta 503 si
 * hay que frenar; si no, null. Programa además el guardado del contador.
 */
export async function originGuard(kind: OriginKind): Promise<NextResponse | null> {
  after(() => flushIfDue());
  const status = await originStatus();
  if (!BLOCKED_AT[kind].includes(status.level)) return null;

  const when = status.reopensOn
    ? new Date(status.reopensOn).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
    : 'dentro de unos días';
  const what = kind === 'downloader' ? 'El descargador' : kind === 'tools' ? 'Esta herramienta' : 'La reproducción de archivos nuevos';
  return NextResponse.json(
    {
      error: `${what} está en pausa hasta el ${when} para no superar el límite gratuito de Vercel. El resto de la plataforma sigue funcionando.`,
      code: 'origin_budget',
    },
    { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '86400' } }
  );
}

/** Cuenta un cuerpo ya en memoria y lo devuelve tal cual. */
export function meterBuffer<T extends ArrayBufferView | ArrayBuffer>(buf: T): T {
  meterBytes(buf.byteLength);
  return buf;
}
