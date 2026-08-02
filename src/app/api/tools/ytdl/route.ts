import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import https from 'https';
import { Readable } from 'stream';

import { ensureBinaries } from './binaries';

export const maxDuration = 60; // Set max duration for Serverless function


export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const rawUrl = searchParams.get('url') || searchParams.get('resolvedUrl');
    const title = searchParams.get('title') || 'ezy_audio';

    if (!rawUrl) {
      return NextResponse.json({ error: 'URL requerida' }, { status: 400 });
    }

    let target = rawUrl;
    try {
      const parsed = new URL(rawUrl);
      if (parsed.hostname.includes('youtube.com') && parsed.searchParams.has('v')) {
        target = `ytsearch1:${parsed.searchParams.get('v')}`;
      } else if (parsed.hostname.includes('youtu.be')) {
        const id = parsed.pathname.replace(/^\//, '');
        if (id) target = `ytsearch1:${id}`;
      }
    } catch(e) {}

    const { ytdlpPath, ffmpegPath } = await ensureBinaries();

    // Spawn yt-dlp to stream mp3 directly to stdout
    const ytdlp = spawn(ytdlpPath, [
      '--no-warnings',
      '--extractor-args', 'youtube:player_client=mweb,android,ios,web_creator',
      '--user-agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      '-x', 
      '--audio-format', 'mp3',
      '--audio-quality', '192K',
      '--no-playlist',
      '--ffmpeg-location', ffmpegPath,
      '-o', '-', // output to stdout
      target
    ]);
    
    // Create a web ReadableStream from the child process stdout
    // Using cast to any to bypass TS complaining about Node.js vs DOM ReadableStream
    const stream = Readable.toWeb(ytdlp.stdout) as any;

    ytdlp.stderr.on('data', (data) => {
      console.log(`yt-dlp stderr: ${data}`);
    });

    // Make sure title is safe for HTTP headers
    const safeTitle = encodeURIComponent(title.replace(/[^\w\s-]/gi, '').trim());

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': `attachment; filename="${safeTitle}.mp3"; filename*=UTF-8''${safeTitle}.mp3`
      }
    });

  } catch (error: any) {
    console.error('YTDLP Serverless Error:', error);
    return NextResponse.json({ error: error.message || 'Error en el servidor' }, { status: 500 });
  }
}
