/*
 * Ezy service worker: a per-device cache for audio, fed by fixed-size chunks.
 *
 * Why it exists: playing a track through /api/audio/[fileId] is billed as
 * "Fast Origin Transfer" (10 GB/month on Hobby), and a plain open-ended
 * `Range: bytes=0-` request is the worst case for it:
 *  - Vercel's CDN never caches a request that carries a `Range` header.
 *  - The function pushes the file to the CDN faster than the player reads it,
 *    so a skipped or paused track is still paid for. The dashboard showed more
 *    origin transfer (24 GB) than was ever delivered to browsers (18.7 GB).
 *
 * What it does: <audio> keeps asking for ranges as usual, but this worker answers
 * them from 4 MiB chunks, loaded only when the player gets that far:
 *  - A chunk request has no Range header, so the CDN can cache it for every device.
 *  - Each chunk is kept in Cache Storage, so half-heard tracks are not lost and
 *    every later play or seek over them never leaves the device.
 *
 * Safety rules (playback must never break because of this file):
 *  - Only GET /api/audio/<id> is touched. Everything else goes to the network
 *    exactly as if there were no service worker.
 *  - Chunks are keyed by the file's md5 (from /api/audio/<id>/meta), so
 *    overwriting a file in Drive can never play old or mixed audio.
 *  - Anything unexpected before the first byte falls back to the original
 *    request, which the route still answers with plain ranges.
 *
 * To switch it off for everyone, replace this file with one that calls
 * self.registration.unregister() and deletes the caches.
 */

const CACHE = 'ezy-audio-v2';
const CHUNK_BYTES = 4 * 1024 * 1024; // keep in sync with src/app/api/audio/[fileId]/route.ts
const TAIL_BYTES = 256 * 1024; // keep in sync with src/app/api/audio/[fileId]/route.ts
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024; // ~1 GB per device, least recently used evicted first
const META_TTL_MS = 60 * 1000; // one track's range requests share a single metadata lookup
const EVICT_EVERY = 16; // chunks stored between eviction passes
const AUDIO_PATH = /^\/api\/audio\/[A-Za-z0-9_-]{10,}$/;

const metaMemo = new Map();
const inFlight = new Map();
let storedSinceEvict = 0;

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
  if (request.method !== 'GET' || request.destination === 'image') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !AUDIO_PATH.test(url.pathname)) return;
  if (url.searchParams.get('type') === 'image') return;

  event.respondWith(handleAudio(request, url).catch(() => fetch(request).then(rebuild)));
});

