import { NextResponse } from 'next/server';
import ytdl from '@distube/ytdl-core';

// This handles fetching the stream and piping it to the client
export async function POST(req: Request) {
  try {
    const { url } = await req.json();

    if (!url || !ytdl.validateURL(url)) {
      return NextResponse.json({ error: 'URL de YouTube inválida' }, { status: 400 });
    }

    const info = await ytdl.getInfo(url);
    const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
    
    // Get the highest quality audio format
    audioFormats.sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));
    
    const bestFormat = audioFormats[0];

    if (!bestFormat) {
      return NextResponse.json({ error: 'No se encontró formato de audio' }, { status: 404 });
    }

    return NextResponse.json({
      title: info.videoDetails.title,
      thumbnail: info.videoDetails.thumbnails[0]?.url,
      duration: parseInt(info.videoDetails.lengthSeconds, 10),
      format: bestFormat.container, // e.g. webm or mp4
      directUrl: bestFormat.url 
    });

  } catch (error: any) {
    console.error('Error extracting youtube video:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
