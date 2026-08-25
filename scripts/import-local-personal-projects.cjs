const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { google } = require('googleapis');

// 1. Cargar variables de entorno
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envConfig = dotenv.parse(fs.readFileSync(envPath));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}

// 2. Cliente de Google Drive
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.BETTER_AUTH_URL + '/api/auth/callback/google'
);

const token = process.env.GOOGLE_DRIVE_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN;
oauth2Client.setCredentials({ refresh_token: token });
const drive = google.drive({ version: 'v3', auth: oauth2Client });

// 3. IDs conocidos de carpetas de categorías en Drive
const ROOT_PERSONAL_FOLDER_ID = '17XX9Bwuz-2eZL9mZ9j4XHo51Xu8wi-5C';
const CATEGORY_FOLDER_IDS = {
  beat: '1LEojLapHHZxDWYX14nYyeurDMZ84awU1',
  grabacion: '1st7TBWnyBJSYq_xSsv9LXNQX5znInS_M',
  loop_pack: '16uWPAtLDLvrd_nnxFB3D_Cc9S5Ijhmim',
  colaboracion: '1ZCwKG7dJQ1RfLw36N20Uo5iMsucceNgA',
  mashup: '1iP15foekFVEZ04989k_L4YD0BOTHLh3z',
};

const PROGRESS_FILE = path.join(__dirname, 'import-progress.json');
const CONCURRENCY = 2; // Procesar 2 proyectos simultáneamente para acelerar la subida

// --- Helper Functions ---
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function retry(fn, maxAttempts = 5, delayMs = 2000) {
  let attempt = 0;
  while (attempt < maxAttempts) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt >= maxAttempts) throw err;
      console.warn(`      ⚠️ Reintentando (${attempt}/${maxAttempts}) tras error: ${err.message}`);
      await sleep(delayMs);
      delayMs *= 2;
    }
  }
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

function isIgnoredSample(filename) {
  const lower = filename.toLowerCase();
  if (lower.startsWith('looperman-')) return true;
  if (lower.startsWith('sample-')) return true;
  if (lower.startsWith('loop_') || lower.startsWith('loop 1') || lower.startsWith('loop 2')) return true;
  if (lower.includes('base improvisar')) return true;
  if (lower.endsWith('.flp') || lower.endsWith('.zpa') || lower.endsWith('.fst') || lower.endsWith('.fxp') || lower.endsWith('.asd')) return true;
  return false;
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

    // 3. Final / Master
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

      const yearMatch = folderName.match(/^(202\d)$/);
      let detectedYear = currentYear;
      if (yearMatch) detectedYear = parseInt(yearMatch[1], 10);

      let detectedMonth = currentMonth;
      const monthMatch = folderName.match(/^(\d{1,2})\s*[-_]/);
      if (monthMatch && detectedYear && !folderName.toLowerCase().includes('bpm')) {
        const mNum = parseInt(monthMatch[1], 10);
        if (mNum >= 1 && mNum <= 12) detectedMonth = mNum;
      }

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

      const hasFlp = files.some(f => f.name.toLowerCase().endsWith('.flp'));
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
            sizeBytes: audioCandidate.size,
            ext: path.extname(audioCandidate.name).toLowerCase(),
            mtime: audioCandidate.mtime,
          },
          allAudioCount: files.filter(f => /\.(mp3|wav|flac|m4a)$/i.test(f.name)).length,
          hasFlp,
        });
      } else {
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

// Drive Operations
async function createDriveFolder(name, parentId) {
  return retry(async () => {
    const res = await drive.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      },
      fields: 'id, name',
      supportsAllDrives: true,
    });
    return res.data.id;
  });
}

async function uploadAudioToDrive(filePath, fileName, parentId, mimeType) {
  return retry(async () => {
    const media = {
      mimeType,
      body: fs.createReadStream(filePath),
    };
    const res = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [parentId],
      },
      media,
      fields: 'id, name, webViewLink, size',
      supportsAllDrives: true,
    });
    return res.data;
  }, 5, 3000);
}

async function saveJsonToDrive(name, data, parentId) {
  return retry(async () => {
    const query = `name='${name}' and '${parentId}' in parents and trashed=false`;
    const existing = await drive.files.list({
      q: query,
      fields: 'files(id)',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });

    const media = {
      mimeType: 'application/json',
      body: JSON.stringify(data, null, 2),
    };

    if (existing.data.files && existing.data.files.length > 0) {
      const fileId = existing.data.files[0].id;
      await drive.files.update({
        fileId,
        media,
        supportsAllDrives: true,
      });
      return fileId;
    } else {
      const res = await drive.files.create({
        requestBody: {
          name,
          mimeType: 'application/json',
          parents: [parentId],
        },
        media,
        fields: 'id',
        supportsAllDrives: true,
      });
      return res.data.id;
    }
  });
}

