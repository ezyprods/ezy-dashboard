import { NextRequest, NextResponse } from 'next/server';
import { stemsClients, stemsTasks, broadcastStems } from '../state';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const taskId = req.nextUrl.searchParams.get('taskId');
  const predictionId = req.nextUrl.searchParams.get('predictionId');
  const clientToken = req.headers.get('x-replicate-token') || req.nextUrl.searchParams.get('token');
  const token = (clientToken || process.env.REPLICATE_API_TOKEN || '').trim();
  const wantsJson = req.headers.get('accept')?.includes('application/json') || req.nextUrl.searchParams.get('format') === 'json';

  if (!taskId && !predictionId) {
    return NextResponse.json({ error: 'Missing taskId or predictionId' }, { status: 400 });
  }

  // ── MODO 1: JSON Polling directo (Stateless / Fallback) ──
  if (wantsJson) {
    let task = taskId ? stemsTasks.get(taskId) : null;

    if (predictionId && token) {
      try {
        const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (pollRes.ok) {
          const pollData = await pollRes.json();
          const isDone = pollData.status === 'succeeded';
          const isFailed = pollData.status === 'failed' || pollData.status === 'canceled';

          let stems = undefined;
          if (isDone && pollData.output) {
            const out = pollData.output;
            stems = {
              vocals: out.vocals || out['vocals.wav'] || out['vocals.mp3'],
              drums: out.drums || out['drums.wav'] || out['drums.mp3'],
              bass: out.bass || out['bass.wav'] || out['bass.mp3'],
              other: out.other || out['other.wav'] || out['other.mp3']
            };
          }

          const updatedTask = {
            id: taskId || predictionId,
            predictionId,
            filename: task?.filename || 'audio',
            status: (isDone ? 'completed' : isFailed ? 'error' : 'processing') as 'pending' | 'processing' | 'completed' | 'error',
            progress: isDone ? 100 : pollData.status === 'starting' ? 15 : 60,
            engine: 'cloud' as const,
            stems,
            error: isFailed ? (pollData.error || 'Separación fallida') : undefined
          };

          if (taskId) stemsTasks.set(taskId, updatedTask);
          return NextResponse.json({ task: updatedTask });
        }
      } catch (e: any) {
        console.error('Error polling Replicate prediction:', e);
      }
    }

    if (task) {
      return NextResponse.json({ task });
    }

    return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 });
  }

  // ── MODO 2: Server-Sent Events (SSE) ──
  const stream = new ReadableStream({
    async start(controller) {
      const client = { id: taskId || predictionId!, controller };
      stemsClients.add(client);
      
      let existingTask = taskId ? stemsTasks.get(taskId) : null;
      if (existingTask) {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'update', task: existingTask })}\n\n`));
      }

      // Si tenemos predictionId y no está finalizado, hacer polling activo en el stream
      let isCompleted = existingTask?.status === 'completed' || existingTask?.status === 'error';
      let pollCount = 0;

      const interval = setInterval(async () => {
        try {
          if (!isCompleted && predictionId && token) {
            pollCount++;
            const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            });

            if (pollRes.ok) {
              const pollData = await pollRes.json();
              if (pollData.status === 'succeeded') {
                isCompleted = true;
                const out = pollData.output || {};
                const completedTask = {
                  id: taskId || predictionId,
                  predictionId,
                  filename: existingTask?.filename || 'audio',
                  status: 'completed' as const,
                  progress: 100,
                  engine: 'cloud' as const,
                  stems: {
                    vocals: out.vocals || out['vocals.wav'] || out['vocals.mp3'],
                    drums: out.drums || out['drums.wav'] || out['drums.mp3'],
                    bass: out.bass || out['bass.wav'] || out['bass.mp3'],
                    other: out.other || out['other.wav'] || out['other.mp3']
                  }
                };
                if (taskId) stemsTasks.set(taskId, completedTask);
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'update', task: completedTask })}\n\n`));
                clearInterval(interval);
                stemsClients.delete(client);
                return;
              } else if (pollData.status === 'failed' || pollData.status === 'canceled') {
                isCompleted = true;
                const errorTask = {
                  id: taskId || predictionId,
                  predictionId,
                  filename: existingTask?.filename || 'audio',
                  status: 'error' as const,
                  progress: 0,
                  engine: 'cloud' as const,
                  error: pollData.error || 'La separación en la nube falló'
                };
                if (taskId) stemsTasks.set(taskId, errorTask);
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'update', task: errorTask })}\n\n`));
                clearInterval(interval);
                stemsClients.delete(client);
                return;
              } else {
                const prog = Math.min(20 + pollCount * 7, 92);
                const progressTask = {
                  id: taskId || predictionId,
                  predictionId,
                  filename: existingTask?.filename || 'audio',
                  status: 'processing' as const,
                  progress: prog,
                  engine: 'cloud' as const
                };
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'update', task: progressTask })}\n\n`));
              }
            }
          }

          // Heartbeat
          controller.enqueue(new TextEncoder().encode(': keepalive\n\n'));
        } catch (e) {
          clearInterval(interval);
          stemsClients.delete(client);
        }
      }, 2500);

      req.signal.addEventListener('abort', () => {
        clearInterval(interval);
        stemsClients.delete(client);
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
