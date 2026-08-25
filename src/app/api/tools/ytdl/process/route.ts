import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { tasks, broadcast, completedFileBuffers } from '../state';
import { ensureBinaries } from '../binaries';
import { buildCookieArgs } from '../cookies';
import { spawn } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs';

// Critical: Vercel default is 10s. Downloads need up to 5min on Pro plan.
export const maxDuration = 300;

function getYouTubeVideoId(urlStr: string): string | null {
  try {
    const parsed = new URL(urlStr);
    if (parsed.hostname.includes('youtube.com')) {
      return parsed.searchParams.get('v') || null;
    }
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.replace(/^\//, '').split('?')[0] || null;
    }
  } catch (e) {
    const match = urlStr.match(
      /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/
    );
    if (match) return match[1];
  }
  return null;
}

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
  } = body;

  const taskId = passedTaskId || uuidv4();
  const task = {
    id: taskId,
    clientId: clientId || 'anonymous',
    url: resolvedUrl || url,
    title: title || 'Audio',
    thumbnail,
    platform,
    status: 'downloading' as const,
    progress: 0,
    startTime: Date.now(),
  };

  tasks.set(taskId, task);
  broadcast({ type: 'update', task });

  try {
    await processDownload(taskId);
    return NextResponse.json({ success: true, taskId });
  } catch (error: any) {
    console.error('[ytdl/process] Fatal error:', error?.message || error);
    return NextResponse.json(
      { error: error.message || 'Error en descarga' },
      { status: 500 }
    );
  }
}

