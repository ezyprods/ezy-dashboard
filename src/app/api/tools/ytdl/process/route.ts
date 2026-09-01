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
} from '../engines';
import { processAudioBuffer, AudioProcessOptions } from '../processor';
import { spawn } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs';

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

    // If Spotify or SoundCloud track, resolve candidate YouTube video IDs
    if (videoIdsToTry.length === 0 && (isSpotifyUrl(task.url) || task.url.includes('soundcloud.com') || !task.url.startsWith('http'))) {
      const query = `${task.title} audio`;
      const candidates = await searchYouTubeVideoIds(query, 3);
      videoIdsToTry.push(...candidates);
    }

    // =========================================================================
    // MULTI-ENGINE ATTEMPTS ACROSS CANDIDATE VIDEO IDS
    // =========================================================================
    if (videoIdsToTry.length > 0) {
      task.status = 'downloading';
      task.progress = 15;
      broadcast({ type: 'update', task });

      let lastEngineErr: any = null;

      for (let i = 0; i < videoIdsToTry.length; i++) {
        const vid = videoIdsToTry[i];
        try {
          console.log(`[ytdl/process] Attempting engine download for taskId=${taskId}, candidate [${i + 1}/${videoIdsToTry.length}] videoId=${vid}`);
          
          const result = await downloadWithEngines(vid, (status, progress) => {
            if (status === 'downloading' && progress > task.progress) {
              task.progress = progress;
              broadcast({ type: 'update', task });
            }
          });

          task.status = 'converting';
          task.progress = 80;
          broadcast({ type: 'update', task });

          // Post-process buffer with requested format, bitrate, normalize & trimSilence
          const processed = await processAudioBuffer(result.buffer, options);

          const finalExt = processed.format || 'mp3';
          const expectedFile = path.join(downloadsDir, `${taskId}.${finalExt}`);
          await fs.promises.writeFile(expectedFile, processed.buffer);

          completedFileBuffers.set(taskId, {
            buffer: processed.buffer,
            title: task.title,
            format: finalExt,
            mimeType: processed.mimeType,
          });

          task.downloadPath = expectedFile;
          task.status = 'completed';
          task.progress = 100;
          broadcast({ type: 'update', task });

          // Clean up after 10 minutes
          setTimeout(async () => {
            try {
              if (fs.existsSync(expectedFile)) await fs.promises.unlink(expectedFile);
              completedFileBuffers.delete(taskId);
            } catch (e) {}
          }, 10 * 60 * 1000);

          console.log(`[ytdl/process] Success for taskId=${taskId}, format=${finalExt}, size=${processed.buffer.length}`);
          return;
        } catch (err: any) {
          console.warn(`[ytdl/process] Candidate videoId=${vid} failed:`, err?.message || err);
          lastEngineErr = err;
        }
      }

      if (isSpotifyUrl(task.url) || !task.url.startsWith('http')) {
        throw new Error(lastEngineErr?.message || 'No se pudo descargar el audio tras intentar múltiples fuentes');
      }
    }

    // =========================================================================
    // FALLBACK: yt-dlp binary (ONLY for direct media URLs)
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
        'ba/ba*/bestaudio/b/best',
        '--extract-audio',
        '--audio-format',
        options.format || 'mp3',
        '--audio-quality',
        `${options.quality || '320'}K`,
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
