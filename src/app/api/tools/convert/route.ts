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
    const format = formData.get('format') as string;
    const quality = formData.get('quality') as string || '320';

    if (!file) {
      return NextResponse.json({ error: 'No se proporcionó archivo' }, { status: 400 });
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
    const outputName = `${baseName}_converted.${format}`;
    const outputPath = path.join(downloadsDir, outputName);

    const args = ['-i', inputPath, '-y'];

    switch (format) {
      case 'mp3':
        const q = quality === '320' ? '0' : (quality === '192' ? '5' : '9');
        args.push('-codec:a', 'libmp3lame', '-qscale:a', q);
        break;
      case 'wav':
        args.push('-codec:a', 'pcm_s16le');
        break;
      case 'flac':
        args.push('-codec:a', 'flac');
        break;
      case 'm4a':
        args.push('-codec:a', 'aac', '-b:a', `${quality}k`);
        break;
      case 'ogg':
        args.push('-codec:a', 'libvorbis', '-q:a', '6');
        break;
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
          resolve(NextResponse.json({ error: 'Error en la conversión' }, { status: 500 }));
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
