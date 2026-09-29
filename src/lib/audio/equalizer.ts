/**
 * Personal 6-band equalizer modelled on Spotify's in-app EQ.
 *
 * Spotify exposes six fixed points — 60 Hz, 150 Hz, 400 Hz, 1 kHz, 2.4 kHz and
 * 15 kHz — each adjustable within ±12 dB, drawn as a straight-line curve. The
 * exact filter topology Spotify uses isn't published, so each point is
 * rendered here as a peaking (bell) filter centred on that frequency, with a
 * bandwidth derived from the spacing to its neighbours so adjacent bells meet
 * roughly at their half-gain points (the classic graphic-EQ layout). Using
 * bells rather than shelves means the gain you set on a point is the gain you
 * actually get at that frequency, which is what Spotify's UI promises.
 *
 * Settings live in localStorage, so they stick per device/browser — set it
 * once on the phone and every visit from that phone plays through the same EQ.
 *
 * Routing a media element through Web Audio is a one-way door
 * (createMediaElementSource can only be called once per element, and the
 * element then plays *only* through the graph). So elements are left on the
 * browser's native path until the EQ is actually switched on; after that,
 * "off" simply flattens every band instead of tearing the graph down.
 */

export const EQ_BANDS = [
  { freq: 60, label: '60Hz' },
  { freq: 150, label: '150Hz' },
  { freq: 400, label: '400Hz' },
  { freq: 1000, label: '1KHz' },
  { freq: 2400, label: '2.4KHz' },
  { freq: 15000, label: '15KHz' },
] as const;

export const EQ_MIN_DB = -12;
export const EQ_MAX_DB = 12;
export const EQ_BAND_COUNT = EQ_BANDS.length;

export interface EqSettings {
  enabled: boolean;
  /** One gain per band, in dB, clamped to ±12. */
  gains: number[];
  /** Gain applied before the filters, in dB (≤ 0). Headroom for big boosts. */
  preamp: number;
  /** Brick-wall-ish limiter after the filters so boosts don't clip. */
  limiter: boolean;
}

export interface EqPreset {
  id: string;
  name: string;
  gains: number[];
}

/**
 * "Mi Spotify" is read off the screenshot of the user's own Spotify EQ
 * (grid runs from +12 dB at the top to −12 dB at the bottom, 0 dB in the
 * middle): a V-curve with a strong sub-bass lift and a treble lift.
 */
export const EQ_PRESETS: EqPreset[] = [
  { id: 'mine', name: 'Mi Spotify', gains: [9, 0.5, -2, -2, 0, 7] },
  { id: 'flat', name: 'Plano', gains: [0, 0, 0, 0, 0, 0] },
  { id: 'bass', name: 'Más graves', gains: [6, 4, 1, 0, 0, 0] },
  { id: 'bass-cut', name: 'Menos graves', gains: [-6, -4, -1, 0, 0, 0] },
  { id: 'treble', name: 'Más agudos', gains: [0, 0, 0, 1, 4, 6] },
  { id: 'treble-cut', name: 'Menos agudos', gains: [0, 0, 0, -1, -4, -6] },
  { id: 'vocal', name: 'Voces', gains: [-2, -1, 1, 3, 3, 1] },
  { id: 'loudness', name: 'Loudness', gains: [6, 3, -1, -1, 2, 5] },
  { id: 'small', name: 'Altavoces pequeños', gains: [4, 3, 1, 0, -1, -2] },
];

const STORAGE_KEY = 'ezy.equalizer.v1';

export const DEFAULT_EQ: EqSettings = {
  enabled: false,
  gains: [...EQ_PRESETS[0].gains],
  preamp: 0,
  limiter: true,
};

/**
 * Bandwidth of each bell, in octaves: the geometric distance to the nearer
 * neighbour. The two edge bands are wider (only one neighbour, and the
 * 2.4 k→15 k gap is 2.6 octaves) so they behave more like the shelves
 * Spotify's curve visually implies at the ends.
 */
function bandwidthOctaves(i: number): number {
  const f = EQ_BANDS[i].freq;
  const prev = i > 0 ? Math.log2(f / EQ_BANDS[i - 1].freq) : Infinity;
  const next = i < EQ_BAND_COUNT - 1 ? Math.log2(EQ_BANDS[i + 1].freq / f) : Infinity;
  if (i === 0) return Math.max(1.6, next);
  if (i === EQ_BAND_COUNT - 1) return Math.min(2.6, prev);
  return Math.min(prev, next);
}

/** Q for a given bandwidth in octaves (RBJ cookbook relation). */
function qFromOctaves(n: number): number {
  const p = Math.pow(2, n);
  return Math.sqrt(p) / (p - 1);
}

export const EQ_Q = EQ_BANDS.map((_, i) => qFromOctaves(bandwidthOctaves(i)));

