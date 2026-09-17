import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { tasks, broadcast, completedFileBuffers } from '../state';
import { ensureBinaries } from '../binaries';
import { buildCookieArgs } from '../cookies';
import {
  downloadWithEngines,
  getYouTubeVideoId,
  isSpotifyUrl,
  searchYouTubeVideoIds,
  pickBestYouTubeMatch,
} from '../engines';
import { processAudioBuffer, AudioProcessOptions } from '../processor';
import { spawn } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs';

/**
 * Downloads a YouTube video's audio via yt-dlp using bestaudio selection.
 * This is the highest-quality path: downloads the native stream (opus/m4a)
 * and converts it once with FFmpeg — no intermediate re-encoding steps.
 *
 * Using this as the primary method for Spotify-resolved tracks avoids the
 * "fake 320k" problem where SaveTube takes already-compressed YouTube audio
 * and re-encodes it to MP3 (two lossy generations instead of one).
 */
async function downloadVideoIdViaNativeYtdlp(
  videoId: string,
  taskId: string,
  options: AudioProcessOptions,
  ytdlpPath: string,
  ffmpegPath: string,
  cookieArgs: string[],
  onProgress?: (progress: number) => void,
): Promise<{ buffer: Buffer; format: string; mimeType: string }> {
  const downloadsDir = os.tmpdir();
  const outputTemplate = path.join(downloadsDir, `${taskId}_native.%(ext)s`);
  const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const nodePath = process.execPath || 'node';
  const format = options.format || 'mp3';
  const quality = options.quality || '320';

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
    // VBR quality 0 = best for libmp3lame when converting from high-bitrate source.
    // Using VBR instead of CBR 320K gives slightly better quality at similar size.
    '--audio-quality',
    quality === '320' ? '0' : `${quality}K`,
    '--ffmpeg-location',
    ffmpegPath,
    '--output',
    outputTemplate,
    '--progress',
    '--newline',
  ];

  const proxyUrl = process.env.PROXY_URL || process.env.HTTP_PROXY || process.env.HTTPS_PROXY || process.env.YTDL_PROXY;
  if (proxyUrl) {
    args.push('--proxy', proxyUrl);
  }

  args.push(targetUrl);

  await new Promise<void>((resolve, reject) => {
    const ytdlp = spawn(ytdlpPath, args);
    let stderrOut = '';

    ytdlp.stdout.on('data', (data: Buffer) => {
      const output = data.toString();
      const match = output.match(/\[download\]\s+(\d+(\.\d+)?)%/);
      if (match && onProgress) {
        onProgress(parseFloat(match[1]));
      }
    });

    ytdlp.stderr.on('data', (data: Buffer) => {
      stderrOut += data.toString();
    });

    ytdlp.on('close', (code: number | null) => {
      if (code === 0) {
        resolve();
      } else {
        const errorLines = stderrOut
          .split('\n')
          .filter((l) => l.includes('ERROR') || l.includes('error'));
        const msg =
          errorLines.length > 0
            ? errorLines[errorLines.length - 1].trim()
            : `yt-dlp exited code ${code}: ${stderrOut.slice(-400)}`;
        reject(new Error(msg));
      }
    });

    ytdlp.on('error', (err: Error) => {
      reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
    });
  });

  // Locate the output file (yt-dlp may write .mp3, .m4a, .opus, etc.)
  const AUDIO_EXTS = ['.mp3', '.m4a', '.webm', '.opus', '.aac', '.ogg', '.wav', '.flac'];
  const prefix = `${taskId}_native`;
  const filesInDir = fs.readdirSync(downloadsDir);
  const found = filesInDir.find(
    (f) => f.startsWith(prefix) && AUDIO_EXTS.some((ext) => f.endsWith(ext))
  );

  if (!found) {
    throw new Error('yt-dlp native: no output audio file found after download');
  }

  const foundPath = path.join(downloadsDir, found);
  const rawBuffer = await fs.promises.readFile(foundPath);

  // Apply DSP post-processing if needed (normalize / trim silence)
  const processed = await processAudioBuffer(rawBuffer, options);

  // Cleanup temp file
  try { await fs.promises.unlink(foundPath); } catch (e) {}

  return processed;
}

// Critical: Vercel default is 10s. Downloads need up to 5min on Pro plan.
export const maxDuration = 300;

