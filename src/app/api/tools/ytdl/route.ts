import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ensureBinaries } from './binaries';
import { buildCookieArgs } from './cookies';
import {
  downloadWithEngines,
  getYouTubeVideoId,
  isYouTubeUrl,
  isSpotifyUrl,
  isSoundCloudUrl,
  searchYouTubeFirstVideoId,
} from './engines';

const execFileAsync = promisify(execFile);

export const maxDuration = 300;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const rawUrl = searchParams.get('url') || searchParams.get('resolvedUrl');
    let title = searchParams.get('title') || 'ezy_audio';

    if (!rawUrl) {
      return NextResponse.json({ error: 'URL requerida' }, { status: 400 });
    }

    let videoId = getYouTubeVideoId(rawUrl);

    // If Spotify link
    if (!videoId && isSpotifyUrl(rawUrl)) {
      if (rawUrl.includes('/playlist/') || rawUrl.includes('/album/')) {
        return NextResponse.json(
          { error: 'Las listas de Spotify deben descargarse desde el Descargador completo.' },
          { status: 400 }
        );
      }
      try {
        const spotOembed = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(rawUrl)}`).then(r => r.json());
        if (spotOembed.title) {
          title = spotOembed.title;
          videoId = await searchYouTubeFirstVideoId(`${spotOembed.title} audio`);
        }
      } catch (e) {}
    }

    // If SoundCloud link
    if (!videoId && isSoundCloudUrl(rawUrl)) {
      if (rawUrl.includes('/sets/')) {
        return NextResponse.json(
          { error: 'Las listas de SoundCloud deben descargarse desde el Descargador completo.' },
          { status: 400 }
        );
      }
      try {
        const scOembed = await fetch(`https://soundcloud.com/oembed?url=${encodeURIComponent(rawUrl)}&format=json`).then(r => r.json());
        if (scOembed.title) {
          const scTitle = (scOembed.title || '').replace(/by.*$/i, '').trim();
          title = scOembed.author_name ? `${scOembed.author_name} - ${scTitle}` : scTitle;
          videoId = await searchYouTubeFirstVideoId(title);
        }
      } catch (e) {}
    }

    // Primary: Multi-engine API system
    if (videoId) {
      try {
        const result = await downloadWithEngines(videoId);
        const safeTitle = encodeURIComponent(
          title.replace(/[^\w\s\-()]/gi, '').trim() || 'audio'
        );
        return new NextResponse(result.buffer as any, {
          headers: {
            'Content-Type': 'audio/mpeg',
            'Content-Length': result.buffer.length.toString(),
            'Content-Disposition': `attachment; filename="${safeTitle}.mp3"; filename*=UTF-8''${safeTitle}.mp3`,
          },
        });
      } catch (e: any) {
        console.warn('[ytdl/direct] Multi-engine failed in GET:', e?.message);
      }
    }

    // Fallback: yt-dlp binary (for other URLs)
    const target = rawUrl;
    const { ytdlpPath, ffmpegPath } = await ensureBinaries();
    const tempId = `direct_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const outputTemplate = path.join(os.tmpdir(), `${tempId}.%(ext)s`);
    const cookieArgs = await buildCookieArgs();
    const proxyUrl = process.env.PROXY_URL || process.env.HTTP_PROXY || process.env.HTTPS_PROXY || process.env.YTDL_PROXY;
    const nodePath = process.execPath || 'node';

    const args = [
      '--no-warnings',
      '--no-playlist',
      '--no-check-certificates',
      '--geo-bypass',
      '--js-runtimes',
      `node:${nodePath}`,
      ...cookieArgs,
      '-f',
      'ba/ba*/bestaudio/b/best',
      '-x',
      '--audio-format',
      'mp3',
      '--audio-quality',
      '320K',
      '--ffmpeg-location',
      ffmpegPath,
      '--output',
      outputTemplate,
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
