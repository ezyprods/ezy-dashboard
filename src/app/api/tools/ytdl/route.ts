import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import https from 'https';
import { Readable } from 'stream';

export const maxDuration = 60; // Set max duration for Serverless function

const YTDLP_URL = os.platform() === 'win32' 
  ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
  : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';

const FFMPEG_URL = os.platform() === 'win32'
  ? 'https://github.com/eugeneware/ffmpeg-static/releases/download/b4.4/win32-x64'
  : 'https://github.com/eugeneware/ffmpeg-static/releases/download/b4.4/linux-x64';

const downloadFile = (url: string, dest: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        https.get(response.headers.location!, (redirectResponse) => {
          redirectResponse.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        }).on('error', (err) => {
          fs.unlink(dest, () => reject(err));
        });
      } else {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
};

const ensureBinaries = async () => {
  const tmpDir = os.tmpdir();
  const isWin = os.platform() === 'win32';
  const ytdlpPath = `${tmpDir}/${isWin ? 'yt-dlp.exe' : 'yt-dlp'}`;
  const ffmpegPath = `${tmpDir}/${isWin ? 'ffmpeg.exe' : 'ffmpeg'}`;

  if (!fs.existsSync(ytdlpPath)) {
    console.log('Downloading yt-dlp...');
    await downloadFile(YTDLP_URL, ytdlpPath);
    if (!isWin) fs.chmodSync(ytdlpPath, '755');
  }

  if (!fs.existsSync(ffmpegPath)) {
    console.log('Downloading ffmpeg...');
    await downloadFile(FFMPEG_URL, ffmpegPath);
    if (!isWin) fs.chmodSync(ffmpegPath, '755');
  }

  return { ytdlpPath, ffmpegPath };
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get('url');

    if (!url) {
      return NextResponse.json({ error: 'URL requerida' }, { status: 400 });
    }

    const { ytdlpPath, ffmpegPath } = await ensureBinaries();

    // Spawn yt-dlp to stream mp3 directly to stdout
    const ytdlp = spawn(ytdlpPath, [
      '-x', 
      '--audio-format', 'mp3',
      '--audio-quality', '192K',
      '--ffmpeg-location', ffmpegPath,
      '-o', '-', // output to stdout
      url
    ]);

    let title = 'audio';

    // We can't easily capture the title if we stream straight to stdout, but we can set a generic one
    // We will just let the browser download it.
    
    // Create a web ReadableStream from the child process stdout
    // Using cast to any to bypass TS complaining about Node.js vs DOM ReadableStream
    const stream = Readable.toWeb(ytdlp.stdout) as any;

    ytdlp.stderr.on('data', (data) => {
      console.log(`yt-dlp stderr: ${data}`);
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': `attachment; filename="ezy_audio.mp3"`
      }
    });

  } catch (error: any) {
    console.error('YTDLP Serverless Error:', error);
    return NextResponse.json({ error: error.message || 'Error en el servidor' }, { status: 500 });
  }
}
