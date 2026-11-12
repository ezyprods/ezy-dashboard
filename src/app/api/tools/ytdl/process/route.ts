import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { tasks, broadcast, completedFileBuffers } from '../state';
import {
  getYouTubeVideoId,
  isSpotifyUrl,
  searchYouTubeVideoIds,
  pickBestYouTubeMatch,
  getSpotifyTrackMetadata,
} from '../engines';
import { isUnresolvedSpotifyTitle } from '../spotify_playlist';
import { AudioProcessOptions } from '../processor';
import { downloadVerifiedVideo, downloadUrlViaYtdlp } from '../reliable';
import os from 'os';
import path from 'path';
import fs from 'fs';

// Critical: Vercel default is 10s. Downloads need up to 5min on Pro plan.
export const maxDuration = 300;

export async function POST(req: Request) {
  const body = await req.json();
  const {
    url,
    title,
    thumbnail,
    platform,
    resolvedUrl,
    clientId,
    taskId: passedTaskId,
    format = 'mp3',
    quality = '320',
    normalize = false,
    trimSilence = false,
  } = body;

  const taskId = passedTaskId || uuidv4();
  const task = {
    id: taskId,
    clientId: clientId || 'anonymous',
    url: resolvedUrl || url,
    title: title || 'Audio',
    thumbnail,
    platform,
    format,
    quality,
    status: 'downloading' as const,
    progress: 0,
    startTime: Date.now(),
  };

  tasks.set(taskId, task);
  broadcast({ type: 'update', task });

  try {
    await processDownload(taskId, { format, quality, normalize, trimSilence });
    // The title may have been resolved during processing (bulk-pasted Spotify links).
    return NextResponse.json({ success: true, taskId, title: task.title, thumbnail: task.thumbnail });
  } catch (error: any) {
    console.error('[ytdl/process] Fatal error:', error?.message || error);
    return NextResponse.json(
      { error: error.message || 'Error en descarga' },
      { status: 500 }
    );
  }
}

