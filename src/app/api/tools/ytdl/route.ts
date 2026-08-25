import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { ensureBinaries } from './binaries';
import { buildCookieArgs } from './cookies';

export const maxDuration = 300;

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
        target = `https://www.youtube.com/watch?v=${parsed.searchParams.get('v')}`;
      } else if (parsed.hostname.includes('youtu.be')) {
        const id = parsed.pathname.replace(/^\//, '').split('?')[0];
        if (id) target = `https://www.youtube.com/watch?v=${id}`;
      }
    } catch (e) {}

    const { ytdlpPath, ffmpegPath } = await ensureBinaries();
    const cookieArgs = await buildCookieArgs();

    const args = [
      '--no-warnings',
      '--no-playlist',
      ...cookieArgs,
      '--extract-audio',
      '--audio-format',
      'mp3',
      '--audio-quality',
      '320K',
      '--ffmpeg-location',
      ffmpegPath,
      '-o',
      '-',
      target,
    ];

    const ytdlp = spawn(ytdlpPath, args);

    const safeTitle = encodeURIComponent(
      title.replace(/[^\w\s\-()]/gi, '').trim() || 'audio'
    );

    // Use Web TransformStream to ensure Vercel Serverless stream stays open
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    ytdlp.stdout.on('data', async (chunk: Buffer) => {
      try {
        await writer.write(new Uint8Array(chunk));
      } catch (e) {}
    });

    ytdlp.stderr.on('data', (d: Buffer) => {
      console.log(`[ytdl/stream] ${d.toString()}`);
    });

    ytdlp.on('close', async () => {
      try {
        await writer.close();
      } catch (e) {}
    });

    ytdlp.on('error', async (err) => {
      console.error('[ytdl/stream] Spawn error:', err);
      try {
        await writer.abort(err);
      } catch (e) {}
    });

    return new NextResponse(readable, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': `attachment; filename="${safeTitle}.mp3"; filename*=UTF-8''${safeTitle}.mp3`,
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error: any) {
    console.error('[ytdl/stream] Fatal Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error en el servidor' },
      { status: 500 }
    );
  }
}
