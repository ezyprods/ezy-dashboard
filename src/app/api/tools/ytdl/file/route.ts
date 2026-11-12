import { NextResponse } from 'next/server';
import { tasks, completedFileBuffers } from '../state';
import { contentDisposition } from '@/lib/serverFiles';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  getYouTubeVideoId,
  isSpotifyUrl,
  isSoundCloudUrl,
  getSpotifyTrackMetadata,
  pickBestYouTubeMatch,
} from '../engines';

import { downloadVerifiedVideo, downloadUrlViaYtdlp } from '../reliable';
import { AudioProcessOptions } from '../processor';

export const maxDuration = 300;

const AUDIO_EXTS = ['.mp3', '.m4a', '.webm', '.opus', '.aac', '.ogg', '.wav', '.flac'];

const MIME_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
};

// Only the final file /process writes (`<taskId>.<ext>`), never an
// intermediate or half-written file that merely starts with the same id.
function findAudioFileInTmpDir(id: string): string | null {
  for (const ext of AUDIO_EXTS) {
    const candidate = path.join(os.tmpdir(), `${id}${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId');
    const paramUrl = searchParams.get('url');
    const paramTitle = searchParams.get('title') || 'audio';
    const paramFormat = searchParams.get('format') || 'mp3';

    const task = taskId ? tasks.get(taskId) : null;
    const title = task?.title || paramTitle;

    // 1. In-memory buffer check
    if (taskId && completedFileBuffers.has(taskId)) {
      const cached = completedFileBuffers.get(taskId)!;
      const fileExt = cached.format || task?.format || paramFormat || 'mp3';
      const mimeType = cached.mimeType || MIME_TYPES[fileExt] || 'audio/mpeg';
      const cleanSafeTitle = (cached.title || title).replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || 'audio';

      return new NextResponse(cached.buffer as any, {
        headers: {
          'Content-Type': mimeType,
          'Content-Length': cached.buffer.length.toString(),
          'Content-Disposition': contentDisposition(`${cleanSafeTitle}.${fileExt}`),
          'Cache-Control': 'public, max-age=3600',
          ...(cached.durationSeconds ? { 'X-Audio-Duration': cached.durationSeconds.toFixed(2) } : {}),
        },
      });
    }

    // 2. Local disk check
    const diskPath = taskId ? findAudioFileInTmpDir(taskId) : null;
    if (diskPath) {
      const fileExt = path.extname(diskPath).replace(/^\./, '') || paramFormat || 'mp3';
      const mimeType = MIME_TYPES[fileExt] || 'audio/mpeg';
      const cleanSafeTitle = title.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || 'audio';
      const buffer = await fs.promises.readFile(diskPath);

      if (buffer.length > 0) {
        return new NextResponse(buffer as any, {
          headers: {
            'Content-Type': mimeType,
            'Content-Length': buffer.length.toString(),
            'Content-Disposition': contentDisposition(`${cleanSafeTitle}.${fileExt}`),
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }
    }

    // 3. On-demand generation fallback
    const url = task?.resolvedUrl || task?.url || paramUrl;
    if (!url) {
      return NextResponse.json(
        { error: 'URL o taskId no encontrado' },
        { status: 404 }
      );
    }

    let videoId = getYouTubeVideoId(url);

    // Spotify fallback resolution (only reached if the task's in-memory/disk
    // cache expired or was never populated by /process). Same fix as the
    // other entry points: fetch the artist via getSpotifyTrackMetadata
    // (Spotify's oEmbed alone never includes it) and verify candidates
    // against it via pickBestYouTubeMatch instead of trusting the first
    // unvalidated search result — that mismatch was the root cause of
    // "downloads incorrect audios" for Spotify links.
    if (!videoId && isSpotifyUrl(url)) {
      try {
        const meta = await getSpotifyTrackMetadata(url);
        const query = meta.artist ? `${meta.artist.split(',')[0].trim()} ${meta.track}` : `${meta.track} audio`;
        const match = await pickBestYouTubeMatch(query, meta.artist, meta.track);
        videoId = match?.videoId || null;
      } catch (e) {}
    }

    // SoundCloud fallback resolution
    if (!videoId && isSoundCloudUrl(url)) {
      try {
        const scOembed = await fetch(`https://soundcloud.com/oembed?url=${encodeURIComponent(url)}&format=json`).then(r => r.json());
        if (scOembed.title) {
          const scTitle = (scOembed.title || '').replace(/by.*$/i, '').trim();
          const author = scOembed.author_name || '';
          const q = author ? `${author} ${scTitle}` : scTitle;
          const match = await pickBestYouTubeMatch(q, author, scTitle);
          videoId = match?.videoId || null;
        }
      } catch (e) {}
    }

    // Regenerate (the task ran on another server instance or expired).
    // Same verified pipeline as /process: a partial song is never served.
    const options: AudioProcessOptions = {
      format: (task?.format || paramFormat || 'mp3') as AudioProcessOptions['format'],
      quality: (task?.quality || '320') as AudioProcessOptions['quality'],
    };
    const result = videoId
      ? await downloadVerifiedVideo(videoId, options)
      : await downloadUrlViaYtdlp(url, options);

    const cleanSafeTitle = title.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || 'audio';
    return new NextResponse(result.buffer as any, {
      headers: {
        'Content-Type': result.mimeType,
        'Content-Length': result.buffer.length.toString(),
        'Content-Disposition': contentDisposition(`${cleanSafeTitle}.${result.format}`),
        'X-Audio-Duration': result.durationSeconds.toFixed(2),
      },
    });

  } catch (error: any) {
    console.error('[ytdl/file] Error:', error?.message || error);
    return NextResponse.json(
      { error: error.message || 'Error en el servidor al enviar el archivo' },
      { status: 500 }
    );
  }
}
