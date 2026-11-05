'use client';

// Preparación de medios para Instagram en el navegador. Nada pesado pasa por Vercel:
//  · Imágenes: se recortan o encajan a la proporción elegida y salen en JPEG (lo que pide Meta).
//  · Vídeos: se suben tal cual si Instagram los acepta; si son 4K, pesan demasiado o no son MP4/MOV,
//    se optimizan a MP4 H.264 + AAC con WebCodecs (mediabunny).
//  · Reels con tu música: una imagen + un tramo de una pista → MP4 9:16 con una onda animada.

import { STORY_VIDEO_MAX_BYTES, VIDEO_MAX_SIDE, REEL_MAX_BYTES } from './limits';

export type AspectId = '4:5' | '1:1' | '1.91:1' | '9:16' | 'original';
export type FitMode = 'cover' | 'blur' | 'black' | 'white';

export const ASPECTS: Record<Exclude<AspectId, 'original'>, number> = {
  '4:5': 4 / 5,
  '1:1': 1,
  '1.91:1': 1.91,
  '9:16': 9 / 16,
};

export function isVideoFile(f: { type?: string; name?: string }) {
  return /^video\//.test(f.type || '') || /\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(f.name || '');
}
export function isImageFile(f: { type?: string; name?: string }) {
  return /^image\//.test(f.type || '') || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name || '');
}
export function isAudioFile(f: { type?: string; name?: string }) {
  return /^audio\//.test(f.type || '') || /\.(mp3|wav|flac|m4a|aac|ogg|aiff?)$/i.test(f.name || '');
}

export function baseName(name: string) {
  return String(name || 'archivo').replace(/\.[a-z0-9]{1,5}$/i, '').trim() || 'archivo';
}

export async function loadBitmap(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob);
  } catch {
    throw new Error('Este navegador no puede abrir esa imagen. Si es HEIC, expórtala antes a JPEG.');
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('No se pudo procesar la imagen'))), type, quality)
  );
}

/** Proporción efectiva (Original se ajusta al rango permitido del feed) */
export function resolveRatio(aspect: AspectId, w: number, h: number): number {
  if (aspect !== 'original') return ASPECTS[aspect];
  const r = w / Math.max(1, h);
  return Math.max(4 / 5, Math.min(1.91, r));
}

