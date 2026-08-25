// src/lib/utils/audio.ts

export const RELATIVE_KEYS: Record<string, string> = {
  'B': 'B | G#m / Abm',
  'A#': 'A# / Bb | Gm',
  'Bb': 'A# / Bb | Gm',
  'A': 'A | F#m / Gbm',
  'G#': 'G# / Ab | Fm',
  'Ab': 'G# / Ab | Fm',
  'G': 'G | Em',
  'F#': 'F# / Gb | D#m / Ebm',
  'Gb': 'F# / Gb | D#m / Ebm',
  'F': 'F | Dm',
  'E': 'E | C#m / Dbm',
  'D#': 'D# / Eb | Cm',
  'Eb': 'D# / Eb | Cm',
  'D': 'D | Bm',
  'C#': 'C# / Db | A#m / Bbm',
  'Db': 'C# / Db | A#m / Bbm',
  'C': 'C | Am',
  // Minors
  'G#m': 'B | G#m / Abm',
  'Abm': 'B | G#m / Abm',
  'Gm': 'A# / Bb | Gm',
  'F#m': 'A | F#m / Gbm',
  'Gbm': 'A | F#m / Gbm',
  'Fm': 'G# / Ab | Fm',
  'Em': 'G | Em',
  'D#m': 'F# / Gb | D#m / Ebm',
  'Ebm': 'F# / Gb | D#m / Ebm',
  'Dm': 'F | Dm',
  'C#m': 'E | C#m / Dbm',
  'Dbm': 'E | C#m / Dbm',
  'Cm': 'D# / Eb | Cm',
  'Bm': 'D | Bm',
  'A#m': 'C# / Db | A#m / Bbm',
  'Bbm': 'C# / Db | A#m / Bbm',
  'Am': 'C | Am',
};

export function formatMusicalKey(keyStr: string | null | undefined): string | null {
  if (!keyStr) return null;
  // If it's already formatted, return as is
  if (keyStr.includes('|')) return keyStr;

  let base = keyStr.trim();
  let isMinor = false;
  
  if (base.toLowerCase().includes('menor') || base.toLowerCase().includes('minor') || base.endsWith('m') || base.endsWith('min')) {
    isMinor = true;
  }
  
  // Extract just the note (e.g. C, C#, Bb)
  let note = base.replace(/mayor|menor|major|minor|maj|min/gi, '').trim();
  
  // Normalize casing (e.g. g# -> G#, bb -> Bb)
  if (note.length > 0) {
    note = note.charAt(0).toUpperCase() + note.slice(1).toLowerCase();
  }

  // Remove trailing 'm' if it was there so we have a clean note
  if (note.endsWith('m')) {
    note = note.slice(0, -1).trim();
    isMinor = true;
  }

  // Combine back
  if (isMinor) note += 'm';

  return RELATIVE_KEYS[note] || keyStr;
}

export function getShortKey(keyStr: string | null | undefined): string {
  if (!keyStr) return '';
  if (keyStr.includes('|')) {
    const firstPart = keyStr.split('|')[0].trim();
    // E.g., "C# / Db" -> "C#" or "G#m / Abm" -> "G#m"
    return firstPart.split('/')[0].trim();
  }
  return keyStr.trim();
}

export interface ParsedAudioFilename {
  bpm: number | null;
  key: string | null;
  rawKey: string | null;
  cleanTitle: string;
  index: string | null;
  hasProducerTag: boolean;
}

/**
 * Robust audio filename parser for producer naming conventions.
 * Handles patterns such as:
 * - "01 - G#m 130BPM - Midnight Dream @ezyprods.wav"
 * - "12 - 140 BPM D#min - Fuego Lento @ezyprods.mp3"
 * - "Midnight Dream [G#m 130BPM] @ezyprods.wav"
 * - "DARK_DRILL_142BPM_C#m_@ezyprods.wav"
 * - "Am 120BPM - Guitar Loop.wav"
 */
