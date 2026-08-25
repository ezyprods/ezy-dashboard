import { NextResponse } from 'next/server';
import { tasks, completedFileBuffers } from '../state';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { ensureBinaries } from '../binaries';
import { buildCookieArgs } from '../cookies';

const execFileAsync = promisify(execFile);

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
    const exactMp3 = path.join(downloadsDir, `${id}.mp3`);
    if (fs.existsSync(exactMp3)) return exactMp3;

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

    // 1. In-memory buffer check
    if (taskId && completedFileBuffers.has(taskId)) {
      const cached = completedFileBuffers.get(taskId)!;
      const safeTitle = encodeURIComponent((cached.title || title).replace(/[^\w\s\-()]/gi, '').trim() || 'audio');

      return new NextResponse(cached.buffer as any, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': cached.buffer.length.toString(),
          'Content-Disposition': `attachment; filename="${safeTitle}.mp3"; filename*=UTF-8''${safeTitle}.mp3`,
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    // 2. Local disk check
    const diskPath = taskId ? findAudioFileInTmpDir(taskId) : null;
    if (diskPath) {
      const safeTitle = encodeURIComponent(title.replace(/[^\w\s\-()]/gi, '').trim() || 'audio');
      const buffer = await fs.promises.readFile(diskPath);
      if (buffer.length > 0) {
        return new NextResponse(buffer as any, {
          headers: {
            'Content-Type': 'audio/mpeg',
            'Content-Length': buffer.length.toString(),
            'Content-Disposition': `attachment; filename="${safeTitle}.mp3"; filename*=UTF-8''${safeTitle}.mp3`,
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }
    }

    // 3. On-demand generation fallback
    const url = task?.url || paramUrl;
    if (!url) {
      return NextResponse.json(
        { error: 'URL o taskId no encontrado' },
        { status: 404 }
      );
    }

    const { ytdlpPath, ffmpegPath } = await ensureBinaries();
    const videoId = getYouTubeVideoId(url);
    const target = videoId ? `https://www.youtube.com/watch?v=${videoId}` : url;

    const tempId = `ondemand_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const outputTemplate = path.join(os.tmpdir(), `${tempId}.%(ext)s`);

    const cookieArgs = await buildCookieArgs();
    const proxyUrl = process.env.PROXY_URL || process.env.HTTP_PROXY || process.env.HTTPS_PROXY || process.env.YTDL_PROXY;
    const nodePath = process.execPath || 'node';

    const args = [
      '--no-warnings',
      '--no-playlist',
      '--no-check-certificates',
      '--geo-bypass',
      '--js-runtimes',
      `node:${nodePath}`,
      ...cookieArgs,
      '-f',
      'ba/ba*/bestaudio/b/best',
      '-x',
      '--audio-format',
      'mp3',
      '--audio-quality',
      '320K',
      '--ffmpeg-location',
      ffmpegPath,
      '--output',
      outputTemplate,
    ];

    if (proxyUrl) {
      args.push('--proxy', proxyUrl);
    }

    args.push(target);

    await execFileAsync(ytdlpPath, args, { timeout: 120000 });

    const expectedMp3 = path.join(os.tmpdir(), `${tempId}.mp3`);
    let foundFile = fs.existsSync(expectedMp3) ? expectedMp3 : findAudioFileInTmpDir(tempId);

    if (!foundFile || !fs.existsSync(foundFile)) {
      throw new Error('No se pudo generar el archivo MP3');
    }

    const buffer = await fs.promises.readFile(foundFile);
    try { await fs.promises.unlink(foundFile); } catch (e) {}

    const safeTitle = encodeURIComponent(title.replace(/[^\w\s\-()]/gi, '').trim() || 'audio');

    return new NextResponse(buffer as any, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': buffer.length.toString(),
        'Content-Disposition': `attachment; filename="${safeTitle}.mp3"; filename*=UTF-8''${safeTitle}.mp3`,
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