/** Dibuja la imagen en un lienzo de la proporción indicada */
export function drawFitted(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource & { width: number; height: number },
  W: number,
  H: number,
  fit: FitMode,
  focus = { x: 0.5, y: 0.5 },
  zoom = 1,
) {
  const sw = src.width;
  const sh = src.height;
  const cover = Math.max(W / sw, H / sh) * zoom;
  const contain = Math.min(W / sw, H / sh) * zoom;

  if (fit === 'cover') {
    const dw = sw * cover;
    const dh = sh * cover;
    const dx = (W - dw) * focus.x;
    const dy = (H - dh) * focus.y;
    ctx.drawImage(src, dx, dy, dw, dh);
    return;
  }

  if (fit === 'blur') {
    ctx.save();
    ctx.filter = `blur(${Math.round(Math.max(W, H) / 28)}px) brightness(0.7) saturate(1.2)`;
    const bw = sw * cover * 1.15;
    const bh = sh * cover * 1.15;
    ctx.drawImage(src, (W - bw) / 2, (H - bh) / 2, bw, bh);
    ctx.restore();
  } else {
    ctx.fillStyle = fit === 'white' ? '#ffffff' : '#000000';
    ctx.fillRect(0, 0, W, H);
  }
  const dw = sw * contain;
  const dh = sh * contain;
  ctx.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

export interface RenderOptions {
  aspect: AspectId;
  fit: FitMode;
  focus?: { x: number; y: number };
  /** Ancho final (1080 por defecto; 1440 para el feed queda más nítido) */
  width?: number;
}

export async function renderImage(bitmap: ImageBitmap, opts: RenderOptions): Promise<{ blob: Blob; width: number; height: number }> {
  const ratio = resolveRatio(opts.aspect, bitmap.width, bitmap.height);
  const W = Math.round(opts.width || (ratio < 0.7 ? 1080 : 1440));
  const H = Math.round(W / ratio);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  drawFitted(ctx, bitmap, W, H, opts.fit, opts.focus);
  let blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
  if (blob.size > 7.5 * 1024 * 1024) blob = await canvasToBlob(canvas, 'image/jpeg', 0.8);
  return { blob, width: W, height: H };
}

/** Miniatura pequeña para la vista previa y la agenda */
export async function thumbnailFrom(src: CanvasImageSource & { width: number; height: number }, max = 540): Promise<Blob> {
  const s = Math.min(1, max / Math.max(src.width, src.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(src.width * s));
  canvas.height = Math.max(1, Math.round(src.height * s));
  canvas.getContext('2d')!.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvasToBlob(canvas, 'image/jpeg', 0.8);
}

// ── Vídeo ────────────────────────────────────────────────────────────────────

export interface VideoInfo {
  width: number;
  height: number;
  duration: number;
  thumb?: Blob;
}

export function probeVideo(file: Blob, timeoutMs = 15000): Promise<VideoInfo | null> {
  return new Promise(resolve => {
    let done = false;
    const url = URL.createObjectURL(file);
    const el = document.createElement('video');
    const finish = (r: VideoInfo | null) => {
      if (done) return;
      done = true;
      el.removeAttribute('src');
      try { el.load(); } catch { /* nada */ }
      URL.revokeObjectURL(url);
      resolve(r);
    };
    el.preload = 'auto';
    el.muted = true;
    el.playsInline = true;
    el.onerror = () => finish(null);
    el.onloadedmetadata = () => {
      if (!el.videoWidth) return finish(null);
      el.currentTime = Math.min(1, (el.duration || 2) * 0.1);
    };
    el.onseeked = async () => {
      let thumb: Blob | undefined;
      try {
        const c = document.createElement('canvas');
        c.width = el.videoWidth;
        c.height = el.videoHeight;
        c.getContext('2d')!.drawImage(el, 0, 0);
        thumb = await thumbnailFrom(c);
      } catch { /* sin miniatura */ }
      finish({ width: el.videoWidth, height: el.videoHeight, duration: el.duration || 0, thumb });
    };
    setTimeout(() => finish(null), timeoutMs);
    el.src = url;
  });
}

/** Plan B para vídeos que <video> no abre (p. ej. HEVC en Chrome de Windows) */
async function probeWithMediabunny(file: Blob): Promise<VideoInfo | null> {
  const mb = await import('mediabunny');
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track) return null;
  const duration = await input.computeDuration().catch(() => 0);
  let thumb: Blob | undefined;
  try {
    if (await track.canDecode()) {
      const sink = new mb.CanvasSink(track, { poolSize: 1 });
      const frame = await sink.getCanvas(Math.min(1, duration * 0.1));
      if (frame) thumb = await thumbnailFrom(frame.canvas as HTMLCanvasElement);
    }
  } catch { /* sin miniatura */ }
  return { width: track.displayWidth, height: track.displayHeight, duration, thumb };
}

export async function readVideoInfo(file: Blob): Promise<VideoInfo | null> {
  return (await probeVideo(file)) || (await probeWithMediabunny(file).catch(() => null));
}

export function needsOptimizing(file: File, info: VideoInfo | null, forStory: boolean): string {
  if (!/\.(mp4|mov|m4v)$/i.test(file.name || '') && !/^video\/(mp4|quicktime)$/i.test(file.type || '')) return 'formato';
  if (info && Math.max(info.width, info.height) > VIDEO_MAX_SIDE) return 'resolución';
  if (file.size > (forStory ? STORY_VIDEO_MAX_BYTES : REEL_MAX_BYTES) * 0.95) return 'peso';
  return '';
}

/** Mejor bitrate AAC que admite este equipo (el codificador de Windows llega a 192 kbps en estéreo) */
async function bestAacBitrate(channels: number, sampleRate: number): Promise<number> {
  for (const bitrate of [192_000, 160_000, 128_000, 96_000]) {
    try {
      const r = await AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', numberOfChannels: channels, sampleRate, bitrate });
      if (r.supported) return bitrate;
    } catch { /* probar el siguiente */ }
  }
  return 128_000;
}

export class Cancelled extends Error {
  constructor() { super('Cancelado'); }
}

/** MP4 H.264 + AAC, lado mayor 1920, con la mejor calidad que quepa en el límite */
export async function optimizeVideo(
  file: File,
  info: VideoInfo | null,
  { onProgress, signal, forStory }: { onProgress?: (p: number) => void; signal?: AbortSignal; forStory?: boolean }
): Promise<File> {
  const mb = await import('mediabunny');
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  const target = new mb.BufferTarget();
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const duration = info?.duration || (await input.computeDuration().catch(() => 0)) || 60;
  const budgetBits = (forStory ? STORY_VIDEO_MAX_BYTES : REEL_MAX_BYTES) * 0.88 * 8;
  const audioBitrate = await bestAacBitrate(2, 48000);
  // Calidad alta: hasta 12 Mbps (Instagram recomprime igualmente)
  const bitrate = Math.max(1_500_000, Math.min(12_000_000, Math.floor(budgetBits / duration) - audioBitrate));

  const conversion = await mb.Conversion.init({
    input,
    output,
    tracks: 'primary',
    video: (track: any) => {
      const opts: any = { codec: 'avc', bitrate, forceTranscode: true };
      const w = track.displayWidth;
      const h = track.displayHeight;
      if (Math.max(w, h) > VIDEO_MAX_SIDE) {
        const s = VIDEO_MAX_SIDE / Math.max(w, h);
        opts.width = Math.round((w * s) / 2) * 2;
        opts.height = Math.round((h * s) / 2) * 2;
        opts.fit = 'fill';
      }
      if (track.frameRate && track.frameRate > 60) opts.frameRate = 60;
      return opts;
    },
    audio: () => ({
      codec: 'aac',
      bitrate: audioBitrate,
      numberOfChannels: 2,
      sampleRate: 48000,
    }),
    showWarnings: false,
  } as any);
  if (!conversion.isValid) throw new Error('Este navegador no puede optimizar el vídeo. Prueba con Chrome actualizado.');
  const onAbort = () => { conversion.cancel().catch(() => {}); };
  signal?.addEventListener('abort', onAbort, { once: true });
  conversion.onProgress = (p: number) => onProgress?.(Math.max(0, Math.min(1, p)));
  try {
    await conversion.execute();
  } catch (err) {
    if (signal?.aborted) throw new Cancelled();
    throw err;
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
  return new File([target.buffer!], `${baseName(file.name)}.mp4`, { type: 'video/mp4' });
}

// ── Reel con tu música ───────────────────────────────────────────────────────

export type MusicReelStyle = 'wave' | 'bars' | 'minimal';

export interface MusicReelOptions {
  image: ImageBitmap;
  audio: AudioBuffer;
  start: number;
  duration: number;
  title?: string;
  subtitle?: string;
  style: MusicReelStyle;
  fit: FitMode;
  /** Fundido de entrada/salida del audio, en segundos */
  fade?: number;
  onProgress?: (p: number) => void;
  signal?: AbortSignal;
}

export async function decodeAudio(blob: Blob): Promise<AudioBuffer> {
  const buf = await blob.arrayBuffer();
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  try {
    return await ctx.decodeAudioData(buf);
  } catch {
    throw new Error('No se pudo leer el audio. Prueba con un WAV o MP3.');
  } finally {
    ctx.close().catch(() => {});
  }
}

/** Niveles del audio por fotograma (0..1) para animar la onda */
function levelsPerFrame(audio: AudioBuffer, start: number, duration: number, fps: number, bands: number): Float32Array[] {
  const sr = audio.sampleRate;
  const ch = audio.getChannelData(0);
  const ch2 = audio.numberOfChannels > 1 ? audio.getChannelData(1) : ch;
  const frames = Math.ceil(duration * fps);
  const out: Float32Array[] = [];
  const win = Math.floor(sr / fps);
  let peak = 0.0001;
  for (let f = 0; f < frames; f++) {
    const s0 = Math.floor((start + f / fps) * sr);
    const row = new Float32Array(bands);
    const step = Math.max(1, Math.floor(win / bands));
    for (let b = 0; b < bands; b++) {
      let sum = 0;
      const a = s0 + b * step;
      for (let i = 0; i < step; i += 2) {
        const v = ((ch[a + i] || 0) + (ch2[a + i] || 0)) / 2;
        sum += v * v;
      }
      row[b] = Math.sqrt(sum / (step / 2));
      peak = Math.max(peak, row[b]);
    }
    out.push(row);
  }
  for (const row of out) for (let b = 0; b < bands; b++) row[b] = Math.min(1, row[b] / peak);
  return out;
}

function sliceAudio(audio: AudioBuffer, start: number, duration: number, fade: number): AudioBuffer {
  const sr = audio.sampleRate;
  const len = Math.floor(duration * sr);
  // Siempre estéreo: es lo que mejor admiten los codificadores AAC del navegador
  const channels = 2;
  const out = new AudioBuffer({ length: len, numberOfChannels: channels, sampleRate: sr });
  const s0 = Math.floor(start * sr);
  const fadeLen = Math.floor(fade * sr);
  for (let c = 0; c < channels; c++) {
    const src = audio.getChannelData(Math.min(c, audio.numberOfChannels - 1));
    const dst = out.getChannelData(c);
    for (let i = 0; i < len; i++) {
      let g = 1;
      if (fadeLen > 0) {
        if (i < fadeLen) g = i / fadeLen;
        else if (i > len - fadeLen) g = (len - i) / fadeLen;
      }
      dst[i] = (src[s0 + i] || 0) * g;
    }
  }
  return out;
}

export function drawMusicFrame(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  opts: Pick<MusicReelOptions, 'image' | 'title' | 'subtitle' | 'style' | 'fit'>,
  levels: Float32Array | null,
  t: number,
  total: number,
) {
  const zoom = 1 + 0.06 * (t / Math.max(1, total));
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  drawFitted(ctx, opts.image, W, H, opts.fit, { x: 0.5, y: 0.5 }, opts.fit === 'cover' ? zoom : 1);

  // Degradado inferior para que se lea el texto
  const g = ctx.createLinearGradient(0, H * 0.55, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.75)');
  ctx.fillStyle = g;
  ctx.fillRect(0, H * 0.55, W, H * 0.45);

  const baseY = H * 0.8;
  if (opts.style !== 'minimal' && levels) {
    const n = levels.length;
    const span = W * 0.78;
    const x0 = (W - span) / 2;
    const gap = span / n;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    for (let i = 0; i < n; i++) {
      const v = Math.max(0.04, levels[i]);
      if (opts.style === 'bars') {
        const h = v * H * 0.09;
        roundRect(ctx, x0 + i * gap + gap * 0.18, baseY - h, gap * 0.64, h, gap * 0.3);
      } else {
        const h = v * H * 0.055;
        roundRect(ctx, x0 + i * gap + gap * 0.25, baseY - h, gap * 0.5, h * 2, gap * 0.25);
      }
    }
  }

  // Barra de progreso
  const pw = W * 0.78;
  const px = (W - pw) / 2;
  const py = baseY + H * 0.055;
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  roundRect(ctx, px, py, pw, 6, 3);
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, px, py, pw * Math.min(1, t / Math.max(0.01, total)), 6, 3);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  if (opts.title) {
    ctx.font = `700 ${Math.round(W * 0.058)}px Inter, system-ui, sans-serif`;
    ctx.fillText(opts.title, W / 2, H * 0.68, W * 0.86);
  }
  if (opts.subtitle) {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = `500 ${Math.round(W * 0.036)}px Inter, system-ui, sans-serif`;
    ctx.fillText(opts.subtitle, W / 2, H * 0.68 + W * 0.06, W * 0.86);
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  ctx.fill();
}

export function previewLevels(audio: AudioBuffer, start: number, t: number, bands = 48): Float32Array {
  return levelsPerFrame(audio, start + t, 1 / 30, 30, bands)[0] || new Float32Array(bands);
}

export async function makeMusicReel(opts: MusicReelOptions): Promise<{ file: File; thumb: Blob; width: number; height: number; duration: number }> {
  const mb = await import('mediabunny');
  const W = 1080;
  const H = 1920;
  const fps = 30;
  const duration = Math.max(3, Math.min(90, opts.duration));
  const start = Math.max(0, Math.min(opts.start, Math.max(0, opts.audio.duration - duration)));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const target = new mb.BufferTarget();
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const video = new mb.CanvasSource(canvas, { codec: 'avc', bitrate: 8_000_000, keyFrameInterval: 2 } as any);
  const outRate = opts.audio.sampleRate === 44100 ? 44100 : 48000;
  const audioSrc = new mb.AudioBufferSource({ codec: 'aac', bitrate: await bestAacBitrate(2, outRate) } as any);
  output.addVideoTrack(video, { frameRate: fps });
  output.addAudioTrack(audioSrc);
  await output.start();

  const levels = opts.style === 'minimal' ? null : levelsPerFrame(opts.audio, start, duration, fps, 48);
  let clip = sliceAudio(opts.audio, start, duration, opts.fade ?? 0.4);
  if (clip.sampleRate !== 44100 && clip.sampleRate !== 48000) {
    // 88,2 / 96 kHz y similares: AAC solo admite 44,1 o 48 kHz
    const off = new OfflineAudioContext(2, Math.ceil(clip.duration * 48000), 48000);
    const node = off.createBufferSource();
    node.buffer = clip;
    node.connect(off.destination);
    node.start();
    clip = await off.startRendering();
  }
  await audioSrc.add(clip);

  const frames = Math.ceil(duration * fps);
  let thumb: Blob | null = null;
  for (let f = 0; f < frames; f++) {
    if (opts.signal?.aborted) {
      await output.cancel().catch(() => {});
      throw new Cancelled();
    }
    const t = f / fps;
    drawMusicFrame(ctx, W, H, opts, levels ? levels[f] : null, t, duration);
    await video.add(t, 1 / fps);
    if (f === Math.floor(frames * 0.3)) thumb = await thumbnailFrom(canvas);
    if (f % 15 === 0) opts.onProgress?.(f / frames);
  }
  video.close();
  audioSrc.close();
  await output.finalize();
  opts.onProgress?.(1);
  const name = `${baseName(opts.title || 'reel')}.mp4`;
  return {
    file: new File([target.buffer!], name, { type: 'video/mp4' }),
    thumb: thumb || (await thumbnailFrom(canvas)),
    width: W,
    height: H,
    duration,
  };
}
