import { createHash } from 'node:crypto';
import { matrixProgress, openCells, openChecklistItems, type OpenCellStatus } from '@/lib/matrixStats';
import { FORMAT_LABEL } from '@/lib/instagram/limits';
import type { HubSnapshot } from './collect';

/**
 * Hub feed, common contract v1 (the same in vudu, vivalavida and ezy).
 *
 * What goes in: anything that asks the producer to act — open matrix cells, checklist items with a
 * date, project delivery and release dates, unpaid payments, unread portal comments and Instagram
 * posts that are scheduled, being published or failed. Window: everything overdue and unresolved,
 * plus the next 60 days. Undated matrix cells only when they are in progress or in review.
 *
 * What never goes in: emails, phones, tax ids, IBANs, tokens, free-text notes (comment bodies,
 * captions, payment concepts) and Drive file ids. Internal ids are hashed into `id`; the only
 * Drive folder ids that appear are inside `url`, which points at the password-protected dashboard.
 */

export type HubTipo = 'tarea' | 'evento' | 'plazo' | 'cobro' | 'seguimiento' | 'mensaje' | 'publicacion';
export type HubEstado = 'pendiente' | 'en_curso' | 'revision' | 'vencido' | 'hecho' | 'fallido';
export type HubPrioridad = 'alta' | 'media' | 'baja';

export interface HubItem {
  id: string;
  tipo: HubTipo;
  subtipo: string;
  titulo: string;
  contexto: string;
  fecha: string | null;
  hora: string | null;
  fecha_limite: string | null;
  estado: HubEstado;
  prioridad: HubPrioridad | null;
  importe_eur: number | null;
  accion: string | null;
  evento_calendario_id: string | null;
  url: string;
  actualizado: string | null;
}

export interface HubFeed {
  fuente: 'ezy';
  version: 1;
  generado: string;
  items: HubItem[];
  resumen: Record<string, number>;
}

export const HUB_WINDOW_DAYS = 60;
const TZ = 'Europe/Madrid';

// ── Dates in Europe/Madrid ───────────────────────────────────────────────────

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export const madridDate = (d: Date) => dayFmt.format(d);
export const madridTime = (d: Date) => timeFmt.format(d);

/** ISO 8601 with the Madrid offset, e.g. 2026-11-08T22:10:00+01:00 */
export function madridIso(d: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(d).map((p) => [p.type, p.value]),
  );
  const wall = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offsetMin = Math.round((wall - Math.floor(d.getTime() / 1000) * 1000) / 60000);
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const off = `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${off}`;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Accepts YYYY-MM-DD or a full ISO date and returns the Madrid calendar day. */
function toDay(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  if (DAY_RE.test(value)) return value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : madridDate(d);
}

function addDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Stable id: the same element always hashes to the same value, and no Drive id leaks through it. */
const hubId = (tipo: HubTipo, ...parts: (string | number | undefined)[]) =>
  `ezy:${tipo}:${createHash('sha256').update(parts.map((p) => String(p ?? '')).join('|')).digest('hex').slice(0, 20)}`;

const short = (s: string, max = 90) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

const CELL_ESTADO: Record<OpenCellStatus, HubEstado> = { todo: 'pendiente', in_progress: 'en_curso', review: 'revision' };

function priorityFor(due: string | null, today: string, estado: HubEstado): HubPrioridad | null {
  if (estado === 'vencido' || estado === 'fallido') return 'alta';
  if (!due) return null;
  const left = daysBetween(today, due);
  if (left <= 3) return 'alta';
  if (left <= 14) return 'media';
  return 'baja';
}

const euros = (n: unknown) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
};

// ── Builder ──────────────────────────────────────────────────────────────────

