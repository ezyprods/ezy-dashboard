/**
 * Demucs In-Browser Separation Engine
 * Runs 100% on the client using WebGPU / WASM with ONNX Runtime Web.
 * Zero server cost, zero tokens, unlimited free separations for artists and users.
 */

export interface BrowserStemsProgress {
  phase: 'downloading_model' | 'initializing' | 'separating';
  progress: number; // 0 - 100
  downloadLoaded?: number;
  downloadTotal?: number;
  currentSegment?: number;
  totalSegments?: number;
  logMessage?: string;
}

export interface BrowserStemsResult {
  vocalsBlob: Blob;
  drumsBlob: Blob;
  bassBlob: Blob;
  otherBlob: Blob;
  vocalsUrl: string;
  drumsUrl: string;
  bassUrl: string;
  otherUrl: string;
}

const MODEL_URL = 'https://huggingface.co/timcsy/demucs-web-onnx/resolve/main/htdemucs_embedded.onnx';
const CACHE_NAME = 'demucs-model-cache-v1';

/**
 * Downloads and caches the ONNX model in CacheStorage to prevent re-downloading
 */
async function getOrFetchModelBuffer(
  onDownloadProgress: (loaded: number, total: number) => void
): Promise<ArrayBuffer> {
  // Check browser cache first
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(MODEL_URL);
      if (cachedResponse) {
        console.log('[Demucs Browser] Model loaded from local browser cache!');
        return await cachedResponse.arrayBuffer();
      }
    } catch (e) {
      console.warn('[Demucs Browser] Cache lookup warning:', e);
    }
  }

  // Fetch with progress tracking
  console.log('[Demucs Browser] Fetching model from Hugging Face CDN...');
  const response = await fetch(MODEL_URL);
  if (!response.ok) {
    throw new Error(`Error al descargar el modelo Demucs (${response.status})`);
  }

  const contentLength = response.headers.get('Content-Length');
  const totalSize = contentLength ? parseInt(contentLength, 10) : 180534758;

  let modelBuffer: ArrayBuffer;

  if (response.body) {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let loadedSize = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        loadedSize += value.length;
        onDownloadProgress(loadedSize, totalSize);
      }
    }

    const combined = new Uint8Array(loadedSize);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    modelBuffer = combined.buffer;
  } else {
    modelBuffer = await response.arrayBuffer();
  }

  // Save in CacheStorage for instant future loads
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const cache = await caches.open(CACHE_NAME);
      const resToCache = new Response(modelBuffer.slice(0), {
        headers: { 'Content-Type': 'application/octet-stream' }
      });
      await cache.put(MODEL_URL, resToCache);
      console.log('[Demucs Browser] Model saved to local browser cache.');
    } catch (e) {
      console.warn('[Demucs Browser] Failed to cache model:', e);
    }
  }

  return modelBuffer;
}

/**
 * Encodes stereo Float32Array PCM into a standard 16-bit PCM WAV Blob
 */
