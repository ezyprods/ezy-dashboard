export type TaskStatus = 'analysing' | 'downloading' | 'converting' | 'completed' | 'error';

export interface YtdlTask {
  id: string;
  clientId: string;
  url: string;
  resolvedUrl?: string;
  title: string;
  thumbnail?: string;
  platform?: string;
  status: TaskStatus;
  progress: number;
  error?: string;
  startTime: number;
  downloadPath?: string;
}

const globalAny: any = global;

if (!globalAny.__YTDL_TASKS__) {
  globalAny.__YTDL_TASKS__ = new Map<string, YtdlTask>();
}
if (!globalAny.__YTDL_SSE_CLIENTS__) {
  globalAny.__YTDL_SSE_CLIENTS__ = new Set<ReadableStreamDefaultController>();
}
if (!globalAny.__YTDL_FILE_BUFFERS__) {
  globalAny.__YTDL_FILE_BUFFERS__ = new Map<string, { buffer: Buffer; title: string }>();
}

export const tasks: Map<string, YtdlTask> = globalAny.__YTDL_TASKS__;
export const sseClients: Set<ReadableStreamDefaultController> = globalAny.__YTDL_SSE_CLIENTS__;
export const completedFileBuffers: Map<string, { buffer: Buffer; title: string }> = globalAny.__YTDL_FILE_BUFFERS__;

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
