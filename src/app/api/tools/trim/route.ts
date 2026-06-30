import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import { writeFile, unlink } from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';

let ffmpegPath: string;
try {
  ffmpegPath = require('ffmpeg-static') || 'ffmpeg';
} catch (e) {
  ffmpegPath = 'ffmpeg';
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const startTime = formData.get('startTime') as string;
    const endTime = formData.get('endTime') as string;
    const format = formData.get('format') as string || 'mp3';

    if (!file || !startTime || !endTime) {
      return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 });
    }

    const tempDir = path.join(os.tmpdir(), 'ezy_audio_tools');
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    // Save uploaded file temporarily
    const inputPath = path.join(tempDir, file.name);
    await writeFile(inputPath, buffer);

    const downloadsDir = path.join(os.homedir(), 'Downloads');
    const baseName = path.parse(file.name).name;
    const outputName = `${baseName}_recorte.${format}`;
    const outputPath = path.join(downloadsDir, outputName);

    const args = ['-i', inputPath, '-ss', startTime, '-to', endTime, '-y'];

    const ext = path.extname(file.name).slice(1);
    if (ext === format) {
      args.push('-c', 'copy');
    } else {
      if (format === 'mp3') {
        args.push('-codec:a', 'libmp3lame', '-qscale:a', '0');
      }
    }

    args.push(outputPath);

    return new Promise((resolve) => {
      const ffmpegProc = spawn(ffmpegPath, args);

      ffmpegProc.on('close', async (code) => {
        // Cleanup temp file
        await unlink(inputPath).catch(() => {});
        
        if (code === 0) {
          resolve(NextResponse.json({ success: true, path: outputPath, name: outputName }));
        } else {
          resolve(NextResponse.json({ error: 'Error al cortar' }, { status: 500 }));
        }
      });

      ffmpegProc.on('error', async (err) => {
        await unlink(inputPath).catch(() => {});
        resolve(NextResponse.json({ error: err.message }, { status: 500 }));
      });
    });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
