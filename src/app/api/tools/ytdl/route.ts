import { NextResponse } from 'next/server';
import { contentDisposition } from '@/lib/serverFiles';
import { downloadVerifiedVideo, downloadUrlViaYtdlp } from './reliable';
import {
  getYouTubeVideoId,
  isSpotifyUrl,
  isSoundCloudUrl,
  getSpotifyTrackMetadata,
  pickBestYouTubeMatch,
} from './engines';

const cleanTitle = (t: string) => t.replace(/[\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || 'audio';

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
        // Spotify's oEmbed endpoint only ever returns the track title, never
        // the artist — searching YouTube with just "Song Name audio" is
        // ambiguous enough to routinely match a completely unrelated video
        // for common titles. getSpotifyTrackMetadata pulls the artist too,
        // and pickBestYouTubeMatch verifies candidates before picking one
        // instead of blindly trusting the first search result.
        const meta = await getSpotifyTrackMetadata(rawUrl);
        title = meta.fullTitle;
        const query = meta.artist ? `${meta.artist.split(',')[0].trim()} ${meta.track}` : `${meta.track} audio`;
        const match = await pickBestYouTubeMatch(query, meta.artist, meta.track);
        videoId = match?.videoId || null;
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
          const author = scOembed.author_name || '';
          title = author ? `${author} - ${scTitle}` : scTitle;
          const query = author ? `${author} ${scTitle}` : scTitle;
          const match = await pickBestYouTubeMatch(query, author, scTitle);
          videoId = match?.videoId || null;
        }
      } catch (e) {}
    }

    // yt-dlp first, SaveTube as fallback; both decoded end to end and
    // checked against the source length, so a song that stops halfway is
    // never handed out (see verify.ts).
    const result = videoId
      ? await downloadVerifiedVideo(videoId, { format: 'mp3', quality: '320' })
      : await downloadUrlViaYtdlp(rawUrl, { format: 'mp3', quality: '320' });

    return new NextResponse(result.buffer as any, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': result.buffer.length.toString(),
        'Content-Disposition': contentDisposition(`${cleanTitle(title)}.mp3`),
        'X-Audio-Duration': result.durationSeconds.toFixed(2),
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
