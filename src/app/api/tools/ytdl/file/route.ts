import { NextResponse } from 'next/server';
import { tasks, completedFileBuffers } from '../state';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { ensureBinaries } from '../binaries';
import { buildCookieArgs } from '../cookies';

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
          },
        });
      }
    }

    // 3. Direct Streaming fallback via TransformStream
    const url = task?.url || paramUrl;
    if (!url) {
      return NextResponse.json(
        { error: 'URL o taskId no encontrado' },
        { status: 404 }
      );
    }

    const { ytdlpPath, ffmpegPath } = await ensureBinaries();
    const cookieArgs = await buildCookieArgs();
    const videoId = getYouTubeVideoId(url);
    const target = videoId ? `https://www.youtube.com/watch?v=${videoId}` : url;

    const args = [
      '--no-warnings',
      '--no-playlist',
      ...cookieArgs,
      '--extract-audio',
      '--audio-format',
      'mp3',
      '--audio-quality',
      '320K',
      '--ffmpeg-location',
      ffmpegPath,
      '-o',
      '-',
      target,
    ];

    const ytdlp = spawn(ytdlpPath, args);
    const safeTitle = encodeURIComponent(title.replace(/[^\w\s\-()]/gi, '').trim() || 'audio');

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    ytdlp.stdout.on('data', async (chunk: Buffer) => {
      try {
        await writer.write(new Uint8Array(chunk));
      } catch (e) {}
    });

    ytdlp.on('close', async () => {
      try {
        await writer.close();
      } catch (e) {}
    });

    ytdlp.on('error', async (err) => {
      try {
        await writer.abort(err);
      } catch (e) {}
    });

    return new NextResponse(readable, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': `attachment; filename="${safeTitle}.mp3"; filename*=UTF-8''${safeTitle}.mp3`,
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
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
