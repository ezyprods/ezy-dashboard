const fs = require('fs');
const path = require('path');

function isIgnoredSample(filename) {
  const lower = filename.toLowerCase();
  if (lower.startsWith('looperman-')) return true;
  if (lower.startsWith('sample-')) return true;
  if (lower.startsWith('recording-')) return false; // Could be a vocal take / bounce
  if (lower.includes('base improvisar')) return true;
  if (lower.endsWith('.flp') || lower.endsWith('.zpa') || lower.endsWith('.fst') || lower.endsWith('.fxp') || lower.endsWith('.asd')) return true;
  return false;
}

function parseAudioFilename(filename) {
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '').trim();

  let bpm = null;
  let key = null;
  let cleanTitle = nameWithoutExt;

  const bpmMatch = nameWithoutExt.match(/(?:^|[\s\-_])(\d{2,3})\s*(?:bpm|BPM)(?:[\s\-_]|$)/);
  if (bpmMatch) {
    const val = parseInt(bpmMatch[1], 10);
    if (val >= 40 && val <= 300) bpm = val;
  }

  const keyRegex = /(?:^|[\s\-_])([A-G][#b]?(?:m|min|minor|maj|major)?)(?:[\s\-_]|$)/i;
  const keyMatch = nameWithoutExt.match(keyRegex);
  if (keyMatch) {
    key = keyMatch[1];
  }

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

function selectDefinitiveAudio(files) {
  const audios = files.filter(f => {
    const ext = path.extname(f.name).toLowerCase();
    if (!['.wav', '.mp3', '.flac', '.m4a', '.aiff'].includes(ext)) return false;
    if (isIgnoredSample(f.name)) return false;
    return true;
  });

  if (audios.length === 0) return null;
  if (audios.length === 1) return audios[0];

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

    // 4. Version number
    const vMatch = nameLower.match(/v(\d+)/);
    if (vMatch) score += parseInt(vMatch[1], 10) * 20;

    // 5. Recency
    if (file.mtime) score += (file.mtime.getTime() / 1e12);

    return { file, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].file;
}

function scanLocation(basePath, categoryDefault = 'beat', yearDefault = null, monthDefault = null) {
  if (!fs.existsSync(basePath)) return [];
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
          let mtime = null, size = 0;
          try {
            const st = fs.statSync(full);
            mtime = st.mtime;
            size = st.size;
          } catch (e) {}
          files.push({ name: item.name, path: full, size, mtime });
        }
      }

      const folderName = path.basename(currentPath);

      // Detect year
      const yearMatch = folderName.match(/^(202\d)$/);
      let detectedYear = currentYear;
      if (yearMatch) detectedYear = parseInt(yearMatch[1], 10);

      // Detect month
      let detectedMonth = currentMonth;
      const monthMatch = folderName.match(/^(\d{1,2})\s*[-_]/);
      if (monthMatch && detectedYear && !folderName.toLowerCase().includes('bpm')) {
        const mNum = parseInt(monthMatch[1], 10);
        if (mNum >= 1 && mNum <= 12) detectedMonth = mNum;
      }

      // Detect category
      let detectedCat = currentCat;
      const lowerFolder = folderName.toLowerCase();
      const lowerPath = currentPath.toLowerCase();
      if (lowerPath.includes('grabaci') || lowerFolder.includes('grabaci')) {
        detectedCat = 'grabacion';
      } else if (lowerPath.includes('mashup') || lowerFolder.includes('mashup') || lowerFolder.includes('remix')) {
        detectedCat = 'mashup';
      } else if (lowerPath.includes('loop') || lowerFolder.includes('pack') || lowerFolder.includes('sound kit')) {
        detectedCat = 'loop_pack';
      } else if (lowerFolder.includes('colab') || lowerFolder.includes(' x ') || lowerFolder.includes(' vs ') || lowerFolder.includes('x sneaky')) {
        detectedCat = 'colaboracion';
      }

      // Check for audio candidate
      const audioCandidate = selectDefinitiveAudio(files);

      if (audioCandidate) {
        const parsedAudio = parseAudioFilename(audioCandidate.name);
        const parsedFolder = parseAudioFilename(folderName);

        let projectTitle = parsedFolder.cleanTitle || parsedAudio.cleanTitle || folderName;
        if (projectTitle.length < 3 && parsedAudio.cleanTitle) {
          projectTitle = parsedAudio.cleanTitle;
        }

        const bpm = parsedAudio.bpm || parsedFolder.bpm || undefined;
        const key = parsedAudio.key || parsedFolder.key || undefined;

        let finalYear = detectedYear;
        let finalMonth = detectedMonth;
        if (!finalYear && audioCandidate.mtime) {
          finalYear = audioCandidate.mtime.getFullYear();
          finalMonth = audioCandidate.mtime.getMonth() + 1;
        }

        projects.push({
          folderPath: currentPath,
          folderName,
          title: projectTitle,
          category: detectedCat,
          year: finalYear || 2024,
          month: finalMonth || 1,
          bpm,
          key,
          audioFile: {
            name: audioCandidate.name,
            path: audioCandidate.path,
            sizeMB: (audioCandidate.size / (1024 * 1024)).toFixed(2),
            sizeBytes: audioCandidate.size,
            ext: path.extname(audioCandidate.name).toLowerCase(),
            mtime: audioCandidate.mtime,
          },
        });
      } else {
        for (const sub of subdirs) {
          // Avoid deep node_modules or system folders
          if (sub.name.startsWith('.')) continue;
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

console.log('=== ESCANEO UNIVERSAL DE TODOS LOS PROYECTOS (D: y Z:) ===\n');

const locations = [
  { path: 'D:\\FL Studio\\Proyectos\\Proyectos Ezy', cat: 'beat', label: 'D:\\ Proyectos Ezy' },
  { path: 'Z:\\FL Studio\\Proyectos\\Proyectos Ezy', cat: 'beat', label: 'Z:\\ Proyectos Ezy (Recientes 2024-2026)' },
  { path: 'Z:\\FL Studio\\Proyectos\\Grabaciones', cat: 'grabacion', label: 'Z:\\ Grabaciones' },
  { path: 'Z:\\FL Studio\\Proyectos\\Mashups', cat: 'mashup', label: 'Z:\\ Mashups' },
  { path: 'Z:\\FL Studio\\Proyectos\\Temas', cat: 'beat', label: 'Z:\\ Temas' },
  { path: 'Z:\\FL Studio\\Proyectos\\Beat Contest Rocket', cat: 'beat', label: 'Z:\\ Beat Contest Rocket' },
  { path: 'D:\\FL Studio\\Proyectos\\Proyectos Portátil\\Proyectos Ezy', cat: 'beat', label: 'D:\\ Proyectos Portátil' },
];

let allDetected = [];
const seenPaths = new Set();
const seenTitles = new Map();

for (const loc of locations) {
  const found = scanLocation(loc.path, loc.cat);
  console.log(`📍 ${loc.label}: ${found.length} proyectos encontrados con audio.`);
  for (const p of found) {
    if (!seenPaths.has(p.folderPath)) {
      seenPaths.add(p.folderPath);
      allDetected.push(p);
    }
  }
}

console.log(`\n🎯 TOTAL PROYECTOS ÚNICOS CON AUDIO DETECTADOS: ${allDetected.length}`);

// Breakdown by Year
const byYear = {};
for (const p of allDetected) {
  byYear[p.year] = (byYear[p.year] || 0) + 1;
}
console.log('\n📅 Desglose por Año:');
console.log(JSON.stringify(byYear, null, 2));

// Breakdown by Category
const byCat = {};
for (const p of allDetected) {
  byCat[p.category] = (byCat[p.category] || 0) + 1;
}
console.log('\n🏷️ Desglose por Categoría:');
console.log(JSON.stringify(byCat, null, 2));

// Sample of 2024, 2025, 2026 projects
console.log('\n✨ Muestra de proyectos recientes (2024, 2025, 2026):');
const recent = allDetected.filter(p => p.year >= 2024);
console.log(`Total recientes (>=2024): ${recent.length}`);
recent.slice(0, 15).forEach((p, idx) => {
  console.log(` ${idx + 1}. [${p.category.toUpperCase()}] "${p.title}" | ${p.year}/${p.month} | ${p.bpm ? p.bpm + ' BPM' : 'N/D'} ${p.key || ''} | ${p.audioFile.name} (${p.audioFile.sizeMB} MB)`);
});
