const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

// Load .env.local manually
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const parts = trimmed.split('=');
    const key = parts[0].trim();
    const value = parts.slice(1).join('=').trim().replace(/(^"|"$)/g, '');
    process.env[key] = value;
  });
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const DRIVE_ROOT_FOLDER_ID = process.env.DRIVE_ROOT_FOLDER_ID;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN || !DRIVE_ROOT_FOLDER_ID) {
  console.error('Error: Missing environment variables in .env.local');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET
);

oauth2Client.setCredentials({
  refresh_token: GOOGLE_REFRESH_TOKEN
});

const drive = google.drive({ version: 'v3', auth: oauth2Client });

async function buildTree(folderId, depth = 0) {
  try {
    const q = `'${folderId}' in parents and trashed = false`;
    const res = await drive.files.list({
      q,
      fields: 'files(id, name, mimeType, size)',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      pageSize: 100
    });

    const items = res.data.files || [];
    const indent = '  '.repeat(depth);

    for (const item of items) {
      if (item.mimeType === 'application/vnd.google-apps.folder') {
        console.log(`${indent}📁 [Folder] ${item.name} (${item.id})`);
        // Recurse into projects and folders, limiting depth to avoid huge output
        if (depth < 3) {
          await buildTree(item.id, depth + 1);
        }
      } else {
        const sizeStr = item.size ? ` (${(item.size / (1024 * 1024)).toFixed(2)} MB)` : '';
        console.log(`${indent}📄 [File] ${item.name}${sizeStr} (${item.id})`);
      }
    }
  } catch (error) {
    console.error(`Error listing folder ${folderId}:`, error.message);
  }
}

async function start() {
  console.log(`Analyzing EZY Dashboard Google Drive root folder: ${DRIVE_ROOT_FOLDER_ID}...`);
  console.log('----------------------------------------------------');
  await buildTree(DRIVE_ROOT_FOLDER_ID);
}

start();
