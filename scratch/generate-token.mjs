import { google } from 'googleapis';
import readline from 'readline';

const oauth2Client = new google.auth.OAuth2(
  '157917503960-k3vsbd6boro7147gbe4ro7ft275q2oed.apps.googleusercontent.com',
  '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',
  'urn:ietf:wg:oauth:2.0:oob'
);

const scopes = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/calendar.events'
];

const url = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: scopes,
  prompt: 'consent'
});

console.log('\n==================================================');
console.log('1. Abre esta URL en tu navegador e inicia sesión con tu cuenta de Google:');
console.log(url);
console.log('\n2. Autoriza los permisos y copia el código que te da.');
console.log('==================================================\n');
