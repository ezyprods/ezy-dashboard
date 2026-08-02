import { NextResponse } from 'next/server';
import { tasks, completedFileBuffers } from '../state';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { spawn } from 'child_process';
import { ensureBinaries } from '../binaries';

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
    const safeTitle = task?.title || title || 'audio';
    const cleanSafeTitle = safeTitle.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
    const downloadsDir = os.tmpdir();
    const tempId = taskId || Math.random().toString(36).substring(2, 8);
    const outputTemplate = path.join(downloadsDir, `${cleanSafeTitle}_${tempId}.%(ext)s`);

    const videoId = getYouTubeVideoId(url);
    const target = videoId ? `ytsearch1:${cleanSafeTitle} audio` : url;

    const args = [
      '--no-warnings',
      '--extractor-args', 'youtube:player_client=mweb,android,ios,web_creator',
      '--user-agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      target,
      '--extract-audio',
      '--audio-format', 'mp3',
      '--audio-quality', '320K',
      '--ffmpeg-location', ffmpegPath,
      '--output', outputTemplate,
      '--no-playlist'
    ];

    await new Promise<void>((resolve, reject) => {
      const ytdlp = spawn(ytdlpPath, args);
      let stderrOut = '';
      ytdlp.stderr.on('data', d => stderrOut += d.toString());
      ytdlp.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(stderrOut || `yt-dlp exited code ${code}`));
      });
      ytdlp.on('error', reject);
    });

    const generatedMp3 = path.join(downloadsDir, `${cleanSafeTitle}_${tempId}.mp3`);
    if (fs.existsSync(generatedMp3)) {
      const buffer = await fs.promises.readFile(generatedMp3);
      try { await fs.promises.unlink(generatedMp3); } catch (e) {}
      
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
