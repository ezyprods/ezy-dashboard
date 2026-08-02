import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { tasks, broadcast, completedFileBuffers } from '../state';
import { ensureBinaries } from '../binaries';
import { spawn } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { url, title, thumbnail, platform, resolvedUrl, clientId } = body;

    const taskId = uuidv4();
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

    // Await download execution so serverless function stays alive until MP3 buffer is ready
    await processDownload(taskId);

    return NextResponse.json({ success: true, taskId });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

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

async function processDownload(taskId: string) {
  const task = tasks.get(taskId);
  if (!task) return;

  try {
    const { ytdlpPath, ffmpegPath } = await ensureBinaries();
    
    const safeTitle = task.title.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
    const downloadsDir = os.tmpdir();
    // Use strictly the taskId in outputTemplate to avoid character/parentheses sanitization mismatch
    const outputTemplate = path.join(downloadsDir, `${taskId}.%(ext)s`);

    const videoId = getYouTubeVideoId(task.url);

    const executeDownload = (targetUrl: string) => {
      const args = [
        '--no-warnings',
        '--extractor-args', 'youtube:player_client=mweb,android,ios,web_creator',
        '--user-agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
        targetUrl,
        '--extract-audio',
        '--audio-format', 'mp3',
        '--audio-quality', '320K',
        '--ffmpeg-location', ffmpegPath,
        '--output', outputTemplate,
        '--no-playlist',
        '--progress',
        '--newline'
      ];

      const ytdlp = spawn(ytdlpPath, args);
      let stderrOut = '';

      ytdlp.stdout.on('data', (data) => {
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
        if (output.includes('Extracting audio')) {
          task.status = 'converting';
          broadcast({ type: 'update', task });
        }
      });

      ytdlp.stderr.on('data', (data) => {
        stderrOut += data.toString();
      });

      return new Promise<void>((resolve, reject) => {
        ytdlp.on('close', (code) => {
          if (code === 0) resolve();
          else {
            const errors = stderrOut.split('\n').filter(l => l.includes('ERROR'));
            reject(new Error(errors.length > 0 ? errors[errors.length - 1] : `yt-dlp exited with code ${code}`));
          }
        });
        ytdlp.on('error', reject);
      });
    };

    let downloadTargets: string[] = [];
    if (videoId) {
      downloadTargets = [
        `ytsearch1:${safeTitle} audio`,
        `https://www.youtube.com/watch?v=${videoId}`,
        `ytsearch1:${videoId}`
      ];
    } else {
      downloadTargets = [task.url];
    }

    let success = false;
    let lastErr: any = null;

    for (const targetUrl of downloadTargets) {
      try {
        await executeDownload(targetUrl);
        success = true;
        break;
      } catch (err: any) {
        console.warn(`Download target "${targetUrl}" failed:`, err?.message || err);
        lastErr = err;
      }
    }

    if (!success) {
      throw lastErr || new Error('No se pudo descargar el audio');
    }

    let finalMp3Path = path.join(downloadsDir, `${taskId}.mp3`);

    // Robust file search in downloadsDir if yt-dlp appended an extension or character
    if (!fs.existsSync(finalMp3Path)) {
      try {
        const files = fs.readdirSync(downloadsDir);
        const match = files.find(f => f.includes(taskId) && f.endsWith('.mp3'));
        if (match) {
          finalMp3Path = path.join(downloadsDir, match);
        }
      } catch (e) {}
    }

    if (fs.existsSync(finalMp3Path)) {
      const buffer = await fs.promises.readFile(finalMp3Path);
      if (buffer.length > 0) {
        completedFileBuffers.set(taskId, { buffer, title: task.title });
        try { await fs.promises.unlink(finalMp3Path); } catch (e) {}
      } else {
        throw new Error('El archivo generado tiene 0 bytes');
      }
    } else {
      throw new Error('No se encontró el archivo MP3 generado');
    }

    task.status = 'completed';
    task.progress = 100;
    broadcast({ type: 'update', task });

  } catch (err: any) {
    console.error('Download error:', err);
    task.status = 'error';
    task.error = err.message || 'Error en descarga';
    broadcast({ type: 'update', task });
  }
}
