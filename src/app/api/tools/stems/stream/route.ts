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

    if (!taskId || !stem) {
      return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 });
    }

    const task = stemsTasks.get(taskId);
    if (!task) {
      return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 });
    }

    const validStems = ['vocals', 'drums', 'bass', 'other'];
    if (!validStems.includes(stem)) {
      return NextResponse.json({ error: 'Pista no válida' }, { status: 400 });
    }

    const isDownload = req.nextUrl.searchParams.get('download') === 'true';
    const safeFilename = task.filename.replace(/\.[^/.]+$/, "");

    // CASO 1: Procesamiento en la nube (Cloud URLs de Replicate)
    if (task.stems && task.stems[stem]) {
      const stemUrl = task.stems[stem]!;

      if (!isDownload) {
        // Redirección directa para streaming rápido y sin recargar el servidor
        return NextResponse.redirect(stemUrl);
      }

      // Descarga de archivo remoto con nombre formateado
      const remoteRes = await fetch(stemUrl);
      if (!remoteRes.ok) {
        return NextResponse.redirect(stemUrl);
      }

      const blob = await remoteRes.arrayBuffer();
      return new NextResponse(Buffer.from(blob), {
        status: 200,
        headers: {
          'Content-Type': remoteRes.headers.get('content-type') || 'audio/wav',
          'Content-Disposition': `attachment; filename="${safeFilename}_${stem}.wav"`
        }
      });
    }

    // CASO 2: Procesamiento Local
    if (task.outputDir) {
      const filePath = path.join(task.outputDir, `${stem}.wav`);

      if (!existsSync(filePath)) {
        return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 });
      }

      const buffer = await readFile(filePath);

      const headers: Record<string, string> = {
        'Content-Type': 'audio/wav',
        'Content-Length': buffer.length.toString(),
        'Accept-Ranges': 'bytes'
      };

      if (isDownload) {
        headers['Content-Disposition'] = `attachment; filename="${safeFilename}_${stem}.wav"`;
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
