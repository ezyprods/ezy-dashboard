import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { Readable } from 'stream';
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

    // Stream 320K MP3 directly to stdout via child process pipe
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
      '-', // stdout stream
      target,
    ];

    const ytdlp = spawn(ytdlpPath, args);

    ytdlp.stderr.on('data', (data) => {
      console.log(`[ytdl/stream] ${data}`);
    });

    const stream = Readable.toWeb(ytdlp.stdout) as any;

    const safeTitle = encodeURIComponent(
      title.replace(/[^\w\s\-()]/gi, '').trim() || 'audio'
    );

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': `attachment; filename="${safeTitle}.mp3"; filename*=UTF-8''${safeTitle}.mp3`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    console.error('[ytdl/stream] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error en el servidor' },
      { status: 500 }
    );
  }
}
