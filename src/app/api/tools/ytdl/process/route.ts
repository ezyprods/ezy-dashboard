import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { tasks, broadcast } from '../state';
import { ensureBinaries } from '../binaries';
import { spawn } from 'child_process';
import os from 'os';
import path from 'path';

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

    // Iniciar proceso asíncrono y responder de inmediato
    processDownload(taskId).catch(console.error);

    return NextResponse.json({ success: true, taskId });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function processDownload(taskId: string) {
  const task = tasks.get(taskId);
  if (!task) return;

  try {
    const { ytdlpPath, ffmpegPath } = await ensureBinaries();
    
    const safeTitle = task.title.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
    // Use tmpdir so it works on Vercel and keeps admin Downloads clean
    const downloadsDir = os.tmpdir();
    const outputTemplate = path.join(downloadsDir, `${safeTitle}_${taskId}.%(ext)s`);

    const args = [
      task.url,
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

    await new Promise<void>((resolve, reject) => {
      ytdlp.on('close', (code) => {
        if (code === 0) resolve();
        else {
          const errors = stderrOut.split('\n').filter(l => l.includes('ERROR'));
          reject(new Error(errors.length > 0 ? errors[errors.length - 1] : `yt-dlp exited with code ${code}`));
        }
      });
      ytdlp.on('error', reject);
    });

    task.status = 'completed';
    task.progress = 100;
    // El archivo final se genera con la extensión .mp3
    task.downloadPath = path.join(downloadsDir, `${safeTitle}_${taskId}.mp3`);
    
    broadcast({ type: 'update', task });

  } catch (err: any) {
    console.error('Download error:', err);
    task.status = 'error';
    task.error = err.message || 'Error en descarga';
    broadcast({ type: 'update', task });
  }
}
