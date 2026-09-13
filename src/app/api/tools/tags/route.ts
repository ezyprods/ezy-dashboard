import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import * as NodeID3 from 'node-id3';
import { contentDisposition } from '@/lib/serverFiles';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const action = formData.get('action') as string;
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No se proporcionó archivo' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    if (action === 'read') {
      const tags = NodeID3.read(buffer);

      let cover = null;
      if (tags.image && typeof tags.image === 'object' && tags.image.imageBuffer) {
        const base64 = tags.image.imageBuffer.toString('base64');
        cover = `data:${tags.image.mime || 'image/jpeg'};base64,${base64}`;
      }

      return NextResponse.json({
        title: tags.title || '',
        artist: tags.artist || '',
        album: tags.album || '',
        year: tags.year || '',
        genre: tags.genre || '',
        cover
      });
    }

    if (action === 'write') {
      const tags: NodeID3.Tags = {
        title: (formData.get('title') as string) || '',
        artist: (formData.get('artist') as string) || '',
        album: (formData.get('album') as string) || '',
        year: (formData.get('year') as string) || '',
        genre: (formData.get('genre') as string) || '',
      };

      const coverFile = formData.get('coverFile') as File | null;
      if (coverFile) {
        tags.image = {
          mime: coverFile.type || 'image/jpeg',
          type: { id: 3, name: 'front cover' },
          description: 'Cover',
          imageBuffer: Buffer.from(await coverFile.arrayBuffer())
        };
      }

      // `update` keeps the frames that are not being edited (e.g. the existing cover)
      const taggedBuffer = NodeID3.update(tags, buffer);

      if (!taggedBuffer || !(taggedBuffer instanceof Buffer)) {
        return NextResponse.json({ error: 'Error al escribir tags' }, { status: 500 });
      }

      const baseName = path.parse(file.name).name || 'audio';
      const outputName = `${baseName}_(Tagged).mp3`;

      // Return the tagged file to the browser so it is downloaded on the user's device
      return new NextResponse(taggedBuffer as any, {
        status: 200,
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Length': taggedBuffer.length.toString(),
          'Content-Disposition': contentDisposition(outputName),
          'X-Output-Filename': encodeURIComponent(outputName),
          'Cache-Control': 'no-store',
        },
      });
    }

    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
