import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ensureBinaries } from './binaries';
import { buildCookieArgs } from './cookies';
import { downloadWithEngines } from './engines';
import { processAudioBuffer, AudioProcessOptions } from './processor';
import { assertCompleteAudio, getYouTubeDurationSeconds } from './verify';

/**
 * The single way the downloader produces a song. Every engine's output is
 * decoded end to end and compared with the source length before anyone gets
 * it, so a song that stops halfway is never delivered (see verify.ts).
 */

export interface VerifiedAudio {
  buffer: Buffer;
  format: string;
  mimeType: string;
  /** Real decoded length of the delivered file, in seconds. */
  durationSeconds: number;
  engine: string;
}

const YTDLP_TIMEOUT_MS = 150_000;

const AUDIO_EXTS = ['.mp3', '.m4a', '.webm', '.opus', '.aac', '.ogg', '.wav', '.flac'];

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function proxyArgs(): string[] {
  const proxyUrl = process.env.PROXY_URL || process.env.HTTP_PROXY || process.env.HTTPS_PROXY || process.env.YTDL_PROXY;
  return proxyUrl ? ['--proxy', proxyUrl] : [];
}

async function removeByPrefix(prefix: string) {
  const dir = os.tmpdir();
  try {
    const files = await fs.promises.readdir(dir);
    await Promise.all(
      files.filter((f) => f.startsWith(prefix)).map((f) => fs.promises.unlink(path.join(dir, f)).catch(() => {}))
    );
  } catch {}
}

/**
 * Runs yt-dlp on any URL, then checks the result is complete. Each call uses
 * its own temp prefix and cleans it up, so a half-written file from a failed
 * attempt can never be picked up by a later one.
 */
