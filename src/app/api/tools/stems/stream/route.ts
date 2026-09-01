import { NextRequest, NextResponse } from 'next/server';
import { stemsTasks } from '../state';
import path from 'path';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const taskId = req.nextUrl.searchParams.get('taskId');
    const stem = req.nextUrl.searchParams.get('stem') as 'vocals' | 'drums' | 'bass' | 'other' | null;
    const directUrl = req.nextUrl.searchParams.get('url');
    const queryFilename = req.nextUrl.searchParams.get('filename');

    const validStems = ['vocals', 'drums', 'bass', 'other'];
    if (stem && !validStems.includes(stem)) {
      return NextResponse.json({ error: 'Pista no válida' }, { status: 400 });
    }

    const isDownload = req.nextUrl.searchParams.get('download') === 'true';

    // Helper para Content-Disposition seguro con RFC 5987 (Unicode / emojis / tildes)
    const getSafeDisposition = (rawName: string, stemName: string) => {
      const base = rawName.replace(/\.[^/.]+$/, "").trim() || 'stem';
      const cleanAscii = base.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '') || 'audio';
      const fullAscii = `${cleanAscii}_${stemName}.wav`;
      const fullUtf8 = encodeURIComponent(`${base}_${stemName}.wav`);
      return `attachment; filename="${fullAscii}"; filename*=UTF-8''${fullUtf8}`;
    };

    // CASO 1: URL directa proporcionada por el cliente (Cloud / Stateless)
    if (directUrl && stem) {
      if (!isDownload) {
        return NextResponse.redirect(directUrl);
      }

      const remoteRes = await fetch(directUrl);
      if (!remoteRes.ok) {
        return NextResponse.redirect(directUrl);
      }

      const blob = await remoteRes.arrayBuffer();
      const disposition = getSafeDisposition(queryFilename || 'stem', stem);

      return new NextResponse(Buffer.from(blob), {
        status: 200,
        headers: {
          'Content-Type': remoteRes.headers.get('content-type') || 'audio/wav',
          'Content-Disposition': disposition
        }
      });
    }

    if (!taskId || !stem) {
      return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 });
    }

    const task = stemsTasks.get(taskId);
    if (!task) {
      return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 });
    }

    const safeName = task.filename || queryFilename || 'audio';

    // CASO 2: Procesamiento en la nube (Cloud URLs de Replicate en memoria)
    if (task.stems && task.stems[stem]) {
      const stemUrl = task.stems[stem]!;

      if (!isDownload) {
        return NextResponse.redirect(stemUrl);
      }

      const remoteRes = await fetch(stemUrl);
      if (!remoteRes.ok) {
        return NextResponse.redirect(stemUrl);
      }

      const blob = await remoteRes.arrayBuffer();
      const disposition = getSafeDisposition(safeName, stem);

      return new NextResponse(Buffer.from(blob), {
        status: 200,
        headers: {
          'Content-Type': remoteRes.headers.get('content-type') || 'audio/wav',
          'Content-Disposition': disposition
        }
      });
    }

    // CASO 3: Procesamiento Local
    if (task.outputDir) {
      const filePath = path.join(task.outputDir, `${stem}.wav`);

      if (!existsSync(filePath)) {
        return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 });
      }

      const buffer = await readFile(filePath);

      const range = req.headers.get('range');
      if (range && !isDownload) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : buffer.length - 1;
        const chunkSize = (end - start) + 1;
        const sliced = buffer.subarray(start, end + 1);

        return new NextResponse(sliced, {
          status: 206,
          headers: {
            'Content-Range': `bytes ${start}-${end}/${buffer.length}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunkSize.toString(),
            'Content-Type': 'audio/wav'
          }
        });
      }

      const headers: Record<string, string> = {
        'Content-Type': 'audio/wav',
        'Content-Length': buffer.length.toString(),
        'Accept-Ranges': 'bytes'
      };

      if (isDownload) {
        headers['Content-Disposition'] = getSafeDisposition(safeName, stem);
      }

      return new NextResponse(buffer, {
        status: 200,
        headers
      });
    }

    return NextResponse.json({ error: 'Las pistas aún no están listas' }, { status: 404 });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
