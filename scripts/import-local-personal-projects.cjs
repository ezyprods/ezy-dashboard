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

const SUBFOLDERS = [
  '01_Bounces_y_Demos',
  '02_Stems_y_Pistas',
  '03_Backup_y_Sesiones',
];

const PROGRESS_FILE = path.join(__dirname, 'import-progress.json');

// --- Helper Functions ---
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function retry(fn, maxAttempts = 4, delayMs = 2000) {
  let attempt = 0;
  while (attempt < maxAttempts) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt >= maxAttempts) throw err;
      console.warn(`      ⚠️ Error en intento ${attempt}/${maxAttempts} (${err.message}). Reintentando en ${delayMs}ms...`);
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

    // 1. WAV priority (User rule: if wav exists, upload wav)
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
  }, 4, 3000);
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

// Main Execution Loop
async function main() {
  console.log('================================================================');
  console.log('🚀 INICIANDO IMPORTACIÓN MASIVA DE PROYECTOS A GOOGLE DRIVE');
  console.log('================================================================\n');

  // Cargar progreso previo si existe
  let progressState = { completed: {}, errors: [] };
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      progressState = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
      console.log(`📌 Progreso previo cargado: ${Object.keys(progressState.completed).length} proyectos ya importados.`);
    } catch (e) {}
  }

  // 1. Escaneo de proyectos en disco
  const ezyRoot = 'D:\\FL Studio\\Proyectos\\Proyectos Ezy';
  console.log('🔍 Escaneando disco local:', ezyRoot);
  const candidates = scanDirectory(ezyRoot, 'beat');
  console.log(`✅ Total proyectos con audio definitivo identificados: ${candidates.length}\n`);

  // 2. Leer estado actual de personal_projects_db.json en Google Drive
  let existingDb = [];
  try {
    const dbList = await drive.files.list({
      q: `name='personal_projects_db.json' and '${ROOT_PERSONAL_FOLDER_ID}' in parents and trashed=false`,
      fields: 'files(id)',
    });
    if (dbList.data.files && dbList.data.files.length > 0) {
      const dbRes = await drive.files.get({ fileId: dbList.data.files[0].id, alt: 'media' });
      if (Array.isArray(dbRes.data)) {
        existingDb = dbRes.data;
      }
    }
  } catch (err) {
    console.warn('Advertencia al leer DB inicial:', err.message);
  }

  console.log(`📊 Base de datos inicial en Drive: ${existingDb.length} proyectos registrados.\n`);

  let importedCount = 0;
  let skippedCount = 0;
  let totalUploadedBytes = 0;

  for (let i = 0; i < candidates.length; i++) {
    const proj = candidates[i];
    const indexStr = `[${i + 1}/${candidates.length}]`;
    const percent = (((i + 1) / candidates.length) * 100).toFixed(1);

    // Comprobar si ya se importó en este progreso o en el DB
    if (progressState.completed[proj.folderPath]) {
      skippedCount++;
      continue;
    }

    const alreadyInDb = existingDb.find(p => p.title.toLowerCase().trim() === proj.title.toLowerCase().trim());
    if (alreadyInDb && alreadyInDb.latestBounceFileId) {
      progressState.completed[proj.folderPath] = { id: alreadyInDb.id, title: alreadyInDb.title };
      skippedCount++;
      continue;
    }

    console.log(`${indexStr} (${percent}%) Importando: "${proj.title}" [${proj.category.toUpperCase()}]`);
    console.log(`      📁 Origen: ${proj.folderName} | 📅 ${proj.year}/${proj.month} | 🎵 ${proj.bpm ? proj.bpm + ' BPM' : 'N/D'} ${proj.key || ''}`);
    console.log(`      🔊 Audio: ${proj.audioFile.name} (${proj.audioFile.sizeMB} MB, ${proj.audioFile.ext})`);

    const startTime = Date.now();

    try {
      const catFolderId = CATEGORY_FOLDER_IDS[proj.category] || CATEGORY_FOLDER_IDS.beat;

      // 1. Crear carpeta del proyecto en Drive
      const projFolderId = await createDriveFolder(proj.title, catFolderId);

      // 2. Crear subcarpeta de Bounces (y las otras dos estándar)
      const bounceFolderId = await createDriveFolder('01_Bounces_y_Demos', projFolderId);
      await createDriveFolder('02_Stems_y_Pistas', projFolderId);
      await createDriveFolder('03_Backup_y_Sesiones', projFolderId);

      // 3. Subir archivo de audio definitivo
      const mimeType = proj.audioFile.ext === '.wav' ? 'audio/wav' : 'audio/mpeg';
      const uploadedAudio = await uploadAudioToDrive(proj.audioFile.path, proj.audioFile.name, bounceFolderId, mimeType);

      // 4. Crear configuración del proyecto
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

      // 5. Guardar personal_project_config.json y personal_tasks.json
      await saveJsonToDrive('personal_project_config.json', projectConfig, projFolderId);
      await saveJsonToDrive('personal_tasks.json', { tasks: [], workSessions: [] }, projFolderId);

      // 6. Actualizar array en memoria
      existingDb = [projectConfig, ...existingDb.filter(p => p.id !== projFolderId)];

      // 7. Guardar progreso local
      progressState.completed[proj.folderPath] = {
        id: projFolderId,
        title: proj.title,
        audioFileId: uploadedAudio.id,
        uploadedAt: nowIso,
      };
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progressState, null, 2));

      importedCount++;
      totalUploadedBytes += proj.audioFile.sizeBytes;
      const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log(`      ✅ Subido con éxito en ${durationSec}s | Drive Folder ID: ${projFolderId}\n`);

      // 8. Sincronizar personal_projects_db.json a Google Drive cada 5 proyectos
      if (importedCount % 5 === 0 || i === candidates.length - 1) {
        console.log(`   💾 Sincronizando personal_projects_db.json en Drive (${existingDb.length} proyectos totales)...`);
        await saveJsonToDrive('personal_projects_db.json', existingDb, ROOT_PERSONAL_FOLDER_ID);
        console.log(`   💾 Sincronización completada.\n`);
      }

    } catch (err) {
      console.error(`      ❌ Error al importar "${proj.title}":`, err.message);
      progressState.errors.push({ folderPath: proj.folderPath, title: proj.title, error: err.message });
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progressState, null, 2));
    }
  }

  // Sincronización final
  console.log('\n💾 Guardando sincronización final en personal_projects_db.json...');
  await saveJsonToDrive('personal_projects_db.json', existingDb, ROOT_PERSONAL_FOLDER_ID);

  console.log('\n================================================================');
  console.log('🎉 PROCESO DE IMPORTACIÓN MASIVA FINALIZADO');
  console.log('================================================================');
  console.log(`Total candidatos analizados: ${candidates.length}`);
  console.log(`Proyectos nuevos importados: ${importedCount}`);
  console.log(`Proyectos ya existentes omitidos: ${skippedCount}`);
  console.log(`Volumen total transferido: ${(totalUploadedBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`);
  console.log(`Total proyectos ahora en la plataforma: ${existingDb.length}`);
}

main().catch(err => {
  console.error('Fatal import error:', err);
});
