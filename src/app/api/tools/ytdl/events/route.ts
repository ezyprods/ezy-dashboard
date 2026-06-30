import { NextRequest } from 'next/server';
import { tasks, sseClients } from '../state';

export async function GET(req: NextRequest) {
  let controllerRef: ReadableStreamDefaultController | null = null;

  const stream = new ReadableStream({
    start(controller) {
      controllerRef = controller;
      sseClients.add(controller);

      // Enviar estado inicial
      const initialData = { type: 'init', tasks: Array.from(tasks.values()) };
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(initialData)}\n\n`));
    },
    cancel() {
      if (controllerRef) {
        sseClients.delete(controllerRef);
      }
    }
  });

  req.signal.addEventListener('abort', () => {
    if (controllerRef) {
      sseClients.delete(controllerRef);
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
