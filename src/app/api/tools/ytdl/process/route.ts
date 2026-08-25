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
    const match = urlStr.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    if (match) return match[1];
  }
  return null;
}

export async function POST(req: Request) {
  const body = await req.json();
  const { url, title, thumbnail, platform, resolvedUrl, clientId, taskId: passedTaskId } = body;

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
    startTime: Date.now()
  };

  tasks.set(taskId, task);
  broadcast({ type: 'update', task });

  try {
    await processDownload(taskId);
    return NextResponse.json({ success: true, taskId });
  } catch (error: any) {
    console.error('[ytdl/process] Fatal error:', error?.message || error);
    return NextResponse.json({ error: error.message || 'Error en descarga' }, { status: 500 });
  }
}

async function processDownload(taskId: string) {
  const task = tasks.get(taskId);
  if (!task) throw new Error('Task not found');

  try {
    const { ytdlpPath, ffmpegPath } = await ensureBinaries();
    const cookieArgs = await buildCookieArgs();

    const downloadsDir = os.tmpdir();
    // Strictly use taskId as filename — avoids any sanitization mismatch
    const outputTemplate = path.join(downloadsDir, `${taskId}.%(ext)s`);

    const videoId = getYouTubeVideoId(task.url);

    // Ordered list: fastest/most reliable first, fallbacks after.
    // tv_embedded is the most reliable for YouTube bot-detection bypass.
    // Using only 2 targets + 2 clients = 4 attempts max (was 3×3=9 before).
    const downloadMatrix: Array<{
      targetUrl: string;
      clientArgs: string[];
      useCookies: boolean;
    }> = videoId
      ? [
          // Attempt 1: tv_embedded + cookies (highest success rate)
          {
            targetUrl: `https://www.youtube.com/watch?v=${videoId}`,
            clientArgs: [
              '--extractor-args', 'youtube:player_client=tv_embedded',
              '--user-agent', 'Mozilla/5.0 (SmartHub; SMART-TV; U; Linux/SmartTV) AppleWebKit/538.1+ (KHTML, like Gecko) TV Safari/538.1+',
            ],
            useCookies: true,
          },
          // Attempt 2: android (no cookies needed — different auth path)
          {
            targetUrl: `https://www.youtube.com/watch?v=${videoId}`,
            clientArgs: [
              '--extractor-args', 'youtube:player_client=android',
              '--user-agent', 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
            ],
            useCookies: false,
          },
          // Attempt 3: android_creator + cookies
          {
            targetUrl: `https://www.youtube.com/watch?v=${videoId}`,
            clientArgs: [
              '--extractor-args', 'youtube:player_client=android_creator',
              '--user-agent', 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
            ],
            useCookies: true,
          },
          // Attempt 4: mweb as last resort
          {
            targetUrl: `https://www.youtube.com/watch?v=${videoId}`,
            clientArgs: [
              '--extractor-args', 'youtube:player_client=mweb',
              '--user-agent', 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
            ],
            useCookies: false,
          },
        ]
      : [
          // Non-YouTube: single attempt, tv_embedded with cookies
          {
            targetUrl: task.url,
            clientArgs: [
              '--extractor-args', 'youtube:player_client=tv_embedded',
              '--user-agent', 'Mozilla/5.0 (SmartHub; SMART-TV; U; Linux/SmartTV) AppleWebKit/538.1+ (KHTML, like Gecko) TV Safari/538.1+',
            ],
            useCookies: true,
          },
          // Non-YouTube fallback: no client args
          {
            targetUrl: task.url,
            clientArgs: [],
            useCookies: true,
          },
        ];

    const executeDownload = (targetUrl: string, clientArgs: string[], useCookies: boolean): Promise<void> => {
      const extraCookieArgs = (useCookies && cookieArgs.length > 0) ? cookieArgs : [];
      const args = [
        '--no-warnings',
        '--no-playlist',
        ...extraCookieArgs,
        ...clientArgs,
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '320K',
        '--ffmpeg-location', ffmpegPath,
        '--output', outputTemplate,
        '--progress',
        '--newline',
        targetUrl,
      ];

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
        if (output.includes('Extracting audio') || output.includes('Destination:')) {
          task.status = 'converting';
          broadcast({ type: 'update', task });
        }
      });

      ytdlp.stderr.on('data', (data: Buffer) => {
        stderrOut += data.toString();
      });

      return new Promise<void>((resolve, reject) => {
        ytdlp.on('close', (code: number | null) => {
          if (code === 0) resolve();
          else {
            const errorLines = stderrOut.split('\n').filter(l => l.includes('ERROR'));
            const msg = errorLines.length > 0
              ? errorLines[errorLines.length - 1]
              : `yt-dlp exited code ${code}: ${stderrOut.slice(-300)}`;
            reject(new Error(msg));
          }
        });
        ytdlp.on('error', reject);
      });
    };

    // Reset progress for new attempt
    task.progress = 0;
    task.status = 'downloading';
    broadcast({ type: 'update', task });

    let success = false;
    let lastErr: Error | null = null;

    for (const attempt of downloadMatrix) {
      try {
        await executeDownload(attempt.targetUrl, attempt.clientArgs, attempt.useCookies);
        success = true;
        break;
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        console.warn(`[ytdl/process] Attempt failed (url=${attempt.targetUrl}, cookies=${attempt.useCookies}):`, errMsg.slice(0, 200));
        lastErr = err;
      }
    }

    if (!success) {
      throw lastErr || new Error('Todos los métodos de descarga fallaron');
    }

    // --- Locate the generated audio file ---
    // yt-dlp outputs taskId.<ext> then renames after ffmpeg conversion.
    // After --extract-audio --audio-format mp3, expected: taskId.mp3
    // But sometimes intermediate files remain (.webm, .m4a etc) if conversion is fast.
    const expectedMp3 = path.join(downloadsDir, `${taskId}.mp3`);
    let foundFile: string | null = null;

    // Small delay to allow filesystem to flush (important on some Linux VMs)
    await new Promise(r => setTimeout(r, 500));

    if (fs.existsSync(expectedMp3)) {
      foundFile = expectedMp3;
    } else {
      // Scan tmpdir for any file matching our taskId
      try {
        const files = fs.readdirSync(downloadsDir);
        const AUDIO_EXTS = ['.mp3', '.m4a', '.webm', '.opus', '.aac', '.ogg'];
        const match = files.find(f =>
          f.startsWith(taskId) &&
          AUDIO_EXTS.some(ext => f.endsWith(ext))
        );
        if (match) {
          foundFile = path.join(downloadsDir, match);
        }
      } catch (e) {
        console.error('[ytdl/process] Failed to scan tmpdir:', e);
      }
    }

    if (!foundFile || !fs.existsSync(foundFile)) {
      // One more attempt: sometimes yt-dlp writes a partial file still named .webm.part
      // Log what's actually there for diagnosis
      try {
        const files = fs.readdirSync(downloadsDir);
        const related = files.filter(f => f.includes(taskId));
        console.error(`[ytdl/process] Expected MP3 not found. Files with taskId "${taskId}" in tmpdir: ${JSON.stringify(related)}`);
      } catch (e) {}
      throw new Error('No se encontró el archivo MP3 generado tras la descarga');
    }

    // Read into buffer and cache in memory (same process, same instance)
    const buffer = await fs.promises.readFile(foundFile);
    if (buffer.length === 0) {
      try { await fs.promises.unlink(foundFile); } catch (e) {}
      throw new Error('El archivo generado tiene 0 bytes — la conversión falló');
    }

    // Cache buffer keyed by taskId for the /file GET endpoint
    completedFileBuffers.set(taskId, { buffer, title: task.title });

    // Also keep the file on disk as a backup in case the buffer is in a different instance
    // (Vercel can route /file to a different lambda — disk is shared within same instance)
    // We'll delete it after a few minutes via a background timer
    // For now: do NOT delete immediately so /file can re-read if buffer miss
    // task.downloadPath is used by /file route as disk fallback
    task.downloadPath = foundFile;

    task.status = 'completed';
    task.progress = 100;
    broadcast({ type: 'update', task });

    // Schedule file cleanup after 10 minutes
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