const clampDb = (v: number) => Math.min(EQ_MAX_DB, Math.max(EQ_MIN_DB, Math.round(v * 10) / 10));

function sanitize(raw: unknown): EqSettings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<EqSettings>;
  const gains = Array.isArray(s.gains) && s.gains.length === EQ_BAND_COUNT
    ? s.gains.map(g => (typeof g === 'number' && isFinite(g) ? clampDb(g) : 0))
    : [...DEFAULT_EQ.gains];
  const preamp = typeof s.preamp === 'number' && isFinite(s.preamp) ? Math.min(0, Math.max(-12, s.preamp)) : DEFAULT_EQ.preamp;
  return {
    enabled: typeof s.enabled === 'boolean' ? s.enabled : DEFAULT_EQ.enabled,
    gains,
    preamp,
    limiter: typeof s.limiter === 'boolean' ? s.limiter : DEFAULT_EQ.limiter,
  };
}

// ── Settings store ──────────────────────────────────────────────────────────

let settings: EqSettings = DEFAULT_EQ;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) settings = sanitize(JSON.parse(raw));
  } catch { /* storage blocked or corrupt: keep defaults */ }

  // Keep other tabs of the same device in sync
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      settings = sanitize(JSON.parse(e.newValue));
      applyAll();
      listeners.forEach(l => l());
    } catch { /* ignore */ }
  });
}

export function getEqSettings(): EqSettings {
  load();
  return settings;
}

export function getServerEqSettings(): EqSettings {
  return DEFAULT_EQ;
}

export function subscribeEq(listener: () => void): () => void {
  load();
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function updateEq(patch: Partial<EqSettings>) {
  load();
  settings = sanitize({ ...settings, ...patch });
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch { /* storage full/blocked: still applies for this session */ }
  if (settings.enabled) {
    // Toggling on / editing happens from a tap, which is exactly when mobile
    // browsers let us create or resume the AudioContext.
    ensureContext();
    boundElements.forEach(el => { if (!el.paused) attach(el); });
  }
  applyAll();
  listeners.forEach(l => l());
}

export function setBandGain(index: number, db: number) {
  const gains = [...getEqSettings().gains];
  gains[index] = clampDb(db);
  updateEq({ gains });
}

// ── Audio graph ─────────────────────────────────────────────────────────────

interface Chain {
  source: MediaElementAudioSourceNode;
  preamp: GainNode;
  filters: BiquadFilterNode[];
  limiter: DynamicsCompressorNode;
  output: GainNode;
}

let ctx: AudioContext | null = null;
const chains = new WeakMap<HTMLMediaElement, Chain>();
const boundElements = new Set<HTMLMediaElement>();

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor({ latencyHint: 'playback' });
    } catch {
      return null;
    }
  }
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  return ctx;
}

const dbToGain = (db: number) => Math.pow(10, db / 20);

function attach(el: HTMLMediaElement): Chain | null {
  const existing = chains.get(el);
  if (existing) return existing;
  const ac = ensureContext();
  if (!ac) return null;

  let source: MediaElementAudioSourceNode;
  try {
    source = ac.createMediaElementSource(el);
  } catch (e) {
    console.warn('[EQ] could not route element through Web Audio:', e);
    return null;
  }

  const preamp = ac.createGain();
  const filters = EQ_BANDS.map((band, i) => {
    const f = ac.createBiquadFilter();
    f.type = 'peaking';
    f.frequency.value = band.freq;
    f.Q.value = EQ_Q[i];
    f.gain.value = 0;
    return f;
  });
  const limiter = ac.createDynamicsCompressor();
  const output = ac.createGain();

  source.connect(preamp);
  let node: AudioNode = preamp;
  for (const f of filters) { node.connect(f); node = f; }
  node.connect(limiter);
  limiter.connect(output);
  output.connect(ac.destination);

  const chain: Chain = { source, preamp, filters, limiter, output };
  chains.set(el, chain);
  apply(chain, false);
  return chain;
}

function apply(chain: Chain, smooth = true) {
  if (!ctx) return;
  const on = settings.enabled;
  const t = ctx.currentTime;
  // Short ramps avoid zipper noise while dragging a point
  const set = (p: AudioParam, v: number) => {
    if (smooth) p.setTargetAtTime(v, t, 0.015);
    else p.value = v;
  };

  const filterGains = solveFilterGains(settings.gains);
  chain.filters.forEach((f, i) => set(f.gain, on ? filterGains[i] : 0));
  set(chain.preamp.gain, on ? dbToGain(settings.preamp) : 1);

  const lim = chain.limiter;
  if (on && settings.limiter) {
    // Fast, hard-knee, high-ratio: only catches the peaks the boosts push past 0 dBFS
    lim.threshold.value = -1;
    lim.knee.value = 0;
    lim.ratio.value = 20;
    lim.attack.value = 0.002;
    lim.release.value = 0.12;
  } else {
    // Effectively transparent
    lim.threshold.value = 0;
    lim.knee.value = 0;
    lim.ratio.value = 1;
  }
}