export async function POST(req: Request) {
  const body = await req.json();
  const {
    url,
    title,
    thumbnail,
    platform,
    resolvedUrl,
    clientId,
    taskId: passedTaskId,
    format = 'mp3',
    quality = '320',
    normalize = false,
    trimSilence = false,
  } = body;

  const taskId = passedTaskId || uuidv4();
  const task = {
    id: taskId,
    clientId: clientId || 'anonymous',
    url: resolvedUrl || url,
    title: title || 'Audio',
    thumbnail,
    platform,
    format,
    quality,
    status: 'downloading' as const,
    progress: 0,
    startTime: Date.now(),
  };

  tasks.set(taskId, task);
  broadcast({ type: 'update', task });

  try {
    await processDownload(taskId, { format, quality, normalize, trimSilence });
    return NextResponse.json({ success: true, taskId });
  } catch (error: any) {
    console.error('[ytdl/process] Fatal error:', error?.message || error);
    return NextResponse.json(
      { error: error.message || 'Error en descarga' },
      { status: 500 }
    );
  }
}

async function processDownload(taskId: string, options: AudioProcessOptions) {
  const task = tasks.get(taskId);
  if (!task) throw new Error('Task not found');

  try {
    const downloadsDir = os.tmpdir();
    let videoIdsToTry: string[] = [];

    const existingVideoId = getYouTubeVideoId(task.url);
    if (existingVideoId) {
      videoIdsToTry.push(existingVideoId);
    }

    // If Spotify or SoundCloud track, resolve candidate YouTube video IDs.
    // This is the path taken when downloading individual tracks from inside
    // a Spotify/SoundCloud PLAYLIST (single-track downloads are already
    // resolved to a specific videoId beforehand by /analyse). It used to
    // just grab whichever of 3 raw search candidates happened to download
    // successfully first, with no check that the audio actually matched the
    // track — the same root cause behind "downloads incorrect audios" for
    // Spotify links. task.title is "Artist - Track" (set from the playlist
    // metadata), so split it to verify candidates against the artist too.
    if (videoIdsToTry.length === 0 && (isSpotifyUrl(task.url) || task.url.includes('soundcloud.com') || !task.url.startsWith('http'))) {
      const dashIdx = task.title.indexOf(' - ');
      const expectedArtist = dashIdx > 0 ? task.title.slice(0, dashIdx).trim() : '';
      const expectedTrack = dashIdx > 0 ? task.title.slice(dashIdx + 3).trim() : task.title;
      const query = `${task.title} audio`;

      const best = await pickBestYouTubeMatch(query, expectedArtist, expectedTrack);
      const rawCandidates = await searchYouTubeVideoIds(query, 3);

      // Try the verified best match first, then fall back to the other raw
      // candidates (in case the best match is unavailable for a technical
      // reason, e.g. region-locked or removed).
      const ordered = best ? [best.videoId, ...rawCandidates.filter(id => id !== best.videoId)] : rawCandidates;
      videoIdsToTry.push(...ordered);
    }

    // =========================================================================
    // MULTI-ENGINE ATTEMPTS ACROSS CANDIDATE VIDEO IDS
    //
    // Quality strategy:
    //   PRIMARY   → yt-dlp bestaudio → FFmpeg → MP3
    //               Downloads native YouTube stream (opus/m4a) and converts
    //               once. Single generation of lossy encoding = best possible.
    //   FALLBACK  → SaveTube engine
    //               External CDN that re-encodes YouTube audio. Results in
    //               two generations of lossy encoding ("fake 320k") but is
    //               a useful safety net when yt-dlp is blocked/unavailable.
    // =========================================================================
    if (videoIdsToTry.length > 0) {
      task.status = 'downloading';
      task.progress = 15;
      broadcast({ type: 'update', task });

      // Pre-load binaries once for all candidates
      const { ytdlpPath, ffmpegPath } = await ensureBinaries();
      const cookieArgs = await buildCookieArgs();

      let lastEngineErr: any = null;

      for (let i = 0; i < videoIdsToTry.length; i++) {
        const vid = videoIdsToTry[i];

        // ── PRIMARY: yt-dlp native bestaudio ─────────────────────────────────
        try {
          console.log(`[ytdl/process] [${i + 1}/${videoIdsToTry.length}] yt-dlp native bestaudio videoId=${vid} taskId=${taskId}`);

          const processed = await downloadVideoIdViaNativeYtdlp(
            vid,
            taskId,
            options,
            ytdlpPath,
            ffmpegPath,
            cookieArgs,
            (progress) => {
              const mapped = Math.min(progress * 0.7 + 15, 85); // map 0-100 → 15-85
              if (mapped > task.progress) {
                task.progress = mapped;
                broadcast({ type: 'update', task });
              }
            },
          );

          await saveCompletedTask(taskId, task, processed, downloadsDir);
          console.log(`[ytdl/process] yt-dlp native SUCCESS taskId=${taskId}, format=${processed.format}, size=${processed.buffer.length}`);
          return;

        } catch (nativeErr: any) {
          console.warn(`[ytdl/process] yt-dlp native failed for videoId=${vid}:`, nativeErr?.message || nativeErr);

          // ── FALLBACK: SaveTube engine ─────────────────────────────────────
          try {
            console.log(`[ytdl/process] Falling back to SaveTube for videoId=${vid} taskId=${taskId}`);

            const result = await downloadWithEngines(vid, (status, progress) => {
              if (status === 'downloading' && progress > task.progress) {
                task.progress = progress;
                broadcast({ type: 'update', task });
              }
            });

            task.status = 'converting';
            task.progress = 80;
            broadcast({ type: 'update', task });

            const processed = await processAudioBuffer(result.buffer, options);
            await saveCompletedTask(taskId, task, processed, downloadsDir);
            console.log(`[ytdl/process] SaveTube fallback SUCCESS taskId=${taskId}, format=${processed.format}, size=${processed.buffer.length}`);
            return;

          } catch (savetubeErr: any) {
            console.warn(`[ytdl/process] SaveTube also failed for videoId=${vid}:`, savetubeErr?.message || savetubeErr);
            lastEngineErr = savetubeErr;
          }
        }
      }

      if (isSpotifyUrl(task.url) || !task.url.startsWith('http')) {
        throw new Error(lastEngineErr?.message || 'No se pudo descargar el audio tras intentar múltiples fuentes');
      }
    }

    // =========================================================================
    // FALLBACK: yt-dlp binary for direct media URLs (non-Spotify, non-search)
    // =========================================================================
    if (isSpotifyUrl(task.url)) {
      throw new Error('No se pudo encontrar una fuente de audio disponible para esta pista de Spotify');
    }

    const { ytdlpPath, ffmpegPath } = await ensureBinaries();
    const cookieArgs = await buildCookieArgs();
    const outputTemplate = path.join(downloadsDir, `${taskId}.%(ext)s`);
    const targetUrl = task.url;

    const matrix: Array<{
      clientArgs: string[];
      useCookies: boolean;
      label: string;
    }> = [
      { label: 'default+cookies', clientArgs: [], useCookies: true },
      { label: 'default', clientArgs: [], useCookies: false },
    ];

    const executeDownload = (
      attempt: (typeof matrix)[0]
    ): Promise<void> => {
      const extraCookieArgs =
        attempt.useCookies && cookieArgs.length > 0 ? cookieArgs : [];

      const nodePath = process.execPath || 'node';

      const args = [
        '--no-warnings',
        '--no-playlist',
        '--no-check-certificates',
        '--geo-bypass',
        '--js-runtimes',
        `node:${nodePath}`,
        ...extraCookieArgs,
        ...attempt.clientArgs,
        '-f',
        'bestaudio[ext=opus]/bestaudio[ext=m4a]/bestaudio/best',
        '--extract-audio',
        '--audio-format',
        options.format || 'mp3',
        '--audio-quality',
        options.quality === '320' ? '0' : `${options.quality || '320'}K`,
        '--ffmpeg-location',
        ffmpegPath,
        '--output',
        outputTemplate,
        '--progress',
        '--newline',
      ];

      const proxyUrl = process.env.PROXY_URL || process.env.HTTP_PROXY || process.env.HTTPS_PROXY || process.env.YTDL_PROXY;
      if (proxyUrl) {
        args.push('--proxy', proxyUrl);
      }

      args.push(targetUrl);

      const ytdlp = spawn(ytdlpPath, args);
      let stderrOut = '';

      ytdlp.stdout.on('data', (data: Buffer) => {
        const output = data.toString();
        const match = output.match(/\[download\]\s+(\d+(\.\d+)?)%/);
        if (match) {
          const progress = parseFloat(match[1]);
          if (progress > task.progress) {
            task.progress = progress;
            if (progress >= 100 && task.status === 'downloading') {
              task.status = 'converting';
            }
            broadcast({ type: 'update', task });
          }
        }
        if (
          output.includes('Extracting audio') ||
          output.includes('Destination:')
        ) {
          task.status = 'converting';
          broadcast({ type: 'update', task });
        }
      });

      ytdlp.stderr.on('data', (data: Buffer) => {
        stderrOut += data.toString();
      });

      return new Promise<void>((resolve, reject) => {
        ytdlp.on('close', (code: number | null) => {
          if (code === 0) {
            resolve();
          } else {
            const errorLines = stderrOut
              .split('\n')
              .filter((l) => l.includes('ERROR') || l.includes('error'));
            const msg =
              errorLines.length > 0
                ? errorLines[errorLines.length - 1].trim()
                : `yt-dlp exited code ${code}: ${stderrOut.slice(-400)}`;
            reject(new Error(msg));
          }
        });
        ytdlp.on('error', (err) => {
          reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
        });
      });
    };

    task.progress = 0;
    task.status = 'downloading';
    broadcast({ type: 'update', task });

    let success = false;
    let lastErr: Error | null = null;

    for (const attempt of matrix) {
      try {
        await executeDownload(attempt);
        success = true;
        break;
      } catch (err: any) {
        lastErr = err;
      }
    }

    if (!success) {
      throw new Error(lastErr?.message || 'Todos los métodos de descarga fallaron');
    }

    // Locate the generated audio file
    const AUDIO_EXTS = ['.mp3', '.m4a', '.webm', '.opus', '.aac', '.ogg', '.wav', '.flac'];
    const files = fs.readdirSync(downloadsDir);
    const match = files.find(
      (f) => f.startsWith(taskId) && AUDIO_EXTS.some((ext) => f.endsWith(ext))
    );

    if (!match) {
      throw new Error('No se encontró el archivo de audio generado tras la descarga');
    }

    const foundFile = path.join(downloadsDir, match);
    const rawBuffer = await fs.promises.readFile(foundFile);

    // Apply post-processing if needed
    const processed = await processAudioBuffer(rawBuffer, options);

    completedFileBuffers.set(taskId, {
      buffer: processed.buffer,
      title: task.title,
      format: processed.format,
      mimeType: processed.mimeType,
    });

    task.downloadPath = foundFile;
    task.status = 'completed';
    task.progress = 100;
    broadcast({ type: 'update', task });

    setTimeout(async () => {
      try {
        if (foundFile && fs.existsSync(foundFile)) await fs.promises.unlink(foundFile);
        completedFileBuffers.delete(taskId);
      } catch (e) {}
    }, 10 * 60 * 1000);

  } catch (err: any) {
    console.error('[ytdl/process] Download error:', err?.message || err);
    task.status = 'error';
    task.error = err.message || 'Error en descarga';
    broadcast({ type: 'update', task });
    throw err;
  }
}

/**
 * Saves a completed download to disk and registers it in the in-memory store.
 */
async function saveCompletedTask(
  taskId: string,
  task: ReturnType<typeof tasks.get> & object,
  processed: { buffer: Buffer; format: string; mimeType: string },
  downloadsDir: string,
) {
  const finalExt = processed.format || 'mp3';
  const expectedFile = path.join(downloadsDir, `${taskId}.${finalExt}`);
  await fs.promises.writeFile(expectedFile, processed.buffer);

  completedFileBuffers.set(taskId, {
    buffer: processed.buffer,
    title: (task as any).title,
    format: finalExt,
    mimeType: processed.mimeType,
  });

  (task as any).downloadPath = expectedFile;
  (task as any).status = 'completed';
  (task as any).progress = 100;
  broadcast({ type: 'update', task });

  // Clean up after 10 minutes
  setTimeout(async () => {
    try {
      if (fs.existsSync(expectedFile)) await fs.promises.unlink(expectedFile);
      completedFileBuffers.delete(taskId);
    } catch (e) {}
  }, 10 * 60 * 1000);
}
