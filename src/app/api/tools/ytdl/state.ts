export type TaskStatus = 'analysing' | 'downloading' | 'converting' | 'completed' | 'error';

export interface YtdlTask {
  id: string;
  clientId: string; // Quien inició la descarga
  url: string;
  resolvedUrl?: string;
  title: string;
  thumbnail?: string;
  platform?: string;
  status: TaskStatus;
  progress: number; // 0-100
  error?: string;
  startTime: number;
  downloadPath?: string; // Ruta temporal en el servidor
}

const globalAny: any = global;

if (!globalAny.__YTDL_TASKS__) {
  globalAny.__YTDL_TASKS__ = new Map<string, YtdlTask>();
}
if (!globalAny.__YTDL_SSE_CLIENTS__) {
  globalAny.__YTDL_SSE_CLIENTS__ = new Set<ReadableStreamDefaultController>();
}

export const tasks: Map<string, YtdlTask> = globalAny.__YTDL_TASKS__;
export const sseClients: Set<ReadableStreamDefaultController> = globalAny.__YTDL_SSE_CLIENTS__;

export const broadcast = (data: any) => {
  const json = JSON.stringify(data);
  const chunk = new TextEncoder().encode(`data: ${json}\n\n`);
  for (const client of sseClients) {
    try {
      client.enqueue(chunk);
    } catch (e) {
      sseClients.delete(client);
    }
  }
};
