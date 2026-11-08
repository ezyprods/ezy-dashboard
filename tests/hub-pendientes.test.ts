import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HubSnapshot } from '@/lib/hub/collect';

// The route must never touch Drive in tests: the snapshot comes from this fixture
const snapshot = vi.hoisted(() => ({ current: null as unknown as HubSnapshot }));
vi.mock('@/lib/hub/collect', () => ({ collectHubSnapshot: async () => snapshot.current }));

const NOW = new Date('2026-11-08T21:30:00Z'); // 22:30 in Madrid
const ARTIST = '1ArtistFolderIdAAAAAAAAAAAAAAAAAA';
const PROJECT = '1ProjectFolderIdBBBBBBBBBBBBBBBBB';
const FILE = '1AudioFileIdCCCCCCCCCCCCCCCCCCCCCC';

function fixture(): HubSnapshot {
  return {
    artists: [{
      id: ARTIST,
      name: 'Artista Demo',
      matrices: [{
        id: 'mat-1',
        name: 'Single',
        productionGrid: {
          columns: [{ id: 'c-mix', name: 'Mezcla' }, { id: 'c-mas', name: 'Master' }, { id: 'c-txt', name: 'Notas', type: 'text' }],
          rows: [
            {
              id: 'r-1', name: 'Canción A', linkedFile: { id: FILE, name: 'a.wav' },
              cells: {
                'c-mix': { status: 'in_progress', dueDate: '2026-11-05', eventId: 'gcal123', notes: 'nota privada', fileId: FILE },
                'c-mas': { status: 'todo', dueDate: '2026-11-20' },
                'c-txt': { status: 'todo', textValue: 'texto libre' },
              },
            },
            {
              id: 'r-2', name: 'Canción B',
              cells: {
                'c-mix': { status: 'review' },
                'c-mas': { status: 'todo' },                        // undated todo → left out
                'c-txt': { status: 'todo', dueDate: '2027-06-01' }, // beyond 60 days → left out
              },
            },
            { id: 'r-3', name: 'Canción C', cells: { 'c-mix': { status: 'done', dueDate: '2026-11-01' } } },
          ],
        },
      }],
      messages: [
        { id: 'fb-1', authorIsProducer: false, isRead: false, timestamp: '2026-11-07T18:15:00Z', trackTitle: 'Canción A' },
        { id: 'fb-2', authorIsProducer: false, isRead: true, timestamp: '2026-11-01T10:00:00Z' },
        { id: 'fb-3', authorIsProducer: true, isRead: false, timestamp: '2026-11-02T10:00:00Z' },
      ],
      projects: [
        { id: PROJECT, title: 'EP Demo', status: 'active', deliveryDate: '2026-11-15', releaseDate: '2026-12-20', updatedAt: '2026-11-01T09:00:00Z' },
        { id: '1OldProjectDDDDDDDDDDDDDDDDDDDDDD', title: 'Viejo', status: 'completed', deliveryDate: '2026-11-10' },
      ],
    }],
    payments: [
      { id: 'pay-1', artistId: ARTIST, projectId: PROJECT, amount: 150, concept: 'concepto con datos privados', date: '2026-09-01', status: 'pending', method: 'bizum', createdAt: '', updatedAt: '2026-09-01T10:00:00Z' },
      { id: 'pay-2', artistId: ARTIST, amount: 90, date: '2026-11-01', status: 'paid', method: 'cash', createdAt: '', updatedAt: '' },
    ],
    posts: [
      { id: 'ig-1', status: 'PENDING', format: 'REEL', scheduledFor: '2026-11-10T18:00:00Z', title: 'Teaser', caption: 'caption privada', updatedAt: '2026-11-08T10:00:00Z' },
      { id: 'ig-2', status: 'FAILED', format: 'POST', scheduledFor: '2026-11-01T18:00:00Z', caption: 'x', updatedAt: '2026-11-01T18:05:00Z' },
    ] as unknown as HubSnapshot['posts'],
  };
}