export function audioBufferToWavBlob(left: Float32Array, right: Float32Array, sampleRate = 44100): Blob {
  const numChannels = 2;
  const numSamples = left.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2 * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF chunk descriptor
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2 * 2, true);
  writeString(8, 'WAVE');

  // "fmt " sub-chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true); // ByteRate
  view.setUint16(32, numChannels * 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample (16)

  // "data" sub-chunk
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2 * 2, true);

  // Write interleaved 16-bit PCM
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const sLeft = Math.max(-1, Math.min(1, left[i]));
    const sRight = Math.max(-1, Math.min(1, right[i]));

    view.setInt16(offset, sLeft < 0 ? sLeft * 0x8000 : sLeft * 0x7FFF, true);
    offset += 2;
    view.setInt16(offset, sRight < 0 ? sRight * 0x8000 : sRight * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

// Global processor singleton to avoid reloading model across sessions
let globalProcessor: any = null;

/**
 * Separates an audio file into 4 stems directly in the browser
 */
export async function separateAudioInBrowser(
  audioFile: File,
  onProgress: (info: BrowserStemsProgress) => void
): Promise<BrowserStemsResult> {
  if (typeof window === 'undefined') {
    throw new Error('El procesamiento en navegador solo está disponible en el cliente.');
  }

  // Dynamic imports to prevent SSR execution
  const ort = await import('onnxruntime-web');
  const { DemucsProcessor, CONSTANTS } = await import('demucs-web');

  // Configure ORT
  if (navigator.hardwareConcurrency) {
    ort.env.wasm.numThreads = Math.min(navigator.hardwareConcurrency, 4);
  }

  if (!globalProcessor) {
    onProgress({
      phase: 'downloading_model',
      progress: 5,
      logMessage: 'Verificando modelo IA en caché del navegador...'
    });

    const modelBuffer = await getOrFetchModelBuffer((loaded, total) => {
      const pct = Math.min(95, Math.round((loaded / total) * 100));
      onProgress({
        phase: 'downloading_model',
        progress: pct,
        downloadLoaded: loaded,
        downloadTotal: total,
        logMessage: `Descargando modelo IA Demucs (${(loaded / 1024 / 1024).toFixed(1)} MB / ${(total / 1024 / 1024).toFixed(1)} MB)...`
      });
    });

    onProgress({
      phase: 'initializing',
      progress: 98,
      logMessage: 'Inicializando aceleración GPU (WebGPU / WASM)...'
    });

    const processor = new DemucsProcessor({
      ort,
      sessionOptions: {
        executionProviders: ['webgpu', 'wasm'],
        graphOptimizationLevel: 'basic'
      }
    });

    await processor.loadModel(modelBuffer);
    globalProcessor = processor;
  }

  onProgress({
    phase: 'initializing',
    progress: 10,
    logMessage: 'Decodificando pistas de audio...'
  });

  // Decode audio using Web Audio API
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
    sampleRate: 44100
  });

  const arrayBuffer = await audioFile.arrayBuffer();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

  const leftChannel = audioBuffer.getChannelData(0);
  const rightChannel = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : leftChannel;

  onProgress({
    phase: 'separating',
    progress: 15,
    logMessage: 'Separando frecuencias con IA en tu tarjeta gráfica...'
  });

  // Attach progress listener
  globalProcessor.onProgress = ({ progress, currentSegment, totalSegments }: any) => {
    const sepPct = Math.min(98, 15 + Math.round(progress * 80));
    onProgress({
      phase: 'separating',
      progress: sepPct,
      currentSegment,
      totalSegments,
      logMessage: `Separando segmento ${currentSegment} de ${totalSegments} (${sepPct}%)...`
    });
  };

  const startTime = Date.now();
  const result = await globalProcessor.separate(leftChannel, rightChannel);
  console.log(`[Demucs Browser] Separation completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  onProgress({
    phase: 'initializing',
    progress: 99,
    logMessage: 'Generando archivos WAV de alta fidelidad...'
  });

  // Convert raw Float32Array stems to WAV Blobs & URLs
  const vocalsBlob = audioBufferToWavBlob(result.vocals.left, result.vocals.right, 44100);
  const drumsBlob = audioBufferToWavBlob(result.drums.left, result.drums.right, 44100);
  const bassBlob = audioBufferToWavBlob(result.bass.left, result.bass.right, 44100);
  const otherBlob = audioBufferToWavBlob(result.other.left, result.other.right, 44100);

  const vocalsUrl = URL.createObjectURL(vocalsBlob);
  const drumsUrl = URL.createObjectURL(drumsBlob);
  const bassUrl = URL.createObjectURL(bassBlob);
  const otherUrl = URL.createObjectURL(otherBlob);

  audioCtx.close().catch(() => {});

  return {
    vocalsBlob,
    drumsBlob,
    bassBlob,
    otherBlob,
    vocalsUrl,
    drumsUrl,
    bassUrl,
    otherUrl
  };
}
