import path from 'path';
import os from 'os';
import { existsSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';

/**
 * Builds a `Content-Disposition` header value that is always a valid ByteString.
 * Non-ASCII characters (accents, emojis, curly quotes...) in a plain `filename="..."`
 * make Node/undici throw, so the ASCII fallback is sanitised and the real name goes
 * into the RFC 5987 `filename*` parameter.
 */
export function contentDisposition(fileName: string, type: 'attachment' | 'inline' = 'attachment'): string {
  const clean = (fileName || 'archivo').replace(/[\r\n]/g, ' ').trim() || 'archivo';
  const ascii = clean
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\]/g, '')
    .trim() || 'archivo';
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}

/** Temporary working directory for audio tools (created on demand). */
export function getToolsTempDir(): string {
  // turbopackIgnore keeps the tracer from treating this runtime-only temp
  // path as a reason to bundle the whole project into every tools route.
  const dir = path.join(/* turbopackIgnore: true */ os.tmpdir(), 'ezy_audio_tools');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Unique temp path that never uses the user supplied name directly
 * (prevents collisions between concurrent requests and path traversal).
 */
export function uniqueTempPath(originalName: string, suffix = ''): string {
  const ext = (path.extname(originalName || '') || '').replace(/[^.a-zA-Z0-9]/g, '').slice(0, 10);
  return path.join(getToolsTempDir(), `${randomUUID()}${suffix}${ext}`);
}

/** Resolves the FFmpeg binary (downloaded static build on Linux/Vercel, ffmpeg-static locally). */
export async function resolveFfmpegPath(): Promise<string> {
  try {
    const { ensureBinaries } = await import('@/app/api/tools/ytdl/binaries');
    const { ffmpegPath } = await ensureBinaries();
    if (ffmpegPath) return ffmpegPath;
  } catch {
    // fall through
  }
  if (os.platform() === 'win32') {
    try {
      // Local Windows dev only — Vercel downloads a Linux static build at runtime.
      // The ignore comments keep the bundler from resolving `ffmpeg-static` at
      // build time: tracing it dragged the entire project into this route's
      // function bundle ("Encountered unexpected file in NFT list"), which is
      // pure Functions Storage we pay for in every region.
      const mod: any = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ 'ffmpeg-static');
      return (mod?.default || mod) as string;
    } catch {
      return 'ffmpeg';
    }
  }
  return 'ffmpeg';
}