const TIPOS = ['tarea', 'evento', 'plazo', 'cobro', 'seguimiento', 'mensaje', 'publicacion'];
const ESTADOS = ['pendiente', 'en_curso', 'revision', 'vencido', 'hecho', 'fallido'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const KEYS = ['id', 'tipo', 'subtipo', 'titulo', 'contexto', 'fecha', 'hora', 'fecha_limite', 'estado', 'prioridad',
  'importe_eur', 'accion', 'evento_calendario_id', 'url', 'actualizado'].sort();

describe('hub feed format (contract v1)', () => {
  it('builds exactly the contract shape', async () => {
    const { buildHubFeed } = await import('@/lib/hub/pendientes');
    const feed = buildHubFeed(fixture(), NOW, 'https://ezy.example');

    expect(Object.keys(feed).sort()).toEqual(['fuente', 'generado', 'items', 'resumen', 'version']);
    expect(feed.fuente).toBe('ezy');
    expect(feed.version).toBe(1);
    expect(feed.generado).toBe('2026-11-08T22:30:00+01:00');

    for (const item of feed.items) {
      expect(Object.keys(item).sort()).toEqual(KEYS);
      expect(item.id).toMatch(/^ezy:(tarea|evento|plazo|cobro|seguimiento|mensaje|publicacion):[0-9a-f]{20}$/);
      expect(item.id.split(':')[1]).toBe(item.tipo);
      expect(TIPOS).toContain(item.tipo);
      expect(ESTADOS).toContain(item.estado);
      expect([null, 'alta', 'media', 'baja']).toContain(item.prioridad);
      for (const d of [item.fecha, item.fecha_limite]) if (d !== null) expect(d).toMatch(DAY);
      if (item.hora !== null) expect(item.hora).toMatch(/^\d{2}:\d{2}$/);
      expect(item.url.startsWith('https://ezy.example/')).toBe(true);
      expect(typeof item.titulo).toBe('string');
      if (item.importe_eur !== null) expect(typeof item.importe_eur).toBe('number');
    }
    for (const v of Object.values(feed.resumen)) expect(typeof v).toBe('number');
  });

  it('includes what needs action and leaves the rest out', async () => {
    const { buildHubFeed } = await import('@/lib/hub/pendientes');
    const { items, resumen } = buildHubFeed(fixture(), NOW, 'https://ezy.example');
    const titles = items.map((i) => i.titulo);

    // overdue in-progress cell, with its calendar event
    const mix = items.find((i) => i.titulo === 'Mezcla: Canción A')!;
    expect(mix.estado).toBe('vencido');
    expect(mix.prioridad).toBe('alta');
    expect(mix.evento_calendario_id).toBe('gcal123');
    expect(mix.fecha_limite).toBe('2026-11-05');

    expect(titles).toContain('Master: Canción A');           // dated todo
    expect(items.find((i) => i.titulo === 'Mezcla: Canción B')?.estado).toBe('revision'); // undated review
    expect(titles).not.toContain('Master: Canción B');       // undated todo
    expect(titles).not.toContain('Notas: Canción B');        // beyond the window
    expect(titles).not.toContain('Mezcla: Canción C');       // done

    expect(titles).toContain('Entregar «EP Demo»');
    expect(titles).toContain('Preparar el lanzamiento de «EP Demo»');
    expect(titles).not.toContain('Entregar «Viejo»');         // project not active

    const cobro = items.find((i) => i.tipo === 'cobro')!;
    expect(cobro.importe_eur).toBe(150);
    expect(cobro.contexto).toBe('Artista Demo · EP Demo');
    expect(items.filter((i) => i.tipo === 'cobro')).toHaveLength(1); // the paid one is out

    const msg = items.filter((i) => i.tipo === 'mensaje');
    expect(msg).toHaveLength(1);
    expect(msg[0]).toMatchObject({ fecha: '2026-11-07', hora: '19:15', accion: 'Responder' });

    const pub = items.filter((i) => i.tipo === 'publicacion');
    expect(pub.map((p) => p.estado).sort()).toEqual(['fallido', 'pendiente']);
    expect(pub.find((p) => p.estado === 'pendiente')).toMatchObject({ fecha: '2026-11-10', hora: '19:00' });

    expect(items[0].estado === 'vencido' || items[0].estado === 'fallido').toBe(true);
    expect(resumen).toMatchObject({ cobros_pendientes: 1, importe_pendiente_eur: 150, mensajes_sin_leer: 1, publicaciones_fallidas: 1, tareas_vencidas: 1 });
  });

  it('never leaks personal data, free text or Drive file ids', async () => {
    const { buildHubFeed } = await import('@/lib/hub/pendientes');
    const json = JSON.stringify(buildHubFeed(fixture(), NOW, 'https://ezy.example'));
    for (const forbidden of [FILE, 'nota privada', 'texto libre', 'concepto con datos privados', 'caption privada', 'bizum', '@gmail', 'token']) {
      expect(json).not.toContain(forbidden);
    }
    // Folder ids only inside dashboard URLs, never in ids or text fields
    const feed = JSON.parse(json);
    for (const item of feed.items) {
      for (const [k, v] of Object.entries(item)) {
        if (k !== 'url' && typeof v === 'string') expect(v).not.toContain(ARTIST);
      }
    }
  });

  it('keeps ids stable between runs', async () => {
    const { buildHubFeed } = await import('@/lib/hub/pendientes');
    const a = buildHubFeed(fixture(), NOW, 'https://ezy.example').items.map((i) => i.id).sort();
    const b = buildHubFeed(fixture(), new Date('2026-11-09T08:00:00Z'), 'https://ezy.example').items.map((i) => i.id);
    expect(new Set(a).size).toBe(a.length);
    for (const id of b) expect(a).toContain(id);
  });
});

describe('GET /api/hub/v1/pendientes', () => {
  const original = process.env.HUB_TOKEN;
  beforeEach(async () => {
    snapshot.current = fixture();
    (await import('@/lib/hub/feed')).resetHubFeedCache();
  });
  afterEach(() => {
    if (original === undefined) delete process.env.HUB_TOKEN;
    else process.env.HUB_TOKEN = original;
  });

  const call = async (auth?: string) => {
    const { GET } = await import('@/app/api/hub/v1/pendientes/route');
    return GET(new Request('https://ezy.example/api/hub/v1/pendientes', { headers: auth ? { authorization: auth } : {} }));
  };

  it('is closed (503) without HUB_TOKEN', async () => {
    delete process.env.HUB_TOKEN;
    const res = await call('Bearer anything');
    expect(res.status).toBe(503);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('rejects a missing or wrong key (401)', async () => {
    process.env.HUB_TOKEN = 'hub-secret-for-tests';
    expect((await call()).status).toBe(401);
    expect((await call('Bearer wrong')).status).toBe(401);
    expect((await call('hub-secret-for-tests')).status).toBe(401); // without "Bearer "
    expect((await call('Basic hub-secret-for-tests')).status).toBe(401);
  });

  it('answers the feed with the right key, never cached', async () => {
    process.env.HUB_TOKEN = 'hub-secret-for-tests';
    const res = await call('Bearer hub-secret-for-tests');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body).toMatchObject({ fuente: 'ezy', version: 1 });
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);
  });
});