// Process a single project
async function processProject(proj, index, total, progressState, existingDbRef) {
  const startTime = Date.now();
  const catFolderId = CATEGORY_FOLDER_IDS[proj.category] || CATEGORY_FOLDER_IDS.beat;

  console.log(`[${index + 1}/${total}] 🚀 Importando: "${proj.title}" [${proj.category.toUpperCase()}]`);
  console.log(`      📁 Origen: ${proj.folderName} | 📅 ${proj.year}/${proj.month} | 🎵 ${proj.bpm ? proj.bpm + ' BPM' : 'N/D'} ${proj.key || ''}`);
  console.log(`      🔊 Audio: ${proj.audioFile.name} (${proj.audioFile.sizeMB} MB, ${proj.audioFile.ext})`);

  // 1. Crear carpeta del proyecto
  const projFolderId = await createDriveFolder(proj.title, catFolderId);

  // 2. Crear las 3 subcarpetas en paralelo
  const [bounceFolderId] = await Promise.all([
    createDriveFolder('01_Bounces_y_Demos', projFolderId),
    createDriveFolder('02_Stems_y_Pistas', projFolderId),
    createDriveFolder('03_Backup_y_Sesiones', projFolderId),
  ]);

  // 3. Subir archivo de audio
  const mimeType = proj.audioFile.ext === '.wav' ? 'audio/wav' : 'audio/mpeg';
  const uploadedAudio = await uploadAudioToDrive(proj.audioFile.path, proj.audioFile.name, bounceFolderId, mimeType);

  // 4. Configuración
  const nowIso = new Date().toISOString();
  const createdIso = proj.audioFile.mtime ? new Date(proj.audioFile.mtime).toISOString() : nowIso;

  const projectConfig = {
    id: projFolderId,
    title: proj.title,
    category: proj.category,
    tags: [],
    status: 'terminado',
    bpm: proj.bpm,
    key: proj.key,
    year: proj.year,
    month: proj.month,
    collaborators: [],
    notes: '',
    driveFolderId: projFolderId,
    latestBounceFileId: uploadedAudio.id,
    latestBounceName: uploadedAudio.name,
    createdAt: createdIso,
    updatedAt: nowIso,
  };

  // 5. Guardar JSONs en paralelo
  await Promise.all([
    saveJsonToDrive('personal_project_config.json', projectConfig, projFolderId),
    saveJsonToDrive('personal_tasks.json', { tasks: [], workSessions: [] }, projFolderId),
  ]);

  // 6. Actualizar referencias en memoria y disco
  existingDbRef.push(projectConfig);
  progressState.completed[proj.folderPath] = {
    id: projFolderId,
    title: proj.title,
    audioFileId: uploadedAudio.id,
    uploadedAt: nowIso,
  };

  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progressState, null, 2));

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`      ✅ [${index + 1}/${total}] Subido "${proj.title}" en ${durationSec}s | Drive: ${projFolderId}\n`);
}

// Main Execution Loop
async function main() {
  console.log('================================================================');
  console.log('🚀 INICIANDO IMPORTACIÓN MASIVA ACELERADA A GOOGLE DRIVE');
  console.log(`⚡ Concurrencia: ${CONCURRENCY} subidas simultáneas`);
  console.log('================================================================\n');

  let progressState = { completed: {}, errors: [] };
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      progressState = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
      console.log(`📌 Progreso previo: ${Object.keys(progressState.completed).length} proyectos ya importados.`);
    } catch (e) {}
  }

  const ezyRoot = 'D:\\FL Studio\\Proyectos\\Proyectos Ezy';
  const candidates = scanDirectory(ezyRoot, 'beat');
  console.log(`✅ Total proyectos con audio definitivo identificados: ${candidates.length}\n`);

  // Leer estado actual de personal_projects_db.json
  let existingDb = [];
  try {
    const dbList = await drive.files.list({
      q: `name='personal_projects_db.json' and '${ROOT_PERSONAL_FOLDER_ID}' in parents and trashed=false`,
      fields: 'files(id)',
    });
    if (dbList.data.files && dbList.data.files.length > 0) {
      const dbRes = await drive.files.get({ fileId: dbList.data.files[0].id, alt: 'media' });
      if (Array.isArray(dbRes.data)) existingDb = dbRes.data;
    }
  } catch (err) {}

  // Filtrar items pendientes
  const pending = candidates.filter(p => !progressState.completed[p.folderPath]);
  console.log(`📋 Proyectos pendientes por subir: ${pending.length} (de ${candidates.length} totales)\n`);

  let processedCount = 0;

  // Pool de ejecución concurrente
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const batch = pending.slice(i, i + CONCURRENCY);
    
    await Promise.all(
      batch.map(async (proj, batchIdx) => {
        const globalIdx = candidates.findIndex(c => c.folderPath === proj.folderPath);
        try {
          await processProject(proj, globalIdx, candidates.length, progressState, existingDb);
          processedCount++;
        } catch (err) {
          console.error(`      ❌ Error al importar "${proj.title}":`, err.message);
          progressState.errors.push({ folderPath: proj.folderPath, title: proj.title, error: err.message });
          fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progressState, null, 2));
        }
      })
    );

    // Sincronizar DB cada lote
    if (processedCount % 4 === 0 || i + CONCURRENCY >= pending.length) {
      console.log(`   💾 Sincronizando personal_projects_db.json en Drive (${existingDb.length} proyectos)...`);
      await saveJsonToDrive('personal_projects_db.json', existingDb, ROOT_PERSONAL_FOLDER_ID);
      console.log(`   💾 Sincronización guardada.\n`);
    }
  }

  // Sincronización final
  console.log('💾 Guardando sincronización final en personal_projects_db.json...');
  await saveJsonToDrive('personal_projects_db.json', existingDb, ROOT_PERSONAL_FOLDER_ID);

  console.log('\n================================================================');
  console.log('🎉 PROCESO DE IMPORTACIÓN MASIVA COMPLETADO CON ÉXITO');
  console.log('================================================================');
  console.log(`Total proyectos importados en la plataforma: ${existingDb.length}`);
}

main().catch(err => {
  console.error('Fatal import error:', err);
});
