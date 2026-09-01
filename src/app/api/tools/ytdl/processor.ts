import { spawn } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { ensureBinaries } from './binaries';

export interface AudioProcessOptions {
  format?: 'mp3' | 'wav' | 'flac' | 'm4a';
  quality?: '320' | '256' | '192' | '128';
  normalize?: boolean;
  trimSilence?: boolean;
}

export async function processAudioBuffer(
  inputBuffer: Buffer,
  options: AudioProcessOptions
): Promise<{ buffer: Buffer; format: string; mimeType: string }> {
  const {
    format = 'mp3',
    quality = '320',
    normalize = false,
    trimSilence = false,
  } = options;

  // If standard MP3 320k with no DSP filters requested, return directly for maximum speed
  if (format === 'mp3' && quality === '320' && !normalize && !trimSilence) {
    return {
      buffer: inputBuffer,
      format: 'mp3',
      mimeType: 'audio/mpeg',
    };
  }

  const { ffmpegPath } = await ensureBinaries();
  const tmpId = `dsp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const tmpIn = path.join(os.tmpdir(), `${tmpId}_in.mp3`);
  const tmpOut = path.join(os.tmpdir(), `${tmpId}_out.${format}`);

  await fs.promises.writeFile(tmpIn, inputBuffer);

  try {
    const args = ['-i', tmpIn, '-y'];

    // Audio Filters (DSP)
    const filters: string[] = [];
    if (trimSilence) {
      filters.push(
        'silenceremove=start_threshold=-50dB:start_duration=0.5:stop_threshold=-50dB:stop_duration=0.5'
      );
    }
    if (normalize) {
      filters.push('loudnorm=I=-16:TP=-1.5:LRA=11');
    }

    if (filters.length > 0) {
      args.push('-af', filters.join(','));
    }

    // Codec & Quality mapping
    switch (format) {
      case 'wav':
        args.push('-codec:a', 'pcm_s16le');
        break;
      case 'flac':
        args.push('-codec:a', 'flac');
        break;
      case 'm4a':
        args.push('-codec:a', 'aac', '-b:a', `${quality}k`);
        break;
      case 'mp3':
      default:
        args.push('-codec:a', 'libmp3lame', '-b:a', `${quality}k`);
        break;
    }

    args.push(tmpOut);

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(ffmpegPath, args);
      let stderr = '';
      proc.stderr.on('data', (d) => (stderr += d.toString()));
      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(tmpOut)) {
          resolve();
        } else {
          reject(
            new Error(
              `FFmpeg post-processing failed (code ${code}): ${stderr.slice(-250)}`
            )
          );
        }
      });
      proc.on('error', reject);
    });

    const outBuffer = await fs.promises.readFile(tmpOut);

    const mimeTypes: Record<string, string> = {
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      flac: 'audio/flac',
      m4a: 'audio/mp4',
    };

    return {
      buffer: outBuffer,
      format,
      mimeType: mimeTypes[format] || 'audio/mpeg',
    };
  } finally {
    // Cleanup temporary files
    try {
      if (fs.existsSync(tmpIn)) await fs.promises.unlink(tmpIn);
      if (fs.existsSync(tmpOut)) await fs.promises.unlink(tmpOut);
    } catch (e) {}
  }
}
