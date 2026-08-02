import { NextResponse } from 'next/server';
import { tasks } from '../state';
import fs from 'fs';
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

    let task = taskId ? tasks.get(taskId) : null;
    let title = task?.title || paramTitle;
    let url = task?.url || paramUrl || '';

    // 1. If file exists on local disk (same container / local dev), stream directly from disk
    if (task && task.downloadPath && task.status === 'completed' && fs.existsSync(task.downloadPath)) {
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

    // 2. Fallback for serverless container switches: stream directly via yt-dlp
    if (!url) {
      return NextResponse.json({ error: 'URL o taskId no encontrado' }, { status: 404 });
    }

    const videoId = getYouTubeVideoId(url);
    const target = videoId ? `ytsearch1:${title} audio` : url;

    const { ytdlpPath, ffmpegPath } = await ensureBinaries();

    const ytdlp = spawn(ytdlpPath, [
      '--no-warnings',
      '--extractor-args', 'youtube:player_client=mweb,android,ios,web_creator',
      '--user-agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      '-x', 
      '--audio-format', 'mp3',
      '--audio-quality', '320K',
      '--no-playlist',
      '--ffmpeg-location', ffmpegPath,
      '-o', '-',
      target
    ]);

    const webStream = Readable.toWeb(ytdlp.stdout as any);
    const safeTitle = encodeURIComponent(title.replace(/[^\w\s-]/gi, '').trim());

    return new NextResponse(webStream as any, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': `attachment; filename="${safeTitle}.mp3"; filename*=UTF-8''${safeTitle}.mp3`,
      },
    });

  } catch (error: any) {
    console.error('Download File Error:', error);
    return NextResponse.json({ error: 'Error en el servidor al enviar el archivo' }, { status: 500 });
  }
}
