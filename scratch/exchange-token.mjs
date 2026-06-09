import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  '157917503960-k3vsbd6boro7147gbe4ro7ft275q2oed.apps.googleusercontent.com',
  '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',
  'http://localhost:3000/api/auth/callback/google'
);

async function exchangeToken() {
  const code = '4/0AdkVLPxgFdPXv_8ruiV74aU6zVoTi4iSOiVxBg4rfeHR56XbIdQU1Gout9DcR2T0_56o_g';
  try {
    const { tokens } = await oauth2Client.getToken(code);
    console.log('--- SUCCESS ---');
    console.log('REFRESH_TOKEN:', tokens.refresh_token);
    console.log('ACCESS_TOKEN:', tokens.access_token);
  } catch (error) {
    console.error('Error exchanging token:', error);
  }
}

exchangeToken();
