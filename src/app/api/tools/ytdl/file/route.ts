import { NextResponse } from 'next/server';
import { tasks, completedFileBuffers } from '../state';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { spawn } from 'child_process';
import { ensureBinaries } from '../binaries';
import { buildCookieArgs } from '../cookies';

// Must be set so Vercel doesn't cut us off at 10s during on-demand re-generation
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

const AUDIO_EXTS = ['.mp3', '.m4a', '.webm', '.opus', '.aac', '.ogg'];

function findAudioFileInTmpDir(id: string): string | null {
  try {
    const downloadsDir = os.tmpdir();
    // Check exact mp3 first (most common case)
    const exactMp3 = path.join(downloadsDir, `${id}.mp3`);
    if (fs.existsSync(exactMp3)) return exactMp3;

    // Scan for any audio file with this id prefix
    const files = fs.readdirSync(downloadsDir);
    const match = files.find(f => f.startsWith(id) && AUDIO_EXTS.some(ext => f.endsWith(ext)));
    return match ? path.join(downloadsDir, match) : null;
  } catch (e) {
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId');
    const paramUrl = searchParams.get('url');
    const paramTitle = searchParams.get('title') || 'audio';

    const task = taskId ? tasks.get(taskId) : null;
    const title = task?.title || paramTitle;

    // ------------------------------------------------------------------
    // Path 1: Buffer is in-memory (same serverless instance as /process)
    // ------------------------------------------------------------------
    if (taskId && completedFileBuffers.has(taskId)) {
      const cached = completedFileBuffers.get(taskId)!;
      const safeTitle = encodeURIComponent((cached.title || title).replace(/[^\w\s\-()]/gi, '').trim());

      return new NextResponse(cached.buffer as any, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': cached.buffer.length.toString(),
          'Content-Disposition': `attachment; filename="${safeTitle}.mp3"; filename*=UTF-8''${safeTitle}.mp3`,
        },
      });
    }

    // ------------------------------------------------------------------
    // Path 2: File exists on disk (same instance, or Vercel shared /tmp)
    // ------------------------------------------------------------------
    const diskPath = taskId ? findAudioFileInTmpDir(taskId) : null;
    if (diskPath) {
      const safeTitle = encodeURIComponent(title.replace(/[^\w\s\-()]/gi, '').trim());
      const buffer = await fs.promises.readFile(diskPath);
      if (buffer.length > 0) {
        return new NextResponse(buffer as any, {
          headers: {
            'Content-Type': 'audio/mpeg',
            'Content-Length': buffer.length.toString(),
            'Content-Disposition': `attachment; filename="${safeTitle}.mp3"; filename*=UTF-8''${safeTitle}.mp3`,
          },
        });
      }
    }

    // ------------------------------------------------------------------
    // Path 3: On-demand regeneration (different serverless instance or cache expired)
    // ------------------------------------------------------------------
    const url = task?.url || paramUrl;
    if (!url) {
      return NextResponse.json(
        { error: 'Archivo no encontrado. Intenta descargar de nuevo.' },
        { status: 404 }
      );
    }

    const { ytdlpPath, ffmpegPath } = await ensureBinaries();
    const cookieArgs = await buildCookieArgs();
    const downloadsDir = os.tmpdir();
    // Use a fresh tempId to avoid collision with stale/partial files
    const tempId = `${taskId || 'tmp'}_retry_${Date.now()}`;
    const outputTemplate = path.join(downloadsDir, `${tempId}.%(ext)s`);

    const videoId = getYouTubeVideoId(url);
    const target = videoId ? `https://www.youtube.com/watch?v=${videoId}` : url;

    const executeSpawn = (clientArgs: string[], useCookies: boolean): Promise<void> => {
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
        target,
      ];

      return new Promise<void>((resolve, reject) => {
        const ytdlp = spawn(ytdlpPath, args);
        let stderrOut = '';
        ytdlp.stderr.on('data', d => (stderrOut += d.toString()));
        ytdlp.on('close', code => {
          if (code === 0) resolve();
          else reject(new Error(stderrOut.slice(-500) || `yt-dlp exited code ${code}`));
        });
        ytdlp.on('error', reject);
      });
    };

    const retryMatrix: Array<{ clientArgs: string[]; useCookies: boolean }> = [
      {
        clientArgs: [
          '--extractor-args', 'youtube:player_client=tv_embedded',
          '--user-agent', 'Mozilla/5.0 (SmartHub; SMART-TV; U; Linux/SmartTV) AppleWebKit/538.1+ (KHTML, like Gecko) TV Safari/538.1+',
        ],
        useCookies: true,
      },
      {
        clientArgs: [
          '--extractor-args', 'youtube:player_client=android',
          '--user-agent', 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        ],
        useCookies: false,
      },
      {
        clientArgs: [
          '--extractor-args', 'youtube:player_client=mweb',
          '--user-agent', 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        ],
        useCookies: false,
      },
    ];

    let lastError = '';
    let onDemandSuccess = false;

    for (const { clientArgs, useCookies } of retryMatrix) {
      try {
        await executeSpawn(clientArgs, useCookies);
        onDemandSuccess = true;
        break;
      } catch (err: any) {
        lastError = err?.message || String(err);
        console.warn('[ytdl/file] On-demand attempt failed:', lastError.slice(0, 200));
      }
    }

    if (!onDemandSuccess) {
      return NextResponse.json(
        { error: 'No se pudo regenerar el audio', details: lastError.slice(0, 500) },
        { status: 500 }
      );
    }

    const foundFile = findAudioFileInTmpDir(tempId);
    if (!foundFile) {
      return NextResponse.json(
        { error: 'Archivo MP3 no encontrado tras regeneración' },
        { status: 500 }
      );
    }

    const buffer = await fs.promises.readFile(foundFile);
    // Clean up immediately after reading
    try { await fs.promises.unlink(foundFile); } catch (e) {}

    const safeFilename = encodeURIComponent(title.replace(/[^\w\s\-()]/gi, '').trim());
    return new NextResponse(buffer as any, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': buffer.length.toString(),
        'Content-Disposition': `attachment; filename="${safeFilename}.mp3"; filename*=UTF-8''${safeFilename}.mp3`,
      },
    });

  } catch (error: any) {
    console.error('[ytdl/file] Error:', error?.message || error);
    return NextResponse.json(
      { error: error.message || 'Error en el servidor al enviar el archivo' },
      { status: 500 }
    );
  }
}
