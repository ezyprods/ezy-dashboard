import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import { writeFile, unlink } from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import MusicTempo from 'music-tempo';
// @ts-ignore
import Meyda from 'meyda';

let ffmpegPath: string;
try {
  ffmpegPath = require('ffmpeg-static') || 'ffmpeg';
} catch (e) {
  ffmpegPath = 'ffmpeg';
}

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

const REL_MINOR: Record<string, string> = { 'C':'A Menor', 'C#':'A# Menor', 'D':'B Menor', 'D#':'C Menor', 'E':'C# Menor', 'F':'D Menor', 'F#':'D# Menor', 'G':'E Menor', 'G#':'F Menor', 'A':'F# Menor', 'A#':'G Menor', 'B':'G# Menor' };
const REL_MAJOR: Record<string, string> = { 'C':'D# Mayor', 'C#':'E Mayor', 'D':'F Mayor', 'D#':'F# Mayor', 'E':'G Mayor', 'F':'G# Mayor', 'F#':'A Mayor', 'G':'A# Mayor', 'G#':'B Mayor', 'A':'C Mayor', 'A#':'C# Mayor', 'B':'D Mayor' };

function getCorrelation(chroma: number[], profile: number[], shift: number) {
  const n = 12;
  let sumC = 0, sumP = 0;
  for (let i = 0; i < n; i++) {
    sumC += chroma[(i + shift) % 12];
    sumP += profile[i];
  }
  const meanC = sumC / n, meanP = sumP / n;
  let num = 0, denC = 0, denP = 0;
  for (let i = 0; i < n; i++) {
    const cVal = chroma[(i + shift) % 12] - meanC;
    const pVal = profile[i] - meanP;
    num += cVal * pVal;
    denC += cVal * cVal;
    denP += pVal * pVal;
  }
  return num / Math.sqrt((denC * denP) || 1);
}

function analyzeKey(chromagram: number[]) {
  let maxCorr = -1;
  let bestKey = '';
  let isMajor = true;

  for (let i = 0; i < 12; i++) {
    const corrMaj = getCorrelation(chromagram, MAJOR_PROFILE, i);
    if (corrMaj > maxCorr) {
      maxCorr = corrMaj;
      bestKey = NOTES[i];
      isMajor = true;
    }
    const corrMin = getCorrelation(chromagram, MINOR_PROFILE, i);
    if (corrMin > maxCorr) {
      maxCorr = corrMin;
      bestKey = NOTES[i];
      isMajor = false;
    }
  }

  if (isMajor) {
    return { key: bestKey + ' Mayor', relative: REL_MINOR[bestKey], isMajor };
  } else {
    return { key: bestKey + ' Menor', relative: REL_MAJOR[bestKey], isMajor };
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No se proporcionó archivo' }, { status: 400 });
    }

    const tempDir = path.join(os.tmpdir(), 'ezy_audio_tools');
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    const inputPath = path.join(tempDir, file.name);
    await writeFile(inputPath, buffer);

    return new Promise((resolve) => {
      const args = ['-i', inputPath, '-t', '60', '-ac', '1', '-ar', '22050', '-f', 'f32le', '-c:a', 'pcm_f32le', 'pipe:1'];
      const ffmpegProc = spawn(ffmpegPath, args);
      
      const chunks: Buffer[] = [];
      ffmpegProc.stdout.on('data', chunk => chunks.push(chunk));
      
      ffmpegProc.on('close', async (code) => {
        await unlink(inputPath).catch(() => {});
        
        const audioBuffer = Buffer.concat(chunks);
        if (audioBuffer.length === 0) {
          return resolve(NextResponse.json({ error: 'No se pudo decodificar el audio' }, { status: 500 }));
        }
        
        const floatArray = new Float32Array(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.byteLength / 4);
        
        let tempo = 0;
        try {
          const mt = new MusicTempo(floatArray);
          tempo = Math.round(mt.tempo);
        } catch(e) { 
          console.error('BPM error', e); 
        }
        
        let chromagram = new Array(12).fill(0);
        const bufferSize = 4096;
        Meyda.bufferSize = bufferSize;
        Meyda.sampleRate = 22050;

        for (let i = 0; i < floatArray.length - bufferSize; i += bufferSize) {
          const frame = floatArray.subarray(i, i + bufferSize);
          const chroma = Meyda.extract('chroma', frame);
          if (chroma && chroma.length === 12) {
            for (let j = 0; j < 12; j++) chromagram[j] += chroma[j];
          }
        }
        
        const keyInfo = analyzeKey(chromagram);
        
        resolve(NextResponse.json({ 
          bpm: tempo, 
          key: keyInfo.key, 
          relative: keyInfo.relative, 
          isMajor: keyInfo.isMajor 
        }));
      });
      
      ffmpegProc.on('error', async (err) => {
        await unlink(inputPath).catch(() => {});
        resolve(NextResponse.json({ error: err.message }, { status: 500 }));
      });
    });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
