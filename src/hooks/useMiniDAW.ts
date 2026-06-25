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

  const loadAudio = useCallback(async (fileId: string, fileName: string) => {
    // Reset state before loading
    setStatus('loading');
    setErrorMessage(null);
    setExportProgress(0);
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
      const response = await fetch(`/api/audio/${fileId}`, {
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`No se pudo cargar el audio (HTTP ${response.status})`);
      }

      const arrayBuffer = await response.arrayBuffer();

      if (controller.signal.aborted) return;

      setStatus('decoding');

      // Decode audio using the Web Audio API
      const offlineCtx = new OfflineAudioContext(2, 1, 44100);
      const decoded = await offlineCtx.decodeAudioData(arrayBuffer);

      if (controller.signal.aborted) return;

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
      // Guard: check SharedArrayBuffer availability (requires cross-origin isolation)
      if (typeof SharedArrayBuffer === 'undefined') {
        throw new Error(
          'SharedArrayBuffer no está disponible. Asegúrate de que el servidor envía los headers Cross-Origin-Opener-Policy y Cross-Origin-Embedder-Policy correctos.'
        );
      }

      // Lazy-load FFmpeg only when actually needed
      const { FFmpeg } = await import('@ffmpeg/ffmpeg');
      const { fetchFile, toBlobURL } = await import('@ffmpeg/util');

      const ffmpeg = new FFmpeg();
      ffmpegRef.current = ffmpeg;

      ffmpeg.on('progress', ({ progress }: { progress: number }) => {
        setExportProgress(Math.min(progress, 0.99));
      });

      // Load FFmpeg core (WASM) — uses CDN with crossOriginIsolated
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      // Write the raw audio buffer to FFmpeg's virtual FS as WAV
      const inputBytes = audioBufferToWav(buffer);
      await ffmpeg.writeFile('input.wav', new Uint8Array(inputBytes));

      const trimDuration = trimEnd - trimStart;
      const outputFile = `output.${format}`;

      // Build FFmpeg command
      const args = [
        '-ss', trimStart.toFixed(4),
        '-t', trimDuration.toFixed(4),
        '-i', 'input.wav',
        '-af', `volume=${gain.toFixed(4)}`,
      ];

      if (format === 'mp3') {
        args.push('-codec:a', 'libmp3lame', '-q:a', '2');
      } else {
        args.push('-c:a', 'pcm_s16le');
      }

      args.push(outputFile);

      await ffmpeg.exec(args);

      const data = await ffmpeg.readFile(outputFile);
      const mimeType = format === 'mp3' ? 'audio/mpeg' : 'audio/wav';
      // Cast through ArrayBuffer to satisfy TypeScript's BlobPart constraint
      const blob = new Blob([(data as Uint8Array).buffer as ArrayBuffer], { type: mimeType });

      // Clean up old object URL before creating new one
      if (lastDownloadUrlRef.current) {
        URL.revokeObjectURL(lastDownloadUrlRef.current);
      }

      const url = URL.createObjectURL(blob);
      lastDownloadUrlRef.current = url;
      setDownloadUrl(url);
      setExportProgress(1);
      setStatus('done');

      // Clean up FFmpeg instance
      try { ffmpeg.terminate(); } catch (_) {}
      ffmpegRef.current = null;
    } catch (err: any) {
      console.error('[useMiniDAW] exportAudio error:', err);
      setErrorMessage(err?.message ?? 'Error durante el procesamiento con FFmpeg.');
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
function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = Math.min(buffer.numberOfChannels, 2);
  const sampleRate = buffer.sampleRate;
  const numSamples = buffer.length;
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

  // Interleave channels
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = buffer.getChannelData(ch)[i];
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
