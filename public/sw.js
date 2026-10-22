/*
 * Ezy service worker: a per-device cache for audio.
 *
 * Why it exists: every play of a track used to stream the whole file through
 * /api/audio/[fileId], i.e. through a Vercel Function. That is billed as
 * "Fast Origin Transfer" (10 GB/month on Hobby) and the CDN cannot help:
 * Vercel never caches a request that carries a `Range` header, and <audio>
 * always sends one. Producers and artists replay the same beats over and over,
 * so each replay was paid for again.
 *
 * What it does: the first time a track is played to the end of its download,
 * the bytes the page was already receiving are also kept in Cache Storage.
 * Every later play — seeks included — is answered here, with proper 206
 * responses, and never reaches Vercel.
 *
 * Safety rules (playback must never break because of this file):
 *  - Only GET /api/audio/<id> is touched. Everything else goes to the network
 *    exactly as if there were no service worker.
 *  - A miss is the original request, sent unchanged. We only copy the bytes the
 *    page reads; we never download anything extra, and if the page stops
 *    reading (skip, seek, close) the copy is simply dropped.
 *  - Any error falls back to a plain network fetch.
 *
 * To switch it off for everyone, replace this file with one that calls
 * self.registration.unregister() and deletes the caches.
 */

const CACHE = 'ezy-audio-v1';
const MAX_ENTRY_BYTES = 200 * 1024 * 1024; // longer files just stream, uncached
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024; // ~1 GB per device, oldest evicted first
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // re-validate a file after 30 days
const AUDIO_PATH = /^\/api\/audio\/[A-Za-z0-9_-]{10,}$/;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('ezy-audio-') && n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !AUDIO_PATH.test(url.pathname)) return;
  if (url.searchParams.get('type') === 'image') return;

  event.respondWith(handleAudio(event, request, url).catch(() => fetch(request)));
});

function cacheKey(url) {
  // Keep the version token: bumping it in src/lib/audioUrl.ts must also
  // skip anything stored here.
  const v = url.searchParams.get('v');
  return `${url.origin}${url.pathname}${v ? `?v=${v}` : ''}`;
}

async function handleAudio(event, request, url) {
  const key = cacheKey(url);
  const cache = await caches.open(CACHE);
  const hit = await cache.match(key);

  if (hit) {
    const cachedAt = Number(hit.headers.get('x-ezy-cached-at') || 0);
    if (Date.now() - cachedAt < MAX_AGE_MS) {
      const res = await fromCache(hit, request.headers.get('range'));
      if (res) {
        touch(cache, key, hit);
        return res;
      }
    } else {
      event.waitUntil(cache.delete(key));
    }
  }

  const network = await fetch(request);
  return teeIntoCache(event, network, cache, key);
}

/* ---------- serving from the cache ---------- */

async function fromCache(hit, rangeHeader) {
  const blob = await hit.blob();
  const size = blob.size;
  const type = hit.headers.get('content-type') || 'audio/mpeg';
  const base = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'X-Ezy-Cache': 'HIT',
  };

  if (!rangeHeader) {
    return new Response(blob, { status: 200, headers: { ...base, 'Content-Length': String(size) } });
  }

  const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null; // odd/multi range: let the network handle it

  let start;
  let end;
  if (m[1] === '') {
    // suffix range: last N bytes
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }

  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { ...base, 'Content-Range': `bytes */${size}` } });
  }

  return new Response(blob.slice(start, end + 1, type), {
    status: 206,
    headers: {
      ...base,
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
    },
  });
}

// Refresh the LRU timestamp at most once a day so popular tracks stay put.
function touch(cache, key, hit) {
  const last = Number(hit.headers.get('x-ezy-used-at') || 0);
  if (Date.now() - last < 24 * 60 * 60 * 1000) return;
  hit.clone().blob().then((blob) => {
    const headers = new Headers(hit.headers);
    headers.set('x-ezy-used-at', String(Date.now()));
    return cache.put(key, new Response(blob, { status: 200, headers }));
  }).catch(() => {});
}

/* ---------- filling the cache on a miss ---------- */

// Size of the whole file if this response carries all of it, else -1.
function wholeFileSize(res) {
  if (res.status === 200) {
    const len = Number(res.headers.get('content-length'));
    return Number.isFinite(len) && len > 0 ? len : -1;
  }
  if (res.status === 206) {
    const m = /^bytes 0-(\d+)\/(\d+)$/.exec((res.headers.get('content-range') || '').trim());
    if (m && Number(m[1]) + 1 === Number(m[2])) return Number(m[2]);
  }
  return -1;
}

function teeIntoCache(event, res, cache, key) {
  const type = res.headers.get('content-type') || '';
  const size = wholeFileSize(res);
  const cacheable =
    res.body &&
    size > 0 &&
    size <= MAX_ENTRY_BYTES &&
    !type.startsWith('text/') &&
    !type.includes('json') &&
    !type.startsWith('image/');
  if (!cacheable) return res;

  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  let settle;
  // Lets the final cache.put() finish even if the page goes idle right after
  // the last byte. Always settles (end, cancel or error), and after 4 minutes
  // at most: browsers kill a worker whose event is extended for more than 5,
  // which would cut a long, paused stream. Past that the copy is best-effort.
  event.waitUntil(new Promise((r) => { settle = r; setTimeout(r, 4 * 60 * 1000); }));

  const body = new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          if (received === size) {
            await store(cache, key, new Blob(chunks, { type }), type);
          }
          chunks.length = 0;
          settle();
          return;
        }
        chunks.push(value);
        received += value.byteLength;
        controller.enqueue(value);
      } catch (err) {
        chunks.length = 0;
        settle();
        controller.error(err);
      }
    },
    cancel(reason) {
      chunks.length = 0;
      settle();
      return reader.cancel(reason);
    },
  });

  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

async function store(cache, key, blob, type) {
  try {
    const now = String(Date.now());
    await cache.put(key, new Response(blob, {
      status: 200,
      headers: {
        'Content-Type': type,
        'Content-Length': String(blob.size),
        'x-ezy-cached-at': now,
        'x-ezy-used-at': now,
      },
    }));
    await evict(cache);
  } catch {
    // Quota exceeded or storage unavailable: playback already worked, nothing else to do.
  }
}

async function evict(cache) {
  const keys = await cache.keys();
  const entries = [];
  let total = 0;
  for (const req of keys) {
    const res = await cache.match(req);
    if (!res) continue;
    const size = Number(res.headers.get('content-length') || 0);
    const used = Number(res.headers.get('x-ezy-used-at') || res.headers.get('x-ezy-cached-at') || 0);
    entries.push({ req, size, used });
    total += size;
  }

  let budget = MAX_TOTAL_BYTES;
  try {
    const { quota } = await self.navigator.storage.estimate();
    if (quota) budget = Math.min(budget, quota * 0.5);
  } catch { /* keep the default */ }

  entries.sort((a, b) => a.used - b.used);
  for (const e of entries) {
    if (total <= budget) break;
    await cache.delete(e.req);
    total -= e.size;
  }
}