async function processDownload(taskId: string, options: AudioProcessOptions) {
  const task = tasks.get(taskId);
  if (!task) throw new Error('Task not found');

  try {
    const downloadsDir = os.tmpdir();
    let videoIdsToTry: string[] = [];

    const existingVideoId = getYouTubeVideoId(task.url);
    if (existingVideoId) {
      videoIdsToTry.push(existingVideoId);
    }

    // If Spotify or SoundCloud track, resolve candidate YouTube video IDs.
    // This is the path taken when downloading individual tracks from inside
    // a Spotify/SoundCloud PLAYLIST (single-track downloads are already
    // resolved to a specific videoId beforehand by /analyse). It used to
    // just grab whichever of 3 raw search candidates happened to download
    // successfully first, with no check that the audio actually matched the
    // track — the same root cause behind "downloads incorrect audios" for
    // Spotify links. task.title is "Artist - Track" (set from the playlist
    // metadata), so split it to verify candidates against the artist too.
    if (videoIdsToTry.length === 0 && (isSpotifyUrl(task.url) || task.url.includes('soundcloud.com') || !task.url.startsWith('http'))) {
      // Bulk-pasted Spotify links the analyser ran out of time to resolve
      // arrive with a placeholder title — fetch the real "Artist - Track" now.
      if (isSpotifyUrl(task.url) && isUnresolvedSpotifyTitle(task.title)) {
        const meta = await getSpotifyTrackMetadata(task.url);
        task.title = meta.fullTitle;
        task.thumbnail = task.thumbnail || meta.thumbnail;
        broadcast({ type: 'update', task });
      }

      const dashIdx = task.title.indexOf(' - ');
      const expectedArtist = dashIdx > 0 ? task.title.slice(0, dashIdx).trim() : '';
      const expectedTrack = dashIdx > 0 ? task.title.slice(dashIdx + 3).trim() : task.title;
      const query = `${task.title} audio`;

      const best = await pickBestYouTubeMatch(query, expectedArtist, expectedTrack);
      const rawCandidates = await searchYouTubeVideoIds(query, 3);

      // Try the verified best match first, then fall back to the other raw
      // candidates (in case the best match is unavailable for a technical
      // reason, e.g. region-locked or removed).
      const ordered = best ? [best.videoId, ...rawCandidates.filter(id => id !== best.videoId)] : rawCandidates;
      videoIdsToTry.push(...ordered);
    }

    // =========================================================================
    // MULTI-ENGINE ATTEMPTS ACROSS CANDIDATE VIDEO IDS
    //
    // Quality strategy:
    //   PRIMARY   → yt-dlp bestaudio → FFmpeg → MP3
    //               Downloads native YouTube stream (opus/m4a) and converts
    //               once. Single generation of lossy encoding = best possible.
    //   FALLBACK  → SaveTube engine
    //               External CDN that re-encodes YouTube audio. Results in
    //               two generations of lossy encoding ("fake 320k") but is
    //               a useful safety net when yt-dlp is blocked/unavailable.
    // =========================================================================
    if (videoIdsToTry.length > 0) {
      task.status = 'downloading';
      task.progress = 15;
      broadcast({ type: 'update', task });

      let lastEngineErr: any = null;

      for (let i = 0; i < videoIdsToTry.length; i++) {
        const vid = videoIdsToTry[i];
        try {
          console.log(`[ytdl/process] [${i + 1}/${videoIdsToTry.length}] videoId=${vid} taskId=${taskId}`);
          // yt-dlp first, SaveTube as fallback; both verified end to end, so
          // a song that stops halfway is rejected instead of delivered.
          const processed = await downloadVerifiedVideo(vid, options, {
            onProgress: (progress) => {
              const mapped = Math.min(progress * 0.7 + 15, 85); // map 0-100 → 15-85
              if (mapped > task.progress) {
                task.progress = mapped;
                broadcast({ type: 'update', task });
              }
            },
            onConverting: () => {
              task.status = 'converting';
              broadcast({ type: 'update', task });
            },
          });

          await saveCompletedTask(taskId, task, processed, downloadsDir);
          console.log(`[ytdl/process] SUCCESS taskId=${taskId} engine=${processed.engine} format=${processed.format} size=${processed.buffer.length} duration=${processed.durationSeconds.toFixed(1)}s`);
          return;
        } catch (err: any) {
          console.warn(`[ytdl/process] videoId=${vid} failed:`, err?.message || err);
          lastEngineErr = err;
        }
      }

      if (isSpotifyUrl(task.url) || !task.url.startsWith('http')) {
        throw new Error(lastEngineErr?.message || 'No se pudo descargar el audio tras intentar múltiples fuentes');
      }
    }

    // =========================================================================
    // FALLBACK: yt-dlp binary for direct media URLs (non-Spotify, non-search)
    // =========================================================================
    if (isSpotifyUrl(task.url)) {
      throw new Error('No se pudo encontrar una fuente de audio disponible para esta pista de Spotify');
    }

    task.progress = 0;
    task.status = 'downloading';
    broadcast({ type: 'update', task });

    let lastErr: Error | null = null;
    for (const useCookies of [true, false]) {
      try {
        const processed = await downloadUrlViaYtdlp(task.url, options, {
          useCookies,
          onProgress: (progress) => {
            if (progress > task.progress) {
              task.progress = Math.min(progress, 95);
              broadcast({ type: 'update', task });
            }
          },
          onConverting: () => {
            task.status = 'converting';
            broadcast({ type: 'update', task });
          },
        });
        await saveCompletedTask(taskId, task, processed, downloadsDir);
        return;
      } catch (err: any) {
        lastErr = err;
      }
    }

    throw new Error(lastErr?.message || 'Todos los métodos de descarga fallaron');

  } catch (err: any) {
    console.error('[ytdl/process] Download error:', err?.message || err);
    task.status = 'error';
    task.error = err.message || 'Error en descarga';
    broadcast({ type: 'update', task });
    throw err;
  }
}

/**
 * Saves a completed download to disk and registers it in the in-memory store.
 */
async function saveCompletedTask(
  taskId: string,
  task: ReturnType<typeof tasks.get> & object,
  processed: { buffer: Buffer; format: string; mimeType: string; durationSeconds?: number },
  downloadsDir: string,
) {
  const finalExt = processed.format || 'mp3';
  const expectedFile = path.join(downloadsDir, `${taskId}.${finalExt}`);
  await fs.promises.writeFile(expectedFile, processed.buffer);

  completedFileBuffers.set(taskId, {
    buffer: processed.buffer,
    title: (task as any).title,
    format: finalExt,
    mimeType: processed.mimeType,
    durationSeconds: processed.durationSeconds,
  });

  (task as any).downloadPath = expectedFile;
  (task as any).status = 'completed';
  (task as any).progress = 100;
  broadcast({ type: 'update', task });

  // Clean up after 10 minutes
  setTimeout(async () => {
    try {
      if (fs.existsSync(expectedFile)) await fs.promises.unlink(expectedFile);
      completedFileBuffers.delete(taskId);
    } catch (e) {}
  }, 10 * 60 * 1000);
}
