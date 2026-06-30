import { NextRequest, NextResponse } from 'next/server';
import { stemsTasks } from '../state';
import path from 'path';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const taskId = req.nextUrl.searchParams.get('taskId');
    const stem = req.nextUrl.searchParams.get('stem');

    if (!taskId || !stem) {
      return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 });
    }

    const task = stemsTasks.get(taskId);
    if (!task || !task.outputDir) {
      return NextResponse.json({ error: 'Tarea no encontrada o incompleta' }, { status: 404 });
    }

    const validStems = ['vocals', 'drums', 'bass', 'other'];
    if (!validStems.includes(stem)) {
      return NextResponse.json({ error: 'Pista no válida' }, { status: 400 });
    }

    const filePath = path.join(task.outputDir, `${stem}.wav`);

    if (!existsSync(filePath)) {
      return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 });
    }

    const isDownload = req.nextUrl.searchParams.get('download') === 'true';

    // Para un dashboard local, leer a memoria es seguro y rápido
    const buffer = await readFile(filePath);

    const headers: Record<string, string> = {
      'Content-Type': 'audio/wav',
      'Content-Length': buffer.length.toString(),
      'Accept-Ranges': 'bytes'
    };

    if (isDownload) {
      const safeFilename = task.filename.replace(/\.[^/.]+$/, "");
      headers['Content-Disposition'] = `attachment; filename="${safeFilename}_${stem}.wav"`;
    }

    const res = new NextResponse(buffer, {
      status: 200,
      headers
    });

    return res;

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
