import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Completeness check for every downloaded song.
 *
 * Why this exists: SaveTube (the fallback engine) sometimes hands out a file
 * that is still being converted. Its Cloudflare CDN then caches that partial
 * file for 30 days, so the song plays fine and suddenly stops at a "random"
 * point (measured: a 944 s video served as exactly 8 MiB = 524 s, while the
 * uncached origin had the full 15.1 MB). The file is a perfectly valid MP3,
 * just short, so nothing else in the pipeline noticed.
 *
 * The only reliable test is to decode the whole file and compare the real
 * playable length with the length YouTube reports for the same video.
 */

export interface AudioMeasurement {
  /** Seconds of audio that actually decode. */
  decodedSeconds: number;
  /** ffmpeg decode errors (corrupt frames, cut-off last frame...). */
  errors: string;
}

/** Decodes the whole file with ffmpeg and returns how many seconds really play. */
export async function measureAudioFile(ffmpegPath: string, filePath: string): Promise<AudioMeasurement> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, [
      '-hide_banner', '-nostdin', '-nostats', '-v', 'error',
      '-i', filePath,
      '-map', '0:a:0',
      '-f', 'null', '-',
      '-progress', 'pipe:1',
    ]);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      const times = Array.from(stdout.matchAll(/out_time_us=(\d+)/g));
      const last = times.length ? Number(times[times.length - 1][1]) : NaN;
      if (code !== 0 || !Number.isFinite(last)) {
        return reject(new Error(`No se pudo decodificar el audio (ffmpeg ${code}): ${stderr.slice(-200)}`));
      }
      resolve({ decodedSeconds: last / 1e6, errors: stderr.trim() });
    });
  });
}

export async function measureAudioBuffer(ffmpegPath: string, buffer: Buffer, ext = 'mp3'): Promise<AudioMeasurement> {
  const tmp = path.join(os.tmpdir(), `verify_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`);
  await fs.promises.writeFile(tmp, buffer);
  try {
    return await measureAudioFile(ffmpegPath, tmp);
  } finally {
    fs.promises.unlink(tmp).catch(() => {});
  }
}

/**
 * Allowed gap between YouTube's length and the decoded length. YouTube
 * rounds to whole seconds and encoders pad/trim a few hundred ms; complete
 * files measured between -0.5 s and +0.4 s. A truncated song is short by
 * tens of seconds or minutes.
 */
export function allowedShortfall(expectedSeconds: number): number {
  return Math.max(2.5, expectedSeconds * 0.01);
}

export class IncompleteAudioError extends Error {
  constructor(public decodedSeconds: number, public expectedSeconds: number) {
    super(
      `Audio incompleto: ${fmt(decodedSeconds)} de ${fmt(expectedSeconds)}`
    );
    this.name = 'IncompleteAudioError';
  }
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const r = Math.round(s - m * 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

/**
 * Throws IncompleteAudioError unless the audio plays for (about) the expected
 * length. Without a reference length it still rejects files that don't decode
 * or are implausibly short.
 */
export async function assertCompleteAudio(
  ffmpegPath: string,
  buffer: Buffer,
  expectedSeconds: number | null | undefined,
  ext = 'mp3',
): Promise<AudioMeasurement> {
  if (!buffer || buffer.length < 1024) {
    throw new Error(`Archivo de audio vacío (${buffer?.length || 0} bytes)`);
  }
  const m = await measureAudioBuffer(ffmpegPath, buffer, ext);
  if (m.decodedSeconds < 5) {
    throw new IncompleteAudioError(m.decodedSeconds, expectedSeconds || 0);
  }
  if (expectedSeconds && expectedSeconds > 0) {
    if (m.decodedSeconds < expectedSeconds - allowedShortfall(expectedSeconds)) {
      throw new IncompleteAudioError(m.decodedSeconds, expectedSeconds);
    }
  }
  return m;
}

/**
 * Length of a YouTube video in seconds, read from the public watch page.
 * Used when an engine doesn't report it. Returns null when unknown.
 */
export async function getYouTubeDurationSeconds(videoId: string): Promise<number | null> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/"lengthSeconds":"(\d+)"/) || html.match(/itemprop="duration" content="PT(\d+)M(\d+)S"/);
    if (!m) return null;
    const secs = m.length === 3 ? Number(m[1]) * 60 + Number(m[2]) : Number(m[1]);
    return secs > 0 ? secs : null;
  } catch {
    return null;
  }
}
