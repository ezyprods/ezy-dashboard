const fs = require('fs');
const path = require('path');

// Logic for parsing audio filename
function parseAudioFilename(filename) {
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '').trim();

  let bpm = null;
  let key = null;
  let cleanTitle = nameWithoutExt;

  // 1. Extract BPM
  const bpmMatch = nameWithoutExt.match(/(?:^|[\s\-_])(\d{2,3})\s*(?:bpm|BPM)(?:[\s\-_]|$)/);
  if (bpmMatch) {
    const val = parseInt(bpmMatch[1], 10);
    if (val >= 40 && val <= 300) bpm = val;
  }

  // 2. Extract Key
  const keyRegex = /(?:^|[\s\-_])([A-G][#b]?(?:m|min|minor|maj|major)?)(?:[\s\-_]|$)/i;
  const keyMatch = nameWithoutExt.match(keyRegex);
  if (keyMatch) {
    key = keyMatch[1];
  }

  // 3. Clean Title
  let temp = nameWithoutExt
    .replace(/^(\d{1,3})\s*[-_.]\s*/, '')
    .replace(/@\w+/g, '')
    .replace(/(?:^|[\s\-_])\d{2,3}\s*(?:bpm|BPM)(?:[\s\-_]|$)/gi, ' ')
    .replace(/(?:purchase tag|wav untagged|untagged|purchase|tag|wav|mp3|demo|bounce)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (temp) {
    cleanTitle = temp.charAt(0).toUpperCase() + temp.slice(1);
  }

  return { cleanTitle, bpm, key };
}

// Check if an audio file is a work sample / looperman / temp
function isIgnoredSample(filename) {
  const lower = filename.toLowerCase();
  if (lower.startsWith('looperman-')) return true;
  if (lower.startsWith('sample-')) return true;
  if (lower.startsWith('loop_') || lower.startsWith('loop 1') || lower.startsWith('loop 2')) return true;
  if (lower.includes('base improvisar')) return true;
  if (lower.endsWith('.flp') || lower.endsWith('.zpa') || lower.endsWith('.fst') || lower.endsWith('.fxp') || lower.endsWith('.asd')) return true;
  return false;
}

// Select the definitive audio file from a list of audio files in a project folder
function selectDefinitiveAudio(files) {
  // Filter only valid audio files
  const audios = files.filter(f => {
    const ext = path.extname(f.name).toLowerCase();
    if (!['.wav', '.mp3', '.flac', '.m4a', '.aiff'].includes(ext)) return false;
    if (isIgnoredSample(f.name)) return false;
    return true;
  });

  if (audios.length === 0) return null;
  if (audios.length === 1) return audios[0];

  // Scoring algorithm for definitive version:
  // 1. WAV (+100) vs MP3 (+0) (User rule: if wav exists, upload wav)
  // 2. Untagged (+50) vs Purchase Tag (-50)
  // 3. Master / Final / Mix (+30)
  // 4. Version number (v2 > v1)
  // 5. Modified time (more recent = higher score)

  const scored = audios.map(file => {
    let score = 0;
    const nameLower = file.name.toLowerCase();
    const ext = path.extname(file.name).toLowerCase();

    // 1. WAV priority
    if (ext === '.wav') score += 1000;
    else if (ext === '.flac') score += 800;
    else if (ext === '.mp3') score += 500;

    // 2. Untagged priority
    if (nameLower.includes('untagged') || nameLower.includes('no tag')) score += 200;
    if (nameLower.includes('purchase tag') || nameLower.includes('tagged')) score -= 200;

    // 3. Final / Master / Clean
    if (nameLower.includes('master') || nameLower.includes('final')) score += 100;
    if (nameLower.includes('mix')) score += 50;

    // 4. Version numbering (v2, v3, etc.)
    const vMatch = nameLower.match(/v(\d+)/);
    if (vMatch) {
      score += parseInt(vMatch[1], 10) * 20;
    }

    // 5. Recency
    if (file.mtime) {
      score += (file.mtime.getTime() / 1e12); // subtle tie-breaker
    }

    return { file, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].file;
}

// Scanner
function scanDirectory(basePath, categoryDefault = 'beat', yearDefault = null, monthDefault = null) {
  const projects = [];

  function walk(currentPath, depth = 0, currentYear = yearDefault, currentMonth = monthDefault, currentCat = categoryDefault) {
    try {
      const items = fs.readdirSync(currentPath, { withFileTypes: true });
      const files = [];
      const subdirs = [];

      for (const item of items) {
        const full = path.join(currentPath, item.name);
        if (item.isDirectory()) {
          subdirs.push(item);
        } else {
          let mtime = null;
          let size = 0;
          try {
            const st = fs.statSync(full);
            mtime = st.mtime;
            size = st.size;
          } catch (e) {}
          files.push({ name: item.name, path: full, size, mtime });
        }
      }

      const folderName = path.basename(currentPath);

      // Check if this folder itself is a Year folder (e.g. 2021, 2022, 2023, 2024)
      const yearMatch = folderName.match(/^(202\d)$/);
      let detectedYear = currentYear;
      if (yearMatch) {
        detectedYear = parseInt(yearMatch[1], 10);
      }

      // Check if this folder is a Month folder (e.g. "1- Febrero", "2 - Febrero", "10 - Octubre")
      let detectedMonth = currentMonth;
      const monthMatch = folderName.match(/^(\d{1,2})\s*[-_]/);
      if (monthMatch && detectedYear && !folderName.toLowerCase().includes('bpm')) {
        const mNum = parseInt(monthMatch[1], 10);
        if (mNum >= 1 && mNum <= 12) {
          detectedMonth = mNum;
        }
      }

      // Determine category overrides
      let detectedCat = currentCat;
      const lowerFolder = folderName.toLowerCase();
      if (currentPath.toLowerCase().includes('grabaci') || lowerFolder.includes('grabaci')) {
        detectedCat = 'grabacion';
      } else if (lowerFolder.includes('mashup') || lowerFolder.includes('remix')) {
        detectedCat = 'mashup';
      } else if (lowerFolder.includes('loop') || lowerFolder.includes('pack') || lowerFolder.includes('sound kit')) {
        detectedCat = 'loop_pack';
      } else if (lowerFolder.includes('colab') || lowerFolder.includes(' x ') || lowerFolder.includes(' vs ')) {
        detectedCat = 'colaboracion';
      }

      // Check if this folder contains .flp or audio files
      const hasFlp = files.some(f => f.name.toLowerCase().endsWith('.flp'));
      const audioCandidate = selectDefinitiveAudio(files);

      // If this folder has an audio candidate and is a leaf / project folder
      if (audioCandidate) {
        const parsedAudio = parseAudioFilename(audioCandidate.name);
        const parsedFolder = parseAudioFilename(folderName);

        // Title preference: clean title from folder or clean title from audio
        let projectTitle = parsedFolder.cleanTitle || parsedAudio.cleanTitle || folderName;
        if (projectTitle.length < 3 && parsedAudio.cleanTitle) {
          projectTitle = parsedAudio.cleanTitle;
        }

        const bpm = parsedAudio.bpm || parsedFolder.bpm || undefined;
        const key = parsedAudio.key || parsedFolder.key || undefined;

        projects.push({
          folderPath: currentPath,
          folderName,
          title: projectTitle,
          category: detectedCat,
          year: detectedYear || 2023,
          month: detectedMonth || 1,
          bpm,
          key,
          audioFile: {
            name: audioCandidate.name,
            path: audioCandidate.path,
            sizeMB: (audioCandidate.size / (1024 * 1024)).toFixed(2),
            ext: path.extname(audioCandidate.name).toLowerCase(),
            mtime: audioCandidate.mtime,
          },
          allAudioCount: files.filter(f => /\.(mp3|wav|flac|m4a)$/i.test(f.name)).length,
          hasFlp,
        });
      } else {
        // If it's not a project folder itself, walk subdirectories
        for (const sub of subdirs) {
          walk(path.join(currentPath, sub.name), depth + 1, detectedYear, detectedMonth, detectedCat);
        }
      }
    } catch (e) {
      console.error('Error walking', currentPath, e.message);
    }
  }

  walk(basePath);
  return projects;
}

console.log('=== ESCANEANDO PLAN DE IMPORTACIÓN REAL ===\n');

const ezyRoot = 'D:\\FL Studio\\Proyectos\\Proyectos Ezy';
const scanned = scanDirectory(ezyRoot, 'beat');

console.log(`\n🎯 TOTAL PROYECTOS CON AUDIO DEFINITIVO ENCONTRADOS: ${scanned.length}`);

// Desglose por formato (.wav vs .mp3)
const wavs = scanned.filter(p => p.audioFile.ext === '.wav').length;
const mp3s = scanned.filter(p => p.audioFile.ext === '.mp3').length;
const others = scanned.length - wavs - mp3s;
const totalSizeMB = scanned.reduce((acc, p) => acc + parseFloat(p.audioFile.sizeMB), 0);

console.log(`\n📦 FORMATOS DE AUDIO SELECCIONADOS:`);
console.log(`  • WAV (Alta calidad): ${wavs} archivos`);
console.log(`  • MP3 (Comprimido): ${mp3s} archivos`);
console.log(`  • Otros: ${others} archivos`);
console.log(`  • Tamaño total a subir a Drive: ${(totalSizeMB / 1024).toFixed(2)} GB (${totalSizeMB.toFixed(0)} MB)`);

// Desglose por categoría
const catStats = {};
for (const p of scanned) {
  catStats[p.category] = (catStats[p.category] || 0) + 1;
}
console.log(`\n🏷️ DESGLOSE POR CATEGORÍA:`);
console.log(JSON.stringify(catStats, null, 2));

// Desglose por Año
const yrStats = {};
for (const p of scanned) {
  yrStats[p.year] = (yrStats[p.year] || 0) + 1;
}
console.log(`\n📅 DESGLOSE POR AÑO:`);
console.log(JSON.stringify(yrStats, null, 2));

console.log(`\n✨ MUESTRA DE 20 PROYECTOS A IMPORTAR:`);
scanned.slice(0, 20).forEach((p, idx) => {
  console.log(`${idx + 1}. [${p.category.toUpperCase()}] "${p.title}" | ${p.bpm ? p.bpm + ' BPM' : 'N/D'} | ${p.key || 'N/D'} | ${p.year}/${p.month} | Audio: ${p.audioFile.name} (${p.audioFile.sizeMB} MB)`);
});
