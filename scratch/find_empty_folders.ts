import { google } from 'googleapis';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const FOLDERS_TO_REMOVE = [
  '01_Sesiones_y_DAW',
  '02_Bounces_y_Grabaciones',
  '03_Revisiones_y_Mezclas',
  '04_Masters_Finales',
  '05_Referencias_y_Otros',
  'Bounces',
  'Sessions',
  'Mix',
  'Master',
  'References',
  'Other',
  '01_Legal_y_Contratos',
  '02_Diseño_y_Media',
  '03_Lanzamientos_y_Proyectos',
];

const getDriveAuthClient = () => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.BETTER_AUTH_URL + '/api/auth/callback/google'
  );

  const token = process.env.GOOGLE_DRIVE_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN;
  if (token) {
    oauth2Client.setCredentials({ refresh_token: token });
  }

  return oauth2Client;
};

const drive = google.drive({ version: 'v3', auth: getDriveAuthClient() });
const rootFolderId = process.env.DRIVE_ROOT_FOLDER_ID;

async function run() {
  console.log('Finding auto-generated empty folders inside', rootFolderId);
  const artistsRes = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and '${rootFolderId}' in parents and trashed=false`,
    fields: 'files(id, name)'
  });
  const artists = artistsRes.data.files || [];
  
  let emptyFoldersToDelete: {id: string, name: string, path: string}[] = [];

  for (const artist of artists) {
    const insideArtistRes = await drive.files.list({
      q: `'${artist.id}' in parents and trashed=false`,
      fields: 'files(id, name, mimeType)'
    });
    const insideArtist = insideArtistRes.data.files || [];
    
    for (const item of insideArtist) {
      if (item.mimeType === 'application/vnd.google-apps.folder') {
        if (FOLDERS_TO_REMOVE.includes(item.name || '')) {
          const children = await drive.files.list({
             q: `'${item.id}' in parents and trashed=false`,
             fields: 'files(id)'
          });
          if (!children.data.files || children.data.files.length === 0) {
            emptyFoldersToDelete.push({ id: item.id!, name: item.name!, path: `${artist.name}/${item.name}` });
          }
        } else {
          // Assume it's a project
          const insideProjectRes = await drive.files.list({
            q: `'${item.id}' in parents and trashed=false`,
            fields: 'files(id, name, mimeType)'
          });
          const insideProject = insideProjectRes.data.files || [];
          for (const pItem of insideProject) {
            if (pItem.mimeType === 'application/vnd.google-apps.folder' && FOLDERS_TO_REMOVE.includes(pItem.name || '')) {
              const children = await drive.files.list({
                 q: `'${pItem.id}' in parents and trashed=false`,
                 fields: 'files(id)'
              });
              if (!children.data.files || children.data.files.length === 0) {
                emptyFoldersToDelete.push({ id: pItem.id!, name: pItem.name!, path: `${artist.name}/${item.name}/${pItem.name}` });
              }
            }
          }
        }
      }
    }
  }

  console.log('---RESULT---');
  console.log(JSON.stringify(emptyFoldersToDelete, null, 2));
}

run().catch(console.error);
