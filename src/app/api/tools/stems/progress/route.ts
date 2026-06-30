import { NextRequest } from 'next/server';
import { stemsClients, stemsTasks } from '../state';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const taskId = req.nextUrl.searchParams.get('taskId');
  
  if (!taskId) {
    return new Response('Missing taskId', { status: 400 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const client = { id: taskId, controller };
      stemsClients.add(client);
      
      const existingTask = stemsTasks.get(taskId);
      if (existingTask) {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: 'update', task: existingTask })}\n\n`));
      }

      // Heartbeat to keep connection alive
      const interval = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(': keepalive\n\n'));
        } catch {
          clearInterval(interval);
          stemsClients.delete(client);
        }
      }, 15000);

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
