import { NextResponse } from 'next/server';
import { tasks } from '../state';
import fs from 'fs';
import { Readable } from 'stream';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json({ error: 'taskId requerido' }, { status: 400 });
    }

    const task = tasks.get(taskId);
    if (!task || !task.downloadPath || task.status !== 'completed') {
      return NextResponse.json({ error: 'Archivo no encontrado o no está listo' }, { status: 404 });
    }

    if (!fs.existsSync(task.downloadPath)) {
      return NextResponse.json({ error: 'El archivo físico no existe' }, { status: 404 });
    }

    // Preparar el nombre de archivo de forma segura
    const safeTitle = encodeURIComponent(task.title.replace(/[^\w\s-]/gi, '').trim());

    // Crear un stream de lectura de Node.js
    const fileStream = fs.createReadStream(task.downloadPath);

    // Convertir el stream de Node.js a un ReadableStream de la Web API
    const webStream = Readable.toWeb(fileStream as any);

    return new NextResponse(webStream as any, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': `attachment; filename="${safeTitle}.mp3"; filename*=UTF-8''${safeTitle}.mp3`,
      },
    });

  } catch (error: any) {
    console.error('Download File Error:', error);
    return NextResponse.json({ error: 'Error en el servidor al enviar el archivo' }, { status: 500 });
  }
}
