import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import { writeFile, unlink, readFile } from 'fs/promises';
import { contentDisposition, resolveFfmpegPath, uniqueTempPath } from '@/lib/serverFiles';

export const maxDuration = 120;

const MIME_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
};

export async function POST(req: NextRequest) {
  let inputPath: string | null = null;
  let outputPath: string | null = null;

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const startTime = parseFloat(formData.get('startTime') as string);
    const endTime = parseFloat(formData.get('endTime') as string);
    const format = ((formData.get('format') as string) || 'mp3').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp3';

    if (!file || isNaN(startTime) || isNaN(endTime)) {
      return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 });
    }
    if (endTime <= startTime || startTime < 0) {
      return NextResponse.json({ error: 'El rango de recorte no es válido' }, { status: 400 });
    }

    inputPath = uniqueTempPath(file.name, '_in');
    outputPath = uniqueTempPath(`out.${format}`, '_out');
    await writeFile(inputPath, Buffer.from(await file.arrayBuffer()));

    const ffmpegPath = await resolveFfmpegPath();
    const args = ['-i', inputPath, '-ss', String(startTime), '-to', String(endTime), '-y', '-vn'];

    const ext = path.extname(file.name).slice(1).toLowerCase();
    if (ext === format) {
      args.push('-c', 'copy');
    } else if (format === 'mp3') {
      args.push('-codec:a', 'libmp3lame', '-qscale:a', '0');
    }
    args.push(outputPath);

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(ffmpegPath, args);
      let stderr = '';
      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else {
          console.error('[trim] FFmpeg failed:', stderr.slice(-300));
          reject(new Error('Error al cortar el audio'));
        }
      });
      proc.on('error', (err) => reject(new Error(err.message)));
    });

    const output = await readFile(outputPath);
    const baseName = path.parse(file.name).name || 'audio';
    const outputName = `${baseName}_recorte.${format}`;

    // The trimmed file is returned to the browser (works both locally and on Vercel)
    return new NextResponse(output as any, {
      status: 200,
      headers: {
        'Content-Type': MIME_TYPES[format] || 'application/octet-stream',
        'Content-Length': output.length.toString(),
        'Content-Disposition': contentDisposition(outputName),
        'X-Output-Filename': encodeURIComponent(outputName),
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Error al cortar' }, { status: 500 });
  } finally {
    if (inputPath) await unlink(inputPath).catch(() => {});
    if (outputPath) await unlink(outputPath).catch(() => {});
  }
}