async function processDownload(taskId: string) {
  const task = tasks.get(taskId);
  if (!task) throw new Error('Task not found');

  try {
    const { ytdlpPath, ffmpegPath } = await ensureBinaries();
    const cookieArgs = await buildCookieArgs();

    const downloadsDir = os.tmpdir();
    const outputTemplate = path.join(downloadsDir, `${taskId}.%(ext)s`);

    const videoId = getYouTubeVideoId(task.url);
    const isYouTube = !!videoId || task.url.includes('youtube.com') || task.url.includes('youtu.be');

    // -----------------------------------------------------------------------
    // Download matrix — ordered by reliability on datacenter IPs (Vercel).
    //
    // KEY INSIGHT: YouTube blocks datacenter IPs when using browser clients
    // (web, mweb) because it triggers bot-detection. App clients that use
    // their own auth bypass this:
    //
    //  1. mediaconnect — YouTube Music internal API. Bypasses bot detection
    //     entirely on server/datacenter IPs. No cookies needed. BEST option.
    //
    //  2. tv_embedded — SmartTV client. Low bot-detection. Requires cookies
    //     to work reliably on blocked IPs but worth trying without.
    //
    //  3. android_vr — VR client. Rarely blocked. No cipher needed.
    //
    //  4. android — Standard Android client. May need cookies on Vercel.
    //
    // For non-YouTube (SoundCloud, etc.) we use generic extractor.
    // -----------------------------------------------------------------------
    const youtubeMatrix: Array<{
      clientArgs: string[];
      useCookies: boolean;
      label: string;
    }> = [
      // ALL attempts use cookies — datacenter IPs (Vercel/AWS) get bot-blocked without them.
      // android_music is the most reliable client for audio extraction.
      {
        label: 'android_music+cookies',
        clientArgs: [
          '--extractor-args',
          'youtube:player_client=android_music',
        ],
        useCookies: true,
      },
      {
        label: 'android_creator+cookies',
        clientArgs: [
          '--extractor-args',
          'youtube:player_client=android_creator',
        ],
        useCookies: true,
      },
      {
        label: 'ios+cookies',
        clientArgs: [
          '--extractor-args',
          'youtube:player_client=ios',
        ],
        useCookies: true,
      },
      {
        label: 'android+cookies',
        clientArgs: [
          '--extractor-args',
          'youtube:player_client=android',
        ],
        useCookies: true,
      },
      // Last resort: default client with cookies
      {
        label: 'default+cookies',
        clientArgs: [],
        useCookies: true,
      },
    ];

    const nonYoutubeMatrix: Array<{
      clientArgs: string[];
      useCookies: boolean;
      label: string;
    }> = [
      {
        label: 'default+cookies',
        clientArgs: [],
        useCookies: true,
      },
      {
        label: 'default',
        clientArgs: [],
        useCookies: false,
      },
    ];

    const matrix = isYouTube ? youtubeMatrix : nonYoutubeMatrix;
    const targetUrl = videoId
      ? `https://www.youtube.com/watch?v=${videoId}`
      : task.url;

    const executeDownload = (
      attempt: (typeof matrix)[0]
    ): Promise<void> => {
      const extraCookieArgs =
        attempt.useCookies && cookieArgs.length > 0 ? cookieArgs : [];

      const args = [
        '--no-warnings',
        '--no-playlist',
        ...extraCookieArgs,
        ...attempt.clientArgs,
        '--extract-audio',
        '--audio-format',
        'mp3',
        '--audio-quality',
        '320K',
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
            // Extract the most meaningful error line
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

    // Reset progress
    task.progress = 0;
    task.status = 'downloading';
    broadcast({ type: 'update', task });

    let success = false;
    let lastErr: Error | null = null;

    for (const attempt of matrix) {
      try {
        console.log(
          `[ytdl/process] Trying client "${attempt.label}" for taskId=${taskId}`
        );
        await executeDownload(attempt);
        console.log(
          `[ytdl/process] Success with client "${attempt.label}"`
        );
        success = true;
        break;
      } catch (err: any) {
        const errMsg = (err?.message || String(err)).slice(0, 300);
        console.warn(
          `[ytdl/process] Client "${attempt.label}" failed: ${errMsg}`
        );
        lastErr = err;
      }
    }

    if (!success) {
      const errMsg = lastErr?.message || 'Todos los métodos de descarga fallaron';
      throw new Error(errMsg);
    }

    // --- Locate the generated audio file ---
    const expectedMp3 = path.join(downloadsDir, `${taskId}.mp3`);
    let foundFile: string | null = null;

    // Small delay for filesystem flush (important on Linux/Vercel)
    await new Promise((r) => setTimeout(r, 500));

    if (fs.existsSync(expectedMp3)) {
      foundFile = expectedMp3;
    } else {
      try {
        const AUDIO_EXTS = ['.mp3', '.m4a', '.webm', '.opus', '.aac', '.ogg'];
        const files = fs.readdirSync(downloadsDir);
        const match = files.find(
          (f) => f.startsWith(taskId) && AUDIO_EXTS.some((ext) => f.endsWith(ext))
        );
        if (match) {
          foundFile = path.join(downloadsDir, match);
        }
      } catch (e) {
        console.error('[ytdl/process] Failed to scan tmpdir:', e);
      }
    }

    if (!foundFile || !fs.existsSync(foundFile)) {
      try {
        const files = fs.readdirSync(downloadsDir);
        const related = files.filter((f) => f.includes(taskId));
        console.error(
          `[ytdl/process] Expected MP3 not found. Related files in tmpdir: ${JSON.stringify(related)}`
        );
      } catch (e) {}
      throw new Error('No se encontró el archivo MP3 generado tras la descarga');
    }

    const buffer = await fs.promises.readFile(foundFile);
    if (buffer.length === 0) {
      try {
        await fs.promises.unlink(foundFile);
      } catch (e) {}
      throw new Error('El archivo generado tiene 0 bytes');
    }

    // Cache buffer in memory (same serverless instance)
    completedFileBuffers.set(taskId, { buffer, title: task.title });

    // Keep file on disk as fallback for /file route (cleaned after 10 min)
    task.downloadPath = foundFile;
    task.status = 'completed';
    task.progress = 100;
    broadcast({ type: 'update', task });

    setTimeout(async () => {
      try {
        if (foundFile && fs.existsSync(foundFile)) {
          await fs.promises.unlink(foundFile);
        }
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
