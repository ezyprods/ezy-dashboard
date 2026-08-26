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

const DRIVE_ROOT_FOLDER_ID = process.env.DRIVE_ROOT_FOLDER_ID || '182uxxUjN7KJJDm1vAZ_AEyKvAwwcTPxY';
const PROGRESS_FILE = path.join(__dirname, 'catalogue-progress.json');
const CONCURRENCY = 2;

const CATEGORY_NAMES = {
  beat: 'Beats',
  grabacion: 'Grabaciones',
  loop_pack: 'Loop Packs',
  colaboracion: 'Colaboraciones',
  mashup: 'Mashups',
};

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

function parseSmartProject(folderName, audioFileName) {
  const base = folderName || audioFileName.replace(/\.[^/.]+$/, '');
  
  let bpm = null;
  const bpmMatch = base.match(/(?:^|[\s\-_])(\d{2,3})\s*(?:bpm|BPM)(?:[\s\-_]|$)/);
  if (bpmMatch) {
    const val = parseInt(bpmMatch[1], 10);
    if (val >= 40 && val <= 300) bpm = val;
  }

  let key = null;
  const keyRegex = /(?:^|[\s\-_])([A-G][#b]?(?:\s*(?:min|maj|minor|major|m))?)(?:[\s\-_]|$)/i;
  const keyMatch = base.match(keyRegex);
  if (keyMatch) {
    let k = keyMatch[1].replace(/\s+/g, '').trim();
    if (k.toLowerCase().endsWith('minor') || k.toLowerCase().endsWith('min')) {
      k = k.replace(/minor|min/gi, 'm');
    }
    if (k.toLowerCase().endsWith('major') || k.toLowerCase().endsWith('maj')) {
      k = k.replace(/major|maj/gi, '');
    }
    key = k;
  }

  const collabMatches = base.match(/@(\w+)/g) || [];
  const collabs = collabMatches
    .map(c => c.replace('@', '').toLowerCase())
    .filter(c => c !== 'ezyprods' && c !== 'ezy');

  let title = '';
  const structuredMatch = base.match(/^\d+\s*[-_.]\s*(?:[A-G][#b]?(?:\s*(?:min|maj|minor|major|m))?\s*)?(?:\d{2,3}\s*(?:bpm|BPM)?\s*)?[-_.]\s*([^@]+)/i);
  
  if (structuredMatch && structuredMatch[1].trim().length > 1) {
    title = structuredMatch[1].replace(/@\w+/g, '').replace(/x\s*@\w+/gi, '').replace(/[-_]+/g, ' ').trim();
  } else {
    title = base
      .replace(/^(\d{1,3})\s*[-_.]\s*/, '')
      .replace(/(?:^|[\s\-_])\d{2,3}\s*(?:bpm|BPM)(?:[\s\-_]|$)/gi, ' ')
      .replace(/(?:^|[\s\-_])[A-G][#b]?(?:\s*(?:min|maj|minor|major|m))?(?:[\s\-_]|$)/gi, ' ')
      .replace(/@\w+/g, '')
      .replace(/\b(purchase tag|wav untagged|untagged|purchase|tag|wav|mp3|demo|bounce|master|final|mix)\b/gi, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  title = title.replace(/\s+x\s*$/i, '').trim();
  if (title.length < 2) {
    title = base.replace(/^(\d{1,3})\s*[-_.]\s*/, '').replace(/@\w+/g, '').trim();
  }

  if (title.length > 0) {
    title = title.charAt(0).toUpperCase() + title.slice(1);
  }

  return { title, bpm, key, collaborators: collabs };
}

function isIgnoredSample(filename) {
  const lower = filename.toLowerCase();
  if (lower.startsWith('looperman-')) return true;
  if (lower.startsWith('sample-')) return true;
  if (lower.startsWith('loop_') && !lower.includes('pack')) return true;
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

    if (ext === '.wav') score += 1000;
    else if (ext === '.flac') score += 800;
    else if (ext === '.mp3') score += 500;

    if (nameLower.includes('untagged') || nameLower.includes('no tag')) score += 200;
    if (nameLower.includes('purchase tag') || nameLower.includes('tagged')) score -= 200;
    if (nameLower.includes('master') || nameLower.includes('final')) score += 100;
    if (nameLower.includes('mix')) score += 50;

    const vMatch = nameLower.match(/v(\d+)/);
    if (vMatch) score += parseInt(vMatch[1], 10) * 20;

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

      const audioCandidate = selectDefinitiveAudio(files);

      if (audioCandidate) {
        const parsedAudio = parseSmartProject(null, audioCandidate.name);
        const parsedFolder = parseSmartProject(folderName, null);

        let projectTitle = parsedFolder.title || parsedAudio.title || folderName;
        if (projectTitle.length < 3 && parsedAudio.title) {
          projectTitle = parsedAudio.title;
        }

        const bpm = parsedAudio.bpm || parsedFolder.bpm || undefined;
        const key = parsedAudio.key || parsedFolder.key || undefined;
        const collabs = [...new Set([...(parsedAudio.collaborators || []), ...(parsedFolder.collaborators || [])])];

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
          collaborators: collabs,
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

async function ensurePersonalRootStructure() {
  console.log('📁 Verificando o creando estructura de 00_PROYECTOS_PERSONALES en Google Drive...');
  
  // Buscar 00_PROYECTOS_PERSONALES
  const searchRoot = await drive.files.list({
    q: `name='00_PROYECTOS_PERSONALES' and '${DRIVE_ROOT_FOLDER_ID}' in parents and trashed=false`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  let rootFolderId;
  if (searchRoot.data.files && searchRoot.data.files.length > 0) {
    rootFolderId = searchRoot.data.files[0].id;
    console.log(`  ✅ Carpeta raíz existente: ${rootFolderId}`);
  } else {
    rootFolderId = await createDriveFolder('00_PROYECTOS_PERSONALES', DRIVE_ROOT_FOLDER_ID);
    console.log(`  ✨ Carpeta raíz creada: ${rootFolderId}`);
  }

  // Guardar artist_config.json
  await saveJsonToDrive('artist_config.json', {
    name: 'Proyectos Personales',
    type: 'personal',
    createdAt: new Date().toISOString(),
  }, rootFolderId);

  // Subcarpetas de categorías
  const categoryFolders = {};
  const searchSub = await drive.files.list({
    q: `'${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const existingFolders = searchSub.data.files || [];

  for (const [catKey, folderName] of Object.entries(CATEGORY_NAMES)) {
    const found = existingFolders.find(f => f.name.toLowerCase() === folderName.toLowerCase());
    if (found) {
      categoryFolders[catKey] = found.id;
    } else {
      const createdId = await createDriveFolder(folderName, rootFolderId);
      categoryFolders[catKey] = createdId;
    }
  }

  console.log('  ✅ Carpetas de categoría configuradas:', JSON.stringify(categoryFolders, null, 2));

  return { rootFolderId, categoryFolders };
}

async function processProject(proj, index, total, progressState, categoryFolders, existingDb) {
  const startTime = Date.now();
  const catFolderId = categoryFolders[proj.category] || categoryFolders.beat;

  console.log(`[${index + 1}/${total}] 🚀 Importando: "${proj.title}" [${proj.category.toUpperCase()}]`);
  console.log(`      📁 Origen: ${proj.folderName} | 📅 ${proj.year}/${proj.month} | 🎵 ${proj.bpm ? proj.bpm + ' BPM' : 'N/D'} ${proj.key || ''} ${proj.collaborators.length ? '| 👥 ' + proj.collaborators.join(', ') : ''}`);
  console.log(`      🔊 Audio: ${proj.audioFile.name} (${proj.audioFile.sizeMB} MB, ${proj.audioFile.ext})`);

  const projFolderId = await createDriveFolder(proj.title, catFolderId);

  const [bounceFolderId] = await Promise.all([
    createDriveFolder('01_Bounces_y_Demos', projFolderId),
    createDriveFolder('02_Stems_y_Pistas', projFolderId),
    createDriveFolder('03_Backup_y_Sesiones', projFolderId),
  ]);

  const mimeType = proj.audioFile.ext === '.wav' ? 'audio/wav' : 'audio/mpeg';
  const uploadedAudio = await uploadAudioToDrive(proj.audioFile.path, proj.audioFile.name, bounceFolderId, mimeType);

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
    collaborators: proj.collaborators || [],
    notes: '',
    driveFolderId: projFolderId,
    latestBounceFileId: uploadedAudio.id,
    latestBounceName: uploadedAudio.name,
    createdAt: createdIso,
    updatedAt: nowIso,
  };

  await Promise.all([
    saveJsonToDrive('personal_project_config.json', projectConfig, projFolderId),
    saveJsonToDrive('personal_tasks.json', { tasks: [], workSessions: [] }, projFolderId),
  ]);

  existingDb.push(projectConfig);
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

async function main() {
  console.log('================================================================');
  console.log('🌟 IMPORTADOR UNIVERSAL DE TODO EL CATÁLOGO A GOOGLE DRIVE');
  console.log('================================================================\n');

  let progressState = { completed: {}, errors: [] };
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      progressState = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
      console.log(`📌 Progreso previo: ${Object.keys(progressState.completed).length} proyectos ya registrados.`);
    } catch (e) {}
  }

  // 1. Crear / verificar estructura en Drive
  const { rootFolderId, categoryFolders } = await ensurePersonalRootStructure();

  // 2. Escaneo Universal
  console.log('\n🔍 Escaneando todas las ubicaciones en disco (D: y Z:)...');
  const locations = [
    { path: 'D:\\FL Studio\\Proyectos\\Proyectos Ezy', cat: 'beat' },
    { path: 'Z:\\FL Studio\\Proyectos\\Proyectos Ezy', cat: 'beat' },
    { path: 'Z:\\FL Studio\\Proyectos\\Grabaciones', cat: 'grabacion' },
    { path: 'Z:\\FL Studio\\Proyectos\\Mashups', cat: 'mashup' },
    { path: 'Z:\\FL Studio\\Proyectos\\Temas', cat: 'beat' },
    { path: 'Z:\\FL Studio\\Proyectos\\Beat Contest Rocket', cat: 'beat' },
    { path: 'D:\\FL Studio\\Proyectos\\Proyectos Portátil\\Proyectos Ezy', cat: 'beat' },
  ];

  let allProjects = [];
  const seenPaths = new Set();

  for (const loc of locations) {
    const found = scanLocation(loc.path, loc.cat);
    for (const p of found) {
      if (!seenPaths.has(p.folderPath)) {
        seenPaths.add(p.folderPath);
        allProjects.push(p);
      }
    }
  }

  console.log(`🎯 TOTAL PROYECTOS ÚNICOS CON AUDIO IDENTIFICADOS: ${allProjects.length}\n`);

  // 3. Leer DB actual de Drive si existe
  let existingDb = [];
  try {
    const dbList = await drive.files.list({
      q: `name='personal_projects_db.json' and '${rootFolderId}' in parents and trashed=false`,
      fields: 'files(id)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    if (dbList.data.files && dbList.data.files.length > 0) {
      const dbRes = await drive.files.get({ fileId: dbList.data.files[0].id, alt: 'media' });
      if (Array.isArray(dbRes.data)) existingDb = dbRes.data;
    }
  } catch (err) {}

  console.log(`📊 Proyectos en DB actual: ${existingDb.length}\n`);

  // Filtrar pendientes
  const pending = allProjects.filter(p => !progressState.completed[p.folderPath]);
  console.log(`📋 Proyectos pendientes por subir: ${pending.length} (de ${allProjects.length} totales)\n`);

  let processedCount = 0;

  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const batch = pending.slice(i, i + CONCURRENCY);

    await Promise.all(
      batch.map(async (proj) => {
        const globalIdx = allProjects.findIndex(c => c.folderPath === proj.folderPath);
        try {
          await processProject(proj, globalIdx, allProjects.length, progressState, categoryFolders, existingDb);
          processedCount++;
        } catch (err) {
          console.error(`      ❌ Error al importar "${proj.title}":`, err.message);
          progressState.errors.push({ folderPath: proj.folderPath, title: proj.title, error: err.message });
          fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progressState, null, 2));
        }
      })
    );

    if (processedCount % 4 === 0 || i + CONCURRENCY >= pending.length) {
      console.log(`   💾 Sincronizando personal_projects_db.json en Drive (${existingDb.length} proyectos)...`);
      await saveJsonToDrive('personal_projects_db.json', existingDb, rootFolderId);
      console.log(`   💾 Sincronización guardada.\n`);
    }
  }

  // Guardado final
  console.log('💾 Guardando sincronización final en personal_projects_db.json...');
  await saveJsonToDrive('personal_projects_db.json', existingDb, rootFolderId);

  console.log('\n================================================================');
  console.log('🎉 PROCESO DE IMPORTACIÓN UNIVERSAL COMPLETADO CON ÉXITO');
  console.log('================================================================');
  console.log(`Total proyectos en la plataforma: ${existingDb.length}`);
}

main().catch(err => {
  console.error('Fatal import error:', err);
});
