import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  '157917503960-k3vsbd6boro7147gbe4ro7ft275q2oed.apps.googleusercontent.com',
  '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',
  'http://localhost:3000/api/auth/callback/google'
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

console.log(url);
