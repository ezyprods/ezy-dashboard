import { NextResponse } from 'next/server';
import { tasks, completedFileBuffers } from '../state';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { spawn } from 'child_process';
import { ensureBinaries } from '../binaries';
import { buildCookieArgs } from '../cookies';

export const maxDuration = 60;

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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId');
    const paramUrl = searchParams.get('url');
    const paramTitle = searchParams.get('title') || 'audio';

    // 1. If buffer exists in memory (cached after processDownload completes), return buffer immediately
    if (taskId && completedFileBuffers.has(taskId)) {
      const cached = completedFileBuffers.get(taskId)!;
      const safeTitle = encodeURIComponent(cached.title.replace(/[^\w\s-]/gi, '').trim());

      return new NextResponse(cached.buffer as any, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': cached.buffer.length.toString(),
          'Content-Disposition': `attachment; filename="${safeTitle}.mp3"; filename*=UTF-8''${safeTitle}.mp3`,
        },
      });
    }

    let task = taskId ? tasks.get(taskId) : null;
    let title = task?.title || paramTitle;
    let url = task?.url || paramUrl || '';

    // 2. If file exists on local disk, stream directly from disk
    if (task && task.downloadPath && fs.existsSync(task.downloadPath)) {
      const safeTitle = encodeURIComponent(title.replace(/[^\w\s-]/gi, '').trim());
      const fileStream = fs.createReadStream(task.downloadPath);
      const webStream = Readable.toWeb(fileStream as any);

      return new NextResponse(webStream as any, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Disposition': `attachment; filename="${safeTitle}.mp3"; filename*=UTF-8''${safeTitle}.mp3`,
        },
      });
    }

    // 3. Fallback on demand generation if cache missed
    if (!url) {
      return NextResponse.json({ error: 'URL o taskId no encontrado' }, { status: 404 });
    }

    const { ytdlpPath, ffmpegPath } = await ensureBinaries();
    const cookieArgs = await buildCookieArgs();
    const safeTitle = task?.title || title || 'audio';
    const cleanSafeTitle = safeTitle.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
    const downloadsDir = os.tmpdir();
    const tempId = taskId || Math.random().toString(36).substring(2, 8);
    const outputTemplate = path.join(downloadsDir, `${tempId}.%(ext)s`);

    const videoId = getYouTubeVideoId(url);
    const target = videoId ? `https://www.youtube.com/watch?v=${videoId}` : url;

    const executeSpawn = (clientArgs: string[], useCookies = false) => {
      const extraCookieArgs = (useCookies && cookieArgs.length > 0) ? cookieArgs : [];
      const args = [
        '--no-warnings',
        ...extraCookieArgs,
        ...clientArgs,
        target,
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '320K',
        '--ffmpeg-location', ffmpegPath,
        '--output', outputTemplate,
        '--no-playlist'
      ];

      return new Promise<void>((resolve, reject) => {
        const ytdlp = spawn(ytdlpPath, args);
        let stderrOut = '';
        ytdlp.stderr.on('data', d => stderrOut += d.toString());
        ytdlp.on('close', code => {
          if (code === 0) resolve();
          else reject(new Error(stderrOut || `yt-dlp exited code ${code}`));
        });
        ytdlp.on('error', reject);
      });
    };

    try {
      await executeSpawn([
        '--extractor-args', 'youtube:player_client=android',
        '--user-agent', 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
      ], false);
    } catch (err) {
      try {
        await executeSpawn([
          '--extractor-args', 'youtube:player_client=android_vr',
          '--user-agent', 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
        ], false);
      } catch (err2) {
        await executeSpawn([
          '--extractor-args', 'youtube:player_client=web,web_safari',
          '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        ], true);
      }
    }

    let finalMp3Path = path.join(downloadsDir, `${tempId}.mp3`);
    let foundFile: string | null = null;

    if (fs.existsSync(finalMp3Path)) {
      foundFile = finalMp3Path;
    } else {
      try {
        const files = fs.readdirSync(downloadsDir);
        const match = files.find(f => f.includes(tempId) && (f.endsWith('.mp3') || f.endsWith('.m4a') || f.endsWith('.webm') || f.endsWith('.opus') || f.endsWith('.aac')));
        if (match) {
          foundFile = path.join(downloadsDir, match);
        }
      } catch (e) {}
    }

    if (foundFile && fs.existsSync(foundFile)) {
      const buffer = await fs.promises.readFile(foundFile);
      try { await fs.promises.unlink(foundFile); } catch (e) {}
      
      const safeFilename = encodeURIComponent(cleanSafeTitle);
      return new NextResponse(buffer as any, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': buffer.length.toString(),
          'Content-Disposition': `attachment; filename="${safeFilename}.mp3"; filename*=UTF-8''${safeFilename}.mp3`,
        },
      });
    } else {
      return NextResponse.json({ error: 'No se pudo generar el archivo audio' }, { status: 500 });
    }

  } catch (error: any) {
    console.error('Download File Error:', error);
    return NextResponse.json({ error: error.message || 'Error en el servidor al enviar el archivo' }, { status: 500 });
  }
}