export async function downloadUrlViaYtdlp(
  targetUrl: string,
  options: AudioProcessOptions,
  opts: {
    useCookies?: boolean;
    onProgress?: (percent: number) => void;
    onConverting?: () => void;
    /** Reference length when the caller already knows it. */
    expectedSeconds?: number | null;
    videoId?: string | null;
  } = {},
): Promise<VerifiedAudio> {
  const { ytdlpPath, ffmpegPath } = await ensureBinaries();
  const cookieArgs = opts.useCookies === false ? [] : await buildCookieArgs();
  const prefix = `ytdlp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const outputTemplate = path.join(os.tmpdir(), `${prefix}.%(ext)s`);
  const format = options.format || 'mp3';
  const quality = options.quality || '320';
  const nodePath = process.execPath || 'node';

  const args = [
    '--no-warnings',
    '--no-playlist',
    '--no-check-certificates',
    '--geo-bypass',
    '--js-runtimes',
    `node:${nodePath}`,
    ...cookieArgs,
    // Prefer opus (highest native YT quality) → m4a → any audio-only → best
    '-f',
    'bestaudio[ext=opus]/bestaudio[ext=m4a]/bestaudio/best',
    '--extract-audio',
    '--audio-format',
    format,
    '--audio-quality',
    quality === '320' ? '0' : `${quality}K`,
    '--ffmpeg-location',
    ffmpegPath,
    '--retries',
    '10',
    '--fragment-retries',
    '10',
    '--output',
    outputTemplate,
    // Source length, printed once the final file exists (does not skip the download).
    '--print',
    'after_move:EZYDUR=%(duration)s',
    '--progress',
    '--newline',
    ...proxyArgs(),
    targetUrl,
  ];

  try {
    let reportedDuration: number | null = null;
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(ytdlpPath, args);
      // A stalled download must fail (and fall back) before the 300 s
      // function limit, not hang until the platform kills the request.
      const killer = setTimeout(() => proc.kill('SIGKILL'), YTDLP_TIMEOUT_MS);
      proc.on('close', () => clearTimeout(killer));
      let stderrOut = '';
      let stdoutTail = '';
      proc.stdout.on('data', (data: Buffer) => {
        const output = data.toString();
        stdoutTail = (stdoutTail + output).slice(-2000);
        const pm = output.match(/\[download\]\s+(\d+(\.\d+)?)%/);
        if (pm) opts.onProgress?.(parseFloat(pm[1]));
        if (output.includes('[ExtractAudio]')) opts.onConverting?.();
        const dm = stdoutTail.match(/EZYDUR=([\d.]+)/);
        if (dm) reportedDuration = Number(dm[1]) || null;
      });
      proc.stderr.on('data', (data: Buffer) => {
        stderrOut += data.toString();
      });
      proc.on('close', (code: number | null) => {
        if (code === 0) return resolve();
        const errorLines = stderrOut.split('\n').filter((l) => l.includes('ERROR') || l.includes('error'));
        reject(new Error(
          errorLines.length > 0
            ? errorLines[errorLines.length - 1].trim()
            : `yt-dlp exited code ${code}: ${stderrOut.slice(-400)}`
        ));
      });
      proc.on('error', (err: Error) => reject(new Error(`Failed to spawn yt-dlp: ${err.message}`)));
    });

    const files = await fs.promises.readdir(os.tmpdir());
    const exact = `${prefix}.${format}`;
    const found = files.includes(exact)
      ? exact
      : files.find((f) => f.startsWith(prefix) && AUDIO_EXTS.some((ext) => f.endsWith(ext)));
    if (!found) throw new Error('yt-dlp: no se generó ningún archivo de audio');

    const raw = await fs.promises.readFile(path.join(os.tmpdir(), found));
    let expected: number | null = reportedDuration || opts.expectedSeconds || null;
    if (!expected && opts.videoId) expected = await getYouTubeDurationSeconds(opts.videoId);
    const rawExt = path.extname(found).slice(1) || format;
    const measured = await assertCompleteAudio(ffmpegPath, raw, expected, rawExt);

    return await finish(raw, options, ffmpegPath, expected ?? measured.decodedSeconds, measured.decodedSeconds, 'yt-dlp');
  } finally {
    await removeByPrefix(prefix);
  }
}

/** DSP / format conversion, then re-check the delivered file itself. */
async function finish(
  raw: Buffer,
  options: AudioProcessOptions,
  ffmpegPath: string,
  expectedSeconds: number,
  rawSeconds: number,
  engine: string,
): Promise<VerifiedAudio> {
  const processed = await processAudioBuffer(raw, options);
  let durationSeconds = rawSeconds;
  if (processed.buffer !== raw) {
    // Trimming silence legitimately shortens the song; compare against the
    // verified raw length minus a generous margin in that case only.
    const reference = options.trimSilence ? null : expectedSeconds;
    const m = await assertCompleteAudio(ffmpegPath, processed.buffer, reference, processed.format);
    durationSeconds = m.decodedSeconds;
  }
  return { ...processed, durationSeconds, engine };
}

/**
 * Downloads one YouTube video as a verified, complete file:
 * yt-dlp first (best quality), SaveTube as fallback. Throws if no engine
 * produced a complete song — callers must never deliver a partial file.
 */
export async function downloadVerifiedVideo(
  videoId: string,
  options: AudioProcessOptions,
  hooks: { onProgress?: (percent: number) => void; onConverting?: () => void } = {},
): Promise<VerifiedAudio> {
  const errors: string[] = [];
  try {
    return await downloadUrlViaYtdlp(`https://www.youtube.com/watch?v=${videoId}`, options, {
      videoId,
      onProgress: hooks.onProgress,
      onConverting: hooks.onConverting,
    });
  } catch (e) {
    errors.push(`yt-dlp: ${errMsg(e)}`);
    console.warn(`[ytdl/reliable] yt-dlp failed for ${videoId}:`, errMsg(e));
  }

  try {
    const { ffmpegPath } = await ensureBinaries();
    // downloadWithEngines only returns files it has already verified.
    const result = await downloadWithEngines(videoId, (status, progress) => {
      if (status === 'downloading') hooks.onProgress?.(progress);
    });
    hooks.onConverting?.();
    return await finish(result.buffer, options, ffmpegPath, result.expectedSeconds ?? result.decodedSeconds, result.decodedSeconds, result.engine);
  } catch (e) {
    errors.push(`SaveTube: ${errMsg(e)}`);
    console.warn(`[ytdl/reliable] SaveTube failed for ${videoId}:`, errMsg(e));
  }

  throw new Error(`No se pudo obtener el audio completo (${errors.join(' | ')})`);
}