export function parseAudioFilename(fileName: string): ParsedAudioFilename {
  if (!fileName) {
    return { bpm: null, key: null, rawKey: null, cleanTitle: '', index: null, hasProducerTag: false };
  }

  // Strip file extension
  const extMatch = fileName.match(/\.[^.]+$/);
  let working = fileName.replace(/\.[^.]+$/, '').trim();

  // Check producer tag
  const hasProducerTag = /@ezyprods\b|prod\.?\s*by\s*ezy/i.test(working);
  working = working.replace(/@ezyprods\b/gi, '').replace(/\(prod\.?\s*(?:by)?\s*ezy\)/gi, '').trim();

  // Extract index prefix (e.g., "01 - ", "[01] ", "1. ", "03_")
  let index: string | null = null;
  const indexMatch = working.match(/^(?:\[(\d{1,3})\]|(\d{1,3})\s*[-_.)]\s*)/);
  if (indexMatch) {
    index = indexMatch[1] || indexMatch[2];
    working = working.replace(/^(?:\[\d{1,3}\]|\d{1,3}\s*[-_.)]\s*)/, '').trim();
  }

  // 1. Extract BPM
  let bpm: number | null = null;
  // Match "130BPM", "130 BPM", "130.5 bpm"
  const bpmExplicitMatch = working.match(/\b(\d{2,3}(?:\.\d+)?)\s*(?:bpm|BPM)\b/i);
  if (bpmExplicitMatch) {
    bpm = Math.round(parseFloat(bpmExplicitMatch[1]));
    working = working.replace(/\b\d{2,3}(?:\.\d+)?\s*(?:bpm|BPM)\b/gi, ' ').trim();
  } else {
    // Fallback: bracketed or isolated number between 55 and 210 (not years like 2024)
    const bpmIsolatedMatch = working.match(/[\[\(_\-\s](\d{2,3})[\]\)_\-\s]/);
    if (bpmIsolatedMatch) {
      const val = parseInt(bpmIsolatedMatch[1], 10);
      if (val >= 55 && val <= 210 && val !== 100) {
        bpm = val;
        working = working.replace(bpmIsolatedMatch[0], ' ').trim();
      }
    }
  }

  // 2. Extract Key (Tonalidad)
  let rawKey: string | null = null;
  let key: string | null = null;

  // Regex matches:
  // - Notes with explicit mode: "G#m", "G#min", "G# Minor", "C#menor", "F#maj", "Bb Major", "Am", "Dm"
  // - Notes with accidentals: "C#", "F#", "G#", "Eb", "Bb", "Ab", "D#"
  // - Single note letter when next to BPM or standalone: "A min", "C Maj"
  const keyExplicitRegex = /\b([A-Ga-g][#b]?)\s*(min|minor|menor|maj|major|mayor|m)?\b/i;
  const keyMatches = Array.from(working.matchAll(new RegExp(keyExplicitRegex, 'gi')));

  for (const km of keyMatches) {
    const note = km[1].toUpperCase();
    const mode = (km[2] || '').toLowerCase();
    
    // Ignore false positive English words like "A", "In" unless it has an accidental or explicit mode
    const isSinglePlainLetter = /^[A-G]$/.test(note);
    if (isSinglePlainLetter && !mode) {
      continue;
    }

    rawKey = km[0].trim();
    let normalized = note;
    if (mode.startsWith('m') && !mode.startsWith('maj') && !mode.startsWith('may')) {
      normalized += 'm';
    }
    key = formatMusicalKey(normalized);
    
    // Remove detected key from working title
    working = working.replace(km[0], ' ').trim();
    break;
  }

  // 3. Clean up the remaining title
  let cleanTitle = working
    .replace(/^\[.*?\]\s*/, '')
    .replace(/^(Master|Bounce|Mix|Stem|Demo)_/i, '')
    .replace(/[\[\](){}_]/g, ' ')
    .replace(/\s*-\s*-\s*/g, ' - ')
    .replace(/^[-_\s]+|[-_\s]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!cleanTitle) {
    cleanTitle = fileName.replace(/\.[^.]+$/, '').trim();
  }

  return {
    bpm,
    key,
    rawKey,
    cleanTitle,
    index,
    hasProducerTag,
  };
}

/**
 * Formats a filename according to the producer's standard pattern:
 * "[Key] [BPM]BPM - [Title] @ezyprods.ext"
 */
export function formatProducerFilename(
  originalFileName: string,
  title?: string,
  bpm?: number | null,
  key?: string | null
): string {
  const extMatch = originalFileName.match(/\.[^.]+$/);
  const ext = extMatch ? extMatch[0] : '';
  const cleanTitle = (title || originalFileName.replace(/\.[^.]+$/, '')).trim();

  const parts: string[] = [];
  if (key) {
    parts.push(getShortKey(key));
  }
  if (bpm) {
    parts.push(`${bpm}BPM`);
  }

  const prefix = parts.join(' ');
  const baseWithPrefix = prefix ? `${prefix} - ${cleanTitle}` : cleanTitle;
  const finalWithTag = baseWithPrefix.toLowerCase().includes('@ezyprods')
    ? baseWithPrefix
    : `${baseWithPrefix} @ezyprods`;

  return `${finalWithTag}${ext}`;
}

// ─── Audio Feature Detection (Client-Side Only) ──────────────────────────────
export async function detectAudioFeatures(file: File | Blob): Promise<{ bpm: number | null; key: string | null }> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const AudioCtxClass: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtxClass) return { bpm: null, key: null };
    
    const audioCtx = new AudioCtxClass();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    audioCtx.close();

    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;

    // ── BPM via Onset/Energy Autocorrelation
    const hopSize = 1024;
    const energyFrames: number[] = [];
    for (let i = 0; i < channelData.length - hopSize; i += hopSize) {
      let sum = 0;
      for (let j = 0; j < hopSize; j++) {
        sum += channelData[i + j] ** 2;
      }
      energyFrames.push(Math.sqrt(sum / hopSize));
    }

    const onset: number[] = [0];
    for (let i = 1; i < energyFrames.length; i++) {
      const diff = energyFrames[i] - energyFrames[i - 1];
      onset.push(Math.max(0, diff));
    }

    const frameRate = sampleRate / hopSize;
    const minBPM = 60, maxBPM = 180;
    const minLag = Math.round((60 / maxBPM) * frameRate);
    const maxLag = Math.round((60 / minBPM) * frameRate);
    
    let bestLag = minLag, bestCorr = -Infinity;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let corr = 0;
      for (let i = 0; i < onset.length - lag; i++) {
        corr += onset[i] * onset[i + lag];
      }
      if (corr > bestCorr) {
        bestCorr = corr;
        bestLag = lag;
      }
    }

    const rawBpm = (60 / bestLag) * frameRate;
    let bpm = rawBpm;
    while (bpm > 180) bpm /= 2;
    while (bpm < 60) bpm *= 2;
    const finalBpm = energyFrames.length > 10 ? Math.round(bpm) : null;

    // ── Key Detection
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const majorProfile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
    const minorProfile = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

    const start = Math.floor(channelData.length * 0.3);
    const sampleLen = Math.min(Math.floor(sampleRate * 4), channelData.length - start);
    const sample = channelData.slice(start, start + sampleLen);

    const chromagram = new Array(12).fill(0);
    for (let n = 0; n < 12; n++) {
      const freq = 261.63 * Math.pow(2, n / 12);
      let real = 0, imag = 0;
      for (let i = 0; i < sample.length; i += 8) {
        const t = i / sampleRate;
        const phase = 2 * Math.PI * freq * t;
        real += sample[i] * Math.cos(phase);
        imag += sample[i] * Math.sin(phase);
      }
      chromagram[n] = Math.sqrt(real * real + imag * imag);
    }

    const chromaMax = Math.max(...chromagram);
    const normChroma = chromaMax > 0 ? chromagram.map(v => v / chromaMax) : chromagram;

    function pearson(a: number[], b: number[]): number {
      const meanA = a.reduce((x, y) => x + y, 0) / a.length;
      const meanB = b.reduce((x, y) => x + y, 0) / b.length;
      let num = 0, denA = 0, denB = 0;
      for (let i = 0; i < a.length; i++) {
        num += (a[i] - meanA) * (b[i] - meanB);
        denA += (a[i] - meanA) ** 2;
        denB += (b[i] - meanB) ** 2;
      }
      return denA > 0 && denB > 0 ? num / Math.sqrt(denA * denB) : 0;
    }

    let bestKey = 'C', bestScore = -Infinity, bestMode = 'maj';
    for (let i = 0; i < 12; i++) {
      const rotatedChroma = [...normChroma.slice(i), ...normChroma.slice(0, i)];
      const majScore = pearson(rotatedChroma, majorProfile);
      const minScore = pearson(rotatedChroma, minorProfile);
      if (majScore > bestScore) { bestScore = majScore; bestKey = noteNames[i]; bestMode = 'maj'; }
      if (minScore > bestScore) { bestScore = minScore; bestKey = noteNames[i]; bestMode = 'min'; }
    }

    const rawKeyStr = `${bestKey} ${bestMode === 'maj' ? 'Mayor' : 'Menor'}`;
    const formattedKey = formatMusicalKey(rawKeyStr);
    
    return { bpm: finalBpm, key: formattedKey };
  } catch (err) {
    console.error("detectAudioFeatures error:", err);
    return { bpm: null, key: null };
  }
}
