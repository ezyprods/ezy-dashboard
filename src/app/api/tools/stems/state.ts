export type StemsTaskStatus = 'pending' | 'processing' | 'completed' | 'error';

export interface StemsTask {
  id: string;
  filename: string;
  status: StemsTaskStatus;
  progress: number;
  outputDir?: string;
  error?: string;
}

const globalAny: any = global;

if (!globalAny.__STEMS_TASKS__) {
  globalAny.__STEMS_TASKS__ = new Map<string, StemsTask>();
}
if (!globalAny.__STEMS_SSE_CLIENTS__) {
  globalAny.__STEMS_SSE_CLIENTS__ = new Set<{ id: string, controller: ReadableStreamDefaultController }>();
}

export const stemsTasks: Map<string, StemsTask> = globalAny.__STEMS_TASKS__;
export const stemsClients: Set<{ id: string, controller: ReadableStreamDefaultController }> = globalAny.__STEMS_SSE_CLIENTS__;

export const broadcastStems = (taskId: string, data: any) => {
  const json = JSON.stringify(data);
  const chunk = new TextEncoder().encode(`data: ${json}\n\n`);
  for (const client of stemsClients) {
    if (client.id === taskId || client.id === 'all') {
      try {
        client.controller.enqueue(chunk);
      } catch (e) {
        stemsClients.delete(client);
      }
    }
  }
};