export function buildHubFeed(snapshot: HubSnapshot, now: Date, baseUrl: string): HubFeed {
  const today = madridDate(now);
  const horizon = addDays(today, HUB_WINDOW_DAYS);
  const inWindow = (day: string | null) => !!day && day <= horizon; // overdue days are kept
  const base = baseUrl.replace(/\/+$/, '');
  const items: HubItem[] = [];

  const stateFor = (open: HubEstado, due: string | null): HubEstado => (due && due < today ? 'vencido' : open);

  for (const artist of snapshot.artists) {
    const artistUrl = `${base}/artists/${artist.id}`;

    // Matrices of the artist plus the matrix of each project (tasks.json)
    const grids: { key: string; name: string; matrix: unknown; url: string; context: string }[] = [
      ...artist.matrices.map((m) => ({
        key: `m:${m.id}`,
        name: m.name || 'Matriz',
        matrix: m,
        url: `${artistUrl}?tab=matrices&matrixId=${encodeURIComponent(m.id)}`,
        context: `${artist.name} · ${m.name || 'Matriz'}`,
      })),
      ...artist.projects
        .filter((p) => p.productionGrid)
        .map((p) => ({
          key: `p:${p.id}`,
          name: p.title,
          matrix: { productionGrid: p.productionGrid },
          url: `${base}/projects/${p.id}`,
          context: `${artist.name} · ${p.title}`,
        })),
    ];

    for (const g of grids) {
      if (matrixProgress(g.matrix).completed) continue;

      for (const cell of openCells(g.matrix)) {
        const due = toDay(cell.dueDate);
        // Undated "to do" cells are the whole backlog: only what is moving or waiting for review
        if (!due && cell.status === 'todo') continue;
        if (due && !inWindow(due)) continue;
        const estado = stateFor(CELL_ESTADO[cell.status], due);
        items.push({
          id: hubId('tarea', artist.id, g.key, cell.rowId, cell.colId),
          tipo: 'tarea',
          subtipo: 'matriz',
          titulo: short(`${cell.colName}: ${cell.rowName}`),
          contexto: g.context,
          fecha: null,
          hora: null,
          fecha_limite: due,
          estado,
          prioridad: priorityFor(due, today, estado),
          importe_eur: null,
          accion: cell.status === 'review' ? 'Revisar' : cell.status === 'in_progress' ? 'Terminar' : 'Empezar',
          evento_calendario_id: cell.eventId || null,
          url: g.url,
          actualizado: null,
        });
      }

      for (const item of openChecklistItems(g.matrix)) {
        const due = toDay(item.dueDate);
        if (!inWindow(due)) continue;
        const estado = stateFor('pendiente', due);
        items.push({
          id: hubId('tarea', artist.id, g.key, item.rowId, item.colId, item.itemId),
          tipo: 'tarea',
          subtipo: 'subtarea',
          titulo: short(item.text || `${item.colName}: ${item.rowName}`),
          contexto: `${g.context} · ${item.rowName}`,
          fecha: null,
          hora: null,
          fecha_limite: due,
          estado,
          prioridad: priorityFor(due, today, estado),
          importe_eur: null,
          accion: 'Completar',
          evento_calendario_id: null,
          url: g.url,
          actualizado: null,
        });
      }
    }

    for (const p of artist.projects) {
      if (p.status && p.status !== 'active') continue;
      const delivery = toDay(p.deliveryDate);
      if (delivery && inWindow(delivery)) {
        const estado = stateFor('pendiente', delivery);
        items.push({
          id: hubId('plazo', artist.id, p.id, 'entrega'),
          tipo: 'plazo',
          subtipo: 'entrega',
          titulo: short(`Entregar «${p.title}»`),
          contexto: artist.name,
          fecha: null,
          hora: null,
          fecha_limite: delivery,
          estado,
          prioridad: priorityFor(delivery, today, estado),
          importe_eur: null,
          accion: 'Entregar',
          evento_calendario_id: null,
          url: `${base}/projects/${p.id}`,
          actualizado: p.updatedAt || null,
        });
      }
      const release = toDay(p.releaseDate);
      // A release date that has passed is not an open task: only upcoming releases
      if (release && release >= today && inWindow(release)) {
        items.push({
          id: hubId('plazo', artist.id, p.id, 'lanzamiento'),
          tipo: 'plazo',
          subtipo: 'lanzamiento',
          titulo: short(`Preparar el lanzamiento de «${p.title}»`),
          contexto: artist.name,
          fecha: release,
          hora: null,
          fecha_limite: release,
          estado: 'pendiente',
          prioridad: priorityFor(release, today, 'pendiente'),
          importe_eur: null,
          accion: 'Preparar lanzamiento',
          evento_calendario_id: null,
          url: `${base}/projects/${p.id}`,
          actualizado: p.updatedAt || null,
        });
      }
    }

    for (const m of artist.messages) {
      if (m.isRead || m.authorIsProducer) continue;
      const at = m.timestamp ? new Date(m.timestamp) : null;
      const valid = at && !isNaN(at.getTime());
      items.push({
        id: hubId('mensaje', artist.id, m.id),
        tipo: 'mensaje',
        subtipo: 'comentario_portal',
        titulo: short(`Responder a ${artist.name}`),
        contexto: m.trackTitle ? short(`${artist.name} · ${m.trackTitle}`) : artist.name,
        fecha: valid ? madridDate(at!) : null,
        hora: valid ? madridTime(at!) : null,
        fecha_limite: null,
        estado: 'pendiente',
        prioridad: 'media',
        importe_eur: null,
        accion: 'Responder',
        evento_calendario_id: null,
        url: `${artistUrl}?tab=portal`,
        actualizado: valid ? at!.toISOString() : null,
      });
    }
  }

  // Payments: every unpaid one, whatever its date (an unpaid payment never expires)
  const artistName = new Map(snapshot.artists.map((a) => [a.id, a.name]));
  const projectTitle = new Map(snapshot.artists.flatMap((a) => a.projects.map((p) => [p.id, p.title] as const)));
  for (const p of snapshot.payments) {
    if (p.status !== 'pending' && p.status !== 'partial') continue;
    const name = artistName.get(p.artistId) || 'Cliente';
    const project = p.projectId ? projectTitle.get(p.projectId) : undefined;
    const day = toDay(p.date);
    items.push({
      id: hubId('cobro', p.id),
      tipo: 'cobro',
      subtipo: p.status === 'partial' ? 'pago_parcial' : 'pago',
      titulo: short(`Cobrar a ${name}`),
      contexto: project ? `${name} · ${project}` : name,
      fecha: day,
      hora: null,
      fecha_limite: null,
      estado: p.status === 'partial' ? 'en_curso' : 'pendiente',
      prioridad: day && daysBetween(day, today) > 30 ? 'alta' : 'media',
      importe_eur: euros(p.amount),
      accion: 'Cobrar',
      evento_calendario_id: null,
      url: `${base}/payments`,
      actualizado: p.updatedAt || null,
    });
  }

  // Instagram
  for (const post of snapshot.posts) {
    const at = post.scheduledFor ? new Date(post.scheduledFor) : null;
    const valid = !!at && !isNaN(at.getTime());
    const day = valid ? madridDate(at!) : null;
    const label = FORMAT_LABEL[post.format] || 'Publicación';
    let estado: HubEstado;
    let accion: string;
    if (post.status === 'FAILED') {
      estado = 'fallido';
      accion = 'Revisar el error';
    } else if (post.status === 'PROCESSING') {
      estado = 'en_curso';
      accion = 'Comprobar';
    } else if (post.status === 'PENDING') {
      if (day && !inWindow(day)) continue;
      estado = 'pendiente';
      accion = 'Revisar antes de publicar';
    } else continue;
    items.push({
      id: hubId('publicacion', post.id),
      tipo: 'publicacion',
      subtipo: `instagram_${post.format.toLowerCase()}`,
      titulo: short(post.title ? `${label}: ${post.title}` : `${label} en Instagram`),
      contexto: post.links?.artistName ? `@ezyprods · ${post.links.artistName}` : '@ezyprods',
      fecha: day,
      hora: valid ? madridTime(at!) : null,
      fecha_limite: null,
      estado,
      prioridad: estado === 'fallido' ? 'alta' : priorityFor(day, today, estado),
      importe_eur: null,
      accion,
      evento_calendario_id: null,
      url: `${base}/instagram`,
      actualizado: post.updatedAt || null,
    });
  }

  // Most urgent first: overdue/failed, then by date, undated last
  const rank = (i: HubItem) => (i.estado === 'vencido' || i.estado === 'fallido' ? 0 : 1);
  const when = (i: HubItem) => i.fecha_limite || i.fecha || '9999-12-31';
  items.sort((a, b) => rank(a) - rank(b) || when(a).localeCompare(when(b)) || a.id.localeCompare(b.id));

  const count = (f: (i: HubItem) => boolean) => items.filter(f).length;
  const resumen = {
    total: items.length,
    tareas_abiertas: count((i) => i.tipo === 'tarea'),
    tareas_vencidas: count((i) => i.tipo === 'tarea' && i.estado === 'vencido'),
    tareas_en_revision: count((i) => i.tipo === 'tarea' && i.estado === 'revision'),
    plazos_proximos: count((i) => i.tipo === 'plazo'),
    cobros_pendientes: count((i) => i.tipo === 'cobro'),
    importe_pendiente_eur: Math.round(items.filter((i) => i.tipo === 'cobro').reduce((s, i) => s + (i.importe_eur || 0), 0) * 100) / 100,
    mensajes_sin_leer: count((i) => i.tipo === 'mensaje'),
    publicaciones_programadas: count((i) => i.tipo === 'publicacion' && i.estado === 'pendiente'),
    publicaciones_fallidas: count((i) => i.tipo === 'publicacion' && i.estado === 'fallido'),
    artistas: snapshot.artists.length,
  };

  return { fuente: 'ezy', version: 1, generado: madridIso(now), items, resumen };
}