// Audio responses must all be built by the worker: Chrome aborts a media element
// ("FFmpegDemuxer: data source error") when the range requests for one file mix
// responses built here with passthrough ones (WAVs that probe the end of the file).
function rebuild(res) {
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

async function handleAudio(request, url) {
  const cache = await caches.open(CACHE);
  const meta = await getMeta(cache, url.pathname);
  if (!meta) throw new Error('not chunkable');

  const span = parseRange(request.headers.get('range'), meta.size);
  if (!span) throw new Error('unsupported range');

  const base = {
    'Content-Type': meta.mimeType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  };
  if (span.unsatisfiable) {
    return new Response(null, { status: 416, headers: { ...base, 'Content-Range': `bytes */${meta.size}` } });
  }

  const { start, end } = span;
  // Awaited here so that a failure can still fall back to the plain route.
  const firstSlot = locate(start, meta);
  let pending = await readAt(getChunk(cache, url.pathname, meta, firstSlot), firstSlot.offset);
  let pos = start;

  const body = new ReadableStream({
    async pull(controller) {
      try {
        const bytes = pending || await readWithRetries(cache, url.pathname, meta, pos);
        pending = null;
        const part = bytes.subarray(0, Math.min(end + 1 - pos, locate(pos, meta).bytesLeft));
        pos += part.byteLength;
        controller.enqueue(part);
        if (pos > end) controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  if (!request.headers.get('range')) {
    return new Response(body, { status: 200, headers: { ...base, 'Content-Length': String(meta.size) } });
  }
  return new Response(body, {
    status: 206,
    headers: {
      ...base,
      'Content-Range': `bytes ${start}-${end}/${meta.size}`,
      'Content-Length': String(end - start + 1),
    },
  });
}

// { start, end } in bytes, { unsatisfiable: true }, or null for odd/multi ranges.
function parseRange(header, size) {
  if (!header) return { start: 0, end: size - 1 };
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;

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
  return start >= size || start > end ? { unsatisfiable: true } : { start, end };
}

/* ---------- file metadata ---------- */

// { size, mimeType, rev } when the file can be served in chunks, else null. The last
// answer is kept in the cache so that tracks already on the device replay offline.
async function getMeta(cache, pathname) {
  const memo = metaMemo.get(pathname);
  if (memo && Date.now() - memo.at < META_TTL_MS) return memo.meta;

  const key = `${self.location.origin}${pathname}/meta`;
  let res;
  try {
    res = await fetch(key);
  } catch {
    const stored = await cache.match(key);
    return stored ? stored.json() : null;
  }

  const meta = res.ok ? await res.json() : null;
  const usable =
    meta && meta.rev && meta.size > 0 && !/^(image|text)\/|json/.test(meta.mimeType || '') ? meta : null;
  if (usable) await cache.put(key, new Response(JSON.stringify(usable))).catch(() => {});
  else await cache.delete(key);
  metaMemo.set(pathname, { meta: usable, at: Date.now() });
  return usable;
}

/* ---------- chunks ---------- */

// Which chunk holds a byte. Chrome reads the very end of a WAV before it starts
// playing, so the end of the file gets a small chunk of its own: found at the end
// of a 4 MiB one, those bytes would be the last to arrive and delay the first sound.
function locate(pos, meta) {
  const tailStart = Math.max(0, meta.size - TAIL_BYTES);
  if (pos >= tailStart) {
    return { id: 'tail', length: meta.size - tailStart, offset: pos - tailStart, bytesLeft: meta.size - pos };
  }
  const index = Math.floor(pos / CHUNK_BYTES);
  return {
    id: index,
    length: Math.min(CHUNK_BYTES, meta.size - index * CHUNK_BYTES),
    offset: pos - index * CHUNK_BYTES,
    bytesLeft: Math.min((index + 1) * CHUNK_BYTES, tailStart) - pos,
  };
}

// A chunk being loaded. Its bytes go out as they arrive, so a new track starts
// sounding without waiting for the whole chunk, and once started it is always
// finished and stored: skipping a track wastes nothing already paid for.
function getChunk(cache, pathname, meta, slot) {
  const key = `${self.location.origin}${pathname}?chunk=${slot.id}&rev=${meta.rev}`;
  // The player often asks for the same bytes twice in a row: never pay for them twice.
  let job = inFlight.get(key);
  if (!job) {
    job = { parts: [], finished: false, error: null, waiters: [] };
    inFlight.set(key, job);
    loadChunk(cache, key, slot.length, job)
      .catch((err) => { job.error = err; })
      .finally(() => {
        job.finished = true;
        inFlight.delete(key);
        wake(job);
      });
  }
  return job;
}

function wake(job) {
  job.waiters.splice(0).forEach((resolve) => resolve());
}

// The next available bytes of a chunk from `offset` on, waiting for them if needed.
async function readAt(job, offset) {
  for (;;) {
    let seen = 0;
    for (const part of job.parts) {
      if (offset < seen + part.byteLength) return part.subarray(offset - seen);
      seen += part.byteLength;
    }
    if (job.error) throw job.error;
    if (job.finished) throw new Error('chunk ended early');
    await new Promise((resolve) => job.waiters.push(resolve));
  }
}

async function readWithRetries(cache, pathname, meta, pos) {
  for (let attempt = 0; ; attempt++) {
    try {
      const slot = locate(pos, meta);
      return await readAt(getChunk(cache, pathname, meta, slot), slot.offset);
    } catch (err) {
      if (attempt >= 2) throw err;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
}

async function loadChunk(cache, key, length, job) {
  const hit = await cache.match(key);
  if (hit) {
    const buf = await hit.arrayBuffer();
    job.parts.push(new Uint8Array(buf));
    touch(cache, key, hit, buf);
    return;
  }

  const res = await fetch(key, { redirect: 'error' });
  if (!res.ok) throw new Error(`chunk HTTP ${res.status}`);
  const reader = res.body.getReader();
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    job.parts.push(value);
    received += value.byteLength;
    wake(job);
  }
  if (received !== length) {
    throw new Error('chunk of unexpected size');
  }
  await store(cache, key, new Blob(job.parts), received);
}

// Refresh the LRU timestamp at most once a day so popular tracks stay put.
function touch(cache, key, hit, buf) {
  const last = Number(hit.headers.get('x-ezy-used-at') || 0);
  if (Date.now() - last < 24 * 60 * 60 * 1000) return;
  const headers = new Headers(hit.headers);
  headers.set('x-ezy-used-at', String(Date.now()));
  cache.put(key, new Response(buf, { status: 200, headers })).catch(() => {});
}

async function store(cache, key, blob, size) {
  try {
    await cache.put(key, new Response(blob, {
      status: 200,
      headers: { 'Content-Length': String(size), 'x-ezy-used-at': String(Date.now()) },
    }));
    storedSinceEvict += 1;
    if (storedSinceEvict >= EVICT_EVERY) {
      storedSinceEvict = 0;
      await evict(cache);
    }
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
    const used = Number(res.headers.get('x-ezy-used-at') || 0);
    if (!size) continue; // metadata entries
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
