'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

export type DAWStatus =
  | 'idle'
  | 'loading'
  | 'decoding'
  | 'ready'
  | 'processing'
  | 'done'
  | 'error';

export interface DAWState {
  status: DAWStatus;
  duration: number;
  trimStart: number;
  trimEnd: number;
  gain: number;
  errorMessage: string | null;
  exportProgress: number; // 0–1
  loadProgress: number; // 0-1
  downloadUrl: string | null;
  outputFileName: string;
}

interface UseMiniDAWReturn extends DAWState {
  audioBuffer: AudioBuffer | null;
  loadAudio: (fileId: string, fileName: string) => void;
  cancelLoad: () => void;
  setTrimStart: (t: number) => void;
  setTrimEnd: (t: number) => void;
  setGain: (g: number) => void;
  setOutputFileName: (n: string) => void;
  exportAudio: (format: 'wav' | 'mp3') => Promise<void>;
  resetExport: () => void;
  cleanup: () => void;
}

export function useMiniDAW(): UseMiniDAWReturn {
  const [status, setStatus] = useState<DAWStatus>('idle');
  const [duration, setDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [gain, setGain] = useState(1.0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState(0);
  const [loadProgress, setLoadProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [outputFileName, setOutputFileName] = useState('export');

  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const ffmpegRef = useRef<any>(null);
  // Track the last revoked URL to prevent double-revoke
  const lastDownloadUrlRef = useRef<string | null>(null);

  const cleanup = useCallback(() => {
    // Abort any in-flight fetch
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    // Terminate FFmpeg worker if running
    if (ffmpegRef.current) {
      try { ffmpegRef.current.terminate(); } catch (_) {}
      ffmpegRef.current = null;
    }

    // Revoke object URL to free memory
    if (lastDownloadUrlRef.current) {
      URL.revokeObjectURL(lastDownloadUrlRef.current);
      lastDownloadUrlRef.current = null;
    }

    // Clear the decoded audio buffer
    audioBufferRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => { cleanup(); };
  }, [cleanup]);

// Global cache to persist decoded audio between modal opens
const globalAudioCache = new Map<string, AudioBuffer>();

  const loadAudio = useCallback(async (fileId: string, fileName: string) => {
    // Reset state before loading
    setStatus('loading');
    setErrorMessage(null);
    setExportProgress(0);
    setLoadProgress(0);
    setDownloadUrl(null);
    lastDownloadUrlRef.current = null;
    audioBufferRef.current = null;

    // Derive a clean output filename from the original
    const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
    setOutputFileName(`${nameWithoutExt}_edit`);

    // Cancel any previous fetch
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      if (globalAudioCache.has(fileId)) {
        const cached = globalAudioCache.get(fileId)!;
        audioBufferRef.current = cached;
        setDuration(cached.duration);
        setTrimStart(0);
        setTrimEnd(cached.duration);
        setStatus('ready');
        return;
      }

      const response = await fetch(`/api/audio/${fileId}`, {
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`No se pudo cargar el audio (HTTP ${response.status})`);
      }

      // Stream the response to show progress
      const contentLengthHeader = response.headers.get('Content-Length');
      const totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;
      
      let arrayBuffer: ArrayBuffer;
      
      if (totalBytes > 0 && response.body) {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let receivedBytes = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            receivedBytes += value.length;
            setLoadProgress(receivedBytes / totalBytes);
          }
        }
        
        // Combine chunks
        const combined = new Uint8Array(receivedBytes);
        let pos = 0;
        for (const chunk of chunks) {
          combined.set(chunk, pos);
          pos += chunk.length;
        }
        arrayBuffer = combined.buffer;
      } else {
        // Fallback if no content-length
        arrayBuffer = await response.arrayBuffer();
      }

      if (controller.signal.aborted) return;

      setStatus('decoding');

      // Decode audio using the Web Audio API
      const offlineCtx = new OfflineAudioContext(2, 1, 44100);
      const decoded = await offlineCtx.decodeAudioData(arrayBuffer);

      if (controller.signal.aborted) return;

      // Save to cache
      globalAudioCache.set(fileId, decoded);

      audioBufferRef.current = decoded;
      setDuration(decoded.duration);
      setTrimStart(0);
      setTrimEnd(decoded.duration);
      setStatus('ready');
    } catch (err: any) {
      if (err?.name === 'AbortError') return; // intentional cancel
      console.error('[useMiniDAW] loadAudio error:', err);
      setErrorMessage(err?.message ?? 'Error desconocido al cargar el audio.');
      setStatus('error');
    }
  }, []);

  const cancelLoad = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setStatus('idle');
  }, []);

  const exportAudio = useCallback(async (format: 'wav' | 'mp3') => {
    const buffer = audioBufferRef.current;
    if (!buffer) return;

    setStatus('processing');
    setExportProgress(0);
    setErrorMessage(null);

    try {
      // 1. JS Encoder: Process trim and gain natively in JS
      // This is instant and avoids memory spikes.
      const optimizedWavBytes = audioBufferToWav(buffer, trimStart, trimEnd, gain);

      if (format === 'wav') {
        // Zero-Dependency WAV Export! Bypass FFmpeg completely.
        const blob = new Blob([optimizedWavBytes], { type: 'audio/wav' });
        
        if (lastDownloadUrlRef.current) URL.revokeObjectURL(lastDownloadUrlRef.current);
        const url = URL.createObjectURL(blob);
        lastDownloadUrlRef.current = url;
        
        setDownloadUrl(url);
        setExportProgress(1);
        setStatus('done');
        return;
      }

      // --- FFmpeg processing ONLY for MP3 ---

      // Guard: check SharedArrayBuffer availability
      if (typeof SharedArrayBuffer === 'undefined') {
        throw new Error(
          'SharedArrayBuffer no está disponible para exportar a MP3. Revisa los headers COOP/COEP.'
        );
      }

      const { FFmpeg } = await import('@ffmpeg/ffmpeg');
      const { fetchFile, toBlobURL } = await import('@ffmpeg/util');

      const ffmpeg = new FFmpeg();
      ffmpegRef.current = ffmpeg;

      ffmpeg.on('progress', ({ progress }: { progress: number }) => {
        setExportProgress(Math.min(progress, 0.99));
      });

      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      // Write the ALREADY TRIMMED AND GAINED wav to FFmpeg
      await ffmpeg.writeFile('input.wav', new Uint8Array(optimizedWavBytes));

      const outputFile = 'output.mp3';

      // FFmpeg only needs to convert format, no -ss, -t, or -af needed!
      const args = [
        '-i', 'input.wav',
        '-codec:a', 'libmp3lame', 
        '-q:a', '2',
        outputFile
      ];

      await ffmpeg.exec(args);

      const data = await ffmpeg.readFile(outputFile);
      const blob = new Blob([(data as Uint8Array).buffer as ArrayBuffer], { type: 'audio/mpeg' });

      if (lastDownloadUrlRef.current) URL.revokeObjectURL(lastDownloadUrlRef.current);
      
      const url = URL.createObjectURL(blob);
      lastDownloadUrlRef.current = url;
      setDownloadUrl(url);
      setExportProgress(1);
      setStatus('done');

      try { ffmpeg.terminate(); } catch (_) {}
      ffmpegRef.current = null;
    } catch (err: any) {
      console.error('[useMiniDAW] exportAudio error:', err);
      setErrorMessage(err?.message ?? 'Error durante la exportación.');
      setStatus('error');
    }
  }, [trimStart, trimEnd, gain]);

  const resetExport = useCallback(() => {
    if (lastDownloadUrlRef.current) {
      URL.revokeObjectURL(lastDownloadUrlRef.current);
      lastDownloadUrlRef.current = null;
    }
    setDownloadUrl(null);
    setExportProgress(0);
    setStatus(audioBufferRef.current ? 'ready' : 'idle');
  }, []);

  return {
    status,
    duration,
    trimStart,
    trimEnd,
    gain,
    errorMessage,
    exportProgress,
    loadProgress,
    downloadUrl,
    outputFileName,
    audioBuffer: audioBufferRef.current,
    loadAudio,
    cancelLoad,
    setTrimStart,
    setTrimEnd,
    setGain,
    setOutputFileName,
    exportAudio,
    resetExport,
    cleanup,
  };
}

// ─── Utility: Encode AudioBuffer → WAV (PCM s16le) in the browser ─────────────
// We do this ourselves to avoid a large dependency just for encoding.
// Optimization: Only encodes the specified time range and applies gain directly in JS!
function audioBufferToWav(buffer: AudioBuffer, trimStart: number, trimEnd: number, gain: number): ArrayBuffer {
  const numChannels = Math.min(buffer.numberOfChannels, 2);
  const sampleRate = buffer.sampleRate;
  
  // Calculate start and end samples
  const startSample = Math.floor(trimStart * sampleRate);
  const endSample = Math.ceil(trimEnd * sampleRate);
  let numSamples = endSample - startSample;
  
  if (numSamples <= 0) numSamples = 1; // Fallback
  if (startSample + numSamples > buffer.length) numSamples = buffer.length - startSample;

  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const totalSize = 44 + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);  // Subchunk1Size
  view.setUint16(20, 1, true);   // AudioFormat = PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Interleave channels and apply gain natively
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const sampleIndex = startSample + i;
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = buffer.getChannelData(ch)[sampleIndex] * gain;
      const clamped = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
      offset += 2;
    }
  }

  return arrayBuffer;
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
