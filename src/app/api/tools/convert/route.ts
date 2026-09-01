import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { writeFile, unlink } from 'fs/promises';
import { ensureBinaries } from '../ytdl/binaries';

export const maxDuration = 120;

const MIME_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  aac: 'audio/aac',
};

export async function POST(req: NextRequest) {
  let inputPath: string | null = null;
  let outputPath: string | null = null;

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const format = ((formData.get('format') as string) || 'mp3').toLowerCase().trim();
    const quality = (formData.get('quality') as string) || '320';

    if (!file || file.size === 0) {
      return NextResponse.json(
        { error: 'El archivo está vacío o no se ha proporcionado' },
        { status: 400 }
      );
    }

    // Ensure temporary processing directory exists
    const tempDir = path.join(os.tmpdir(), 'ezy_converter');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const fileId = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const originalExt = path.extname(file.name || 'audio.wav') || '.wav';
    inputPath = path.join(tempDir, `in_${fileId}${originalExt}`);
    outputPath = path.join(tempDir, `out_${fileId}.${format}`);

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(inputPath, buffer);

    // Resolve FFmpeg binary for current OS / Vercel Serverless
    let ffmpegPath: string;
    try {
      const binaries = await ensureBinaries();
      ffmpegPath = binaries.ffmpegPath;
    } catch {
      try {
        ffmpegPath = require('ffmpeg-static') || 'ffmpeg';
      } catch {
        ffmpegPath = 'ffmpeg';
      }
    }

    const args = ['-i', inputPath, '-vn', '-y'];

    switch (format) {
      case 'mp3': {
        const q = quality === '320' ? '0' : (quality === '256' ? '2' : (quality === '192' ? '5' : '7'));
        args.push('-codec:a', 'libmp3lame', '-qscale:a', q);
        break;
      }
      case 'wav':
        args.push('-codec:a', 'pcm_s16le');
        break;
      case 'flac':
        args.push('-codec:a', 'flac');
        break;
      case 'm4a':
      case 'aac':
        args.push('-codec:a', 'aac', '-b:a', `${quality}k`);
        break;
      case 'ogg':
        args.push('-codec:a', 'libvorbis', '-q:a', '6');
        break;
      default:
        args.push('-codec:a', 'libmp3lame', '-b:a', '320k');
        break;
    }

    args.push(outputPath);

    // Execute FFmpeg conversion
    await new Promise<void>((resolve, reject) => {
      const ffmpegProc = spawn(ffmpegPath, args);
      let stderrOutput = '';

      ffmpegProc.stderr.on('data', (chunk) => {
        stderrOutput += chunk.toString();
      });

      ffmpegProc.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath!)) {
          resolve();
        } else {
          console.error('[convert/route] FFmpeg failed. Exit code:', code, 'Stderr:', stderrOutput.slice(-300));
          reject(new Error('No se pudo procesar el archivo. Asegúrate de que es un archivo de audio válido.'));
        }
      });

      ffmpegProc.on('error', (err) => {
        console.error('[convert/route] FFmpeg spawn error:', err.message);
        reject(new Error(`Error al ejecutar conversor: ${err.message}`));
      });
    });

    // Read converted file buffer
    const outputBuffer = await fs.promises.readFile(outputPath);

    // Build clean download filename
    const originalBaseName = path.parse(file.name || 'audio').name || 'audio';
    const cleanBaseName = originalBaseName.replace(/[/\\?%*:|"<>]/g, '').trim() || 'audio';
    const outputFilename = `${cleanBaseName}_converted.${format}`;
    const safeAsciiFilename = cleanBaseName.replace(/[^\w\s\-().]/gi, '').trim() || 'audio_converted';
    const safeUtf8Filename = encodeURIComponent(outputFilename);

    const mimeType = MIME_TYPES[format] || 'application/octet-stream';

    return new NextResponse(outputBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': outputBuffer.length.toString(),
        'Content-Disposition': `attachment; filename="${safeAsciiFilename}.${format}"; filename*=UTF-8''${safeUtf8Filename}`,
        'X-Converted-Filename': safeUtf8Filename,
        'X-Converted-Format': format,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });

  } catch (err: any) {
    console.error('[convert/route] Error:', err?.message || err);
    return NextResponse.json(
      { error: err.message || 'Error en el servidor al convertir el audio' },
      { status: 500 }
    );
  } finally {
    // Ensure temporary files are always cleaned up
    if (inputPath) {
      await unlink(inputPath).catch(() => {});
    }
    if (outputPath) {
      await unlink(outputPath).catch(() => {});
    }
  }
}