function applyAll() {
  boundElements.forEach(el => {
    const chain = chains.get(el);
    if (chain) apply(chain);
  });
}

let gestureUnlockInstalled = false;
/**
 * iOS/Android only start an AudioContext inside a user gesture, and the
 * element's `play` event fires too late to count. Resuming on every tap keeps
 * the context alive (also after a phone call or Siri suspends it).
 */
function installGestureUnlock() {
  if (gestureUnlockInstalled || typeof window === 'undefined') return;
  gestureUnlockInstalled = true;
  const unlock = () => {
    if (!getEqSettings().enabled) return;
    ensureContext();
  };
  for (const type of ['pointerdown', 'touchend', 'keydown'] as const) {
    window.addEventListener(type, unlock, { capture: true, passive: true });
  }
}

/**
 * Registers a media element with the equalizer. Safe to call repeatedly.
 * The element stays on the native audio path until the EQ is enabled and it
 * starts playing. Returns a cleanup that stops tracking the element.
 */
export function bindEqualizer(el: HTMLMediaElement | null | undefined): () => void {
  if (!el || typeof window === 'undefined') return () => {};
  load();
  installGestureUnlock();
  boundElements.add(el);

  const onPlay = () => {
    if (!getEqSettings().enabled) return;
    attach(el);
    if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
  };
  el.addEventListener('play', onPlay);
  if (!el.paused) onPlay();

  return () => {
    el.removeEventListener('play', onPlay);
    // Its chain (if any) lives in a WeakMap and goes away with the element
    boundElements.delete(el);
  };
}

// ── Frequency response ──────────────────────────────────────────────────────

let solvedKey = '';
let solvedGains: number[] = [];

/**
 * Neighbouring bells overlap, so naively setting each filter to its slider
 * value overshoots: +9 dB at 60 Hz alone lifts 150 Hz by ~2 dB. This solves
 * for the per-filter gains whose *combined* response lands exactly on every
 * point you set (fixed-point iteration; the interaction matrix is diagonally
 * dominant so it converges in a handful of steps).
 */
export function solveFilterGains(targets: number[]): number[] {
  const key = targets.join(',');
  if (key === solvedKey) return solvedGains;
  const x = [...targets];
  for (let iter = 0; iter < 40; iter++) {
    let maxErr = 0;
    const err = EQ_BANDS.map((b, i) => targets[i] - eqResponseDb(x, b.freq));
    for (let i = 0; i < EQ_BAND_COUNT; i++) {
      x[i] = Math.min(24, Math.max(-24, x[i] + 0.9 * err[i]));
      maxErr = Math.max(maxErr, Math.abs(err[i]));
    }
    if (maxErr < 0.01) break;
  }
  solvedKey = key;
  solvedGains = x;
  return x;
}

/** What you actually hear at `freq` for the given point values (dB). */
export function eqCurveDb(targets: number[], freq: number): number {
  return eqResponseDb(solveFilterGains(targets), freq);
}

/**
 * Magnitude (dB) of the filter bank at `freq` for raw per-filter gains,
 * computed with the RBJ peaking formulas — the same ones Web Audio's
 * BiquadFilterNode uses (verified to match getFrequencyResponse).
 */
export function eqResponseDb(gains: number[], freq: number, sampleRate = 48000): number {
  const w = (2 * Math.PI * freq) / sampleRate;
  const cosw = Math.cos(w);
  const cos2w = Math.cos(2 * w);
  let total = 0;
  for (let i = 0; i < EQ_BAND_COUNT; i++) {
    const g = gains[i];
    if (!g) continue;
    const A = Math.pow(10, g / 40);
    const w0 = (2 * Math.PI * EQ_BANDS[i].freq) / sampleRate;
    const alpha = Math.sin(w0) / (2 * EQ_Q[i]);
    const c0 = Math.cos(w0);
    const b0 = 1 + alpha * A, b1 = -2 * c0, b2 = 1 - alpha * A;
    const a0 = 1 + alpha / A, a1 = -2 * c0, a2 = 1 - alpha / A;
    // |H(e^jw)|² for a biquad
    const num = b0 * b0 + b1 * b1 + b2 * b2 + 2 * (b0 * b1 + b1 * b2) * cosw + 2 * b0 * b2 * cos2w;
    const den = a0 * a0 + a1 * a1 + a2 * a2 + 2 * (a0 * a1 + a1 * a2) * cosw + 2 * a0 * a2 * cos2w;
    total += 10 * Math.log10(num / den);
  }
  return total;
}
