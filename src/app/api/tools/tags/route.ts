import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import os from 'os';
import { writeFile } from 'fs/promises';
import * as NodeID3 from 'node-id3';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const action = formData.get('action') as string;
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No se proporcionó archivo' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

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
      const title = formData.get('title') as string;
      const artist = formData.get('artist') as string;
      const album = formData.get('album') as string;
      const year = formData.get('year') as string;
      const genre = formData.get('genre') as string;
      const coverFile = formData.get('coverFile') as File | null;

      const tags: NodeID3.Tags = {};
      if (title) tags.title = title;
      if (artist) tags.artist = artist;
      if (album) tags.album = album;
      if (year) tags.year = year;
      if (genre) tags.genre = genre;

      if (coverFile) {
        const coverBytes = await coverFile.arrayBuffer();
        tags.image = {
          mime: coverFile.type || 'image/jpeg',
          type: { id: 3, name: 'front cover' },
          description: 'Cover',
          imageBuffer: Buffer.from(coverBytes)
        };
      }

      const taggedBuffer = NodeID3.write(tags, buffer);
      
      if (!taggedBuffer || taggedBuffer === buffer) {
        return NextResponse.json({ error: 'Error al escribir tags' }, { status: 500 });
      }

      // Save to Downloads folder
      const downloadsDir = path.join(os.homedir(), 'Downloads');
      const baseName = path.parse(file.name).name;
      const outputName = `${baseName}_(Tagged).mp3`;
      const outputPath = path.join(downloadsDir, outputName);

      await writeFile(outputPath, taggedBuffer);

      return NextResponse.json({ success: true, path: outputPath, name: outputName });
    }

    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
