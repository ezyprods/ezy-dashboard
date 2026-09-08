declare module 'demucs-web' {
  export const CONSTANTS: {
    SAMPLE_RATE: number;
    FFT_SIZE: number;
    HOP_SIZE: number;
    TRAINING_SAMPLES: number;
    MODEL_SPEC_BINS: number;
    MODEL_SPEC_FRAMES: number;
    SEGMENT_OVERLAP: number;
    TRACKS: string[];
    DEFAULT_MODEL_URL: string;
  };

  export class DemucsProcessor {
    constructor(options?: any);
    loadModel(modelPathOrBuffer?: string | ArrayBuffer): Promise<any>;
    separate(leftChannel: Float32Array, rightChannel: Float32Array): Promise<{
      drums: { left: Float32Array; right: Float32Array };
      bass: { left: Float32Array; right: Float32Array };
      other: { left: Float32Array; right: Float32Array };
      vocals: { left: Float32Array; right: Float32Array };
    }>;
    onProgress: (info: { progress: number; currentSegment: number; totalSegments: number }) => void;
    onLog: (phase: string, message: string) => void;
    onDownloadProgress: (loaded: number, total: number) => void;
  }

  export function stft(signal: Float32Array, fftSize: number, hopSize: number): any;
  export function istft(real: Float32Array, imag: Float32Array, numFrames: number, numBins: number, fftSize: number, hopSize: number, targetLength?: number): Float32Array;
  export function reflectPad(array: Float32Array, padLeft: number, padRight: number): Float32Array;
}
