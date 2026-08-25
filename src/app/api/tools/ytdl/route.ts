import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ensureBinaries } from './binaries';
import { buildCookieArgs } from './cookies';

const execFileAsync = promisify(execFile);

export const maxDuration = 300;

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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const rawUrl = searchParams.get('url') || searchParams.get('resolvedUrl');
    const title = searchParams.get('title') || 'ezy_audio';

    if (!rawUrl) {
      return NextResponse.json({ error: 'URL requerida' }, { status: 400 });
    }

    const { ytdlpPath, ffmpegPath } = await ensureBinaries();
    const videoId = getYouTubeVideoId(rawUrl);
    const target = videoId ? `https://www.youtube.com/watch?v=${videoId}` : rawUrl;

    const tempId = `direct_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const outputTemplate = path.join(os.tmpdir(), `${tempId}.%(ext)s`);
    const cookieArgs = await buildCookieArgs();
    const proxyUrl = process.env.PROXY_URL || process.env.HTTP_PROXY || process.env.HTTPS_PROXY || process.env.YTDL_PROXY;

    const args = [
      '--no-warnings',
      '--no-playlist',
      ...cookieArgs,
      '--extractor-args', 'youtube:player_client=android_music',
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '320K',
      '--ffmpeg-location', ffmpegPath,
      '--output', outputTemplate,
    ];

    if (proxyUrl) {
      args.push('--proxy', proxyUrl);
    }

    args.push(target);

    await execFileAsync(ytdlpPath, args, { timeout: 120000 });

    const expectedMp3 = path.join(os.tmpdir(), `${tempId}.mp3`);
    let foundFile = fs.existsSync(expectedMp3) ? expectedMp3 : null;

    if (!foundFile) {
      const files = fs.readdirSync(os.tmpdir());
      const match = files.find(f => f.startsWith(tempId) && f.endsWith('.mp3'));
      if (match) foundFile = path.join(os.tmpdir(), match);
    }

    if (!foundFile || !fs.existsSync(foundFile)) {
      throw new Error('No se pudo generar el archivo MP3');
    }

    const buffer = await fs.promises.readFile(foundFile);
    try { await fs.promises.unlink(foundFile); } catch (e) {}

    const safeTitle = encodeURIComponent(
      title.replace(/[^\w\s\-()]/gi, '').trim() || 'audio'
    );

    return new NextResponse(buffer as any, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': buffer.length.toString(),
        'Content-Disposition': `attachment; filename="${safeTitle}.mp3"; filename*=UTF-8''${safeTitle}.mp3`,
      },
    });
  } catch (error: any) {
    console.error('[ytdl/direct] Error:', error?.message || error);
    return NextResponse.json(
      { error: error.message || 'Error en el servidor' },
      { status: 500 }
    );
  }
}
