/**
 * YouTube Playlist Resolution Engine
 * 
 * Uses YouTube's InnerTube API to extract full track listings and metadata
 * from public YouTube playlists without requiring credentials or triggering bot checks.
 */

export interface PlaylistTrack {
  videoId: string;
  url: string;
  title: string;
  thumbnail: string;
  duration?: string;
}

export interface PlaylistInfo {
  id: string;
  title: string;
  trackCount: number;
  thumbnail?: string;
  tracks: PlaylistTrack[];
}

export function extractPlaylistId(urlStr: string): string | null {
  try {
    const parsed = new URL(urlStr);
    const list = parsed.searchParams.get('list');
    if (list) return list;
  } catch (e) {
    const match = urlStr.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    if (match) return match[1];
  }
  return null;
}

export function isRadioOrMix(listId: string): boolean {
  return listId.startsWith('RD') || listId.startsWith('UL') || listId.startsWith('TL');
}

export async function fetchYouTubePlaylist(playlistId: string): Promise<PlaylistInfo | null> {
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/browse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        'X-YouTube-Client-Name': '1',
        'X-YouTube-Client-Version': '2.20240301.00.00',
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20240301.00.00',
            hl: 'es',
            gl: 'ES',
          },
        },
        browseId: 'VL' + playlistId,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;

    const data = await res.json();
    
    // Extract playlist title & thumbnail from header/metadata
    let playlistTitle = 'Lista de Reproducción';
    let playlistThumb = '';

    const header = data.header?.playlistHeaderRenderer || data.header?.pageHeaderRenderer;
    if (header) {
      playlistTitle = header.title?.simpleText || header.pageTitle || playlistTitle;
    }

    if (data.metadata?.playlistMetadataRenderer?.title) {
      playlistTitle = data.metadata.playlistMetadataRenderer.title;
    }

    const tracks: PlaylistTrack[] = [];
    const seen = new Set<string>();

    function scan(obj: any) {
      if (!obj || typeof obj !== 'object') return;

      // Format 1: lockupViewModel (Modern YouTube web)
      if (obj.lockupViewModel) {
        const lockup = obj.lockupViewModel;
        const videoId = lockup.contentId;
        if (videoId && typeof videoId === 'string' && videoId.length === 11 && !seen.has(videoId)) {
          seen.add(videoId);
          const rawTitle = lockup.metadata?.lockupMetadataViewModel?.title?.content || 'Audio';
          const author = lockup.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.text?.content || '';
          const cleanTitle = author && !rawTitle.toLowerCase().includes(author.toLowerCase())
            ? `${author} - ${rawTitle}`
            : rawTitle;
          const thumb = lockup.contentImage?.thumbnailViewModel?.image?.sources?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
          
          if (!playlistThumb) playlistThumb = thumb;

          tracks.push({
            videoId,
            url: `https://www.youtube.com/watch?v=${videoId}`,
            title: cleanTitle,
            thumbnail: thumb,
          });
        }
      }

      // Format 2: playlistVideoRenderer (Classic YouTube web)
      if (obj.playlistVideoRenderer) {
        const v = obj.playlistVideoRenderer;
        if (v.videoId && !seen.has(v.videoId)) {
          seen.add(v.videoId);
          const rawTitle = v.title?.runs?.[0]?.text || v.title?.simpleText || 'Audio';
          const author = v.shortBylineText?.runs?.[0]?.text || '';
          const cleanTitle = author && !rawTitle.toLowerCase().includes(author.toLowerCase())
            ? `${author} - ${rawTitle}`
            : rawTitle;
          const thumb = v.thumbnail?.thumbnails?.[v.thumbnail.thumbnails.length - 1]?.url || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;
          const duration = v.lengthText?.simpleText || undefined;

          if (!playlistThumb) playlistThumb = thumb;

          tracks.push({
            videoId: v.videoId,
            url: `https://www.youtube.com/watch?v=${v.videoId}`,
            title: cleanTitle,
            thumbnail: thumb,
            duration,
          });
        }
      }

      if (Array.isArray(obj)) {
        for (const item of obj) scan(item);
      } else {
        for (const k in obj) scan(obj[k]);
      }
    }

    scan(data);

    if (tracks.length === 0) return null;

    return {
      id: playlistId,
      title: playlistTitle,
      trackCount: tracks.length,
      thumbnail: playlistThumb || tracks[0]?.thumbnail,
      tracks,
    };
  } catch (e) {
    console.error('[playlist] Failed to fetch playlist:', e);
    return null;
  }
}
