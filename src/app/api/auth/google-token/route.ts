import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const type = searchParams.get('type') || 'both'; // 'drive', 'calendar', or 'both'

  // Pass state through the OAuth flow to remember the type
  const state = searchParams.get('state') || type;

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.BETTER_AUTH_URL + '/api/auth/google-token'
  );

  if (!code) {
    let scope = [];
    if (type === 'drive') {
      scope = ['https://www.googleapis.com/auth/drive', 'email', 'profile'];
    } else if (type === 'calendar') {
      scope = ['https://www.googleapis.com/auth/calendar.events', 'email', 'profile'];
    } else {
      scope = [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/calendar.events',
        'email',
        'profile'
      ];
    }

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent select_account',
      scope,
      state: type
    });
    return NextResponse.redirect(url);
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    
    if (tokens.refresh_token) {
      let envVarName = 'GOOGLE_REFRESH_TOKEN';
      let scopeName = 'FULL PERMISSIONS';
      if (state === 'drive') {
        envVarName = 'GOOGLE_DRIVE_REFRESH_TOKEN';
        scopeName = 'DRIVE SOLO';
      } else if (state === 'calendar') {
        envVarName = 'GOOGLE_CALENDAR_REFRESH_TOKEN';
        scopeName = 'CALENDAR SOLO';
      }

      return new NextResponse(`
        <html>
          <body style="font-family: sans-serif; padding: 40px; text-align: center; background: #1a1a1a; color: #fff;">
            <h1 style="color: #4CAF50;">¡Conexión Exitosa (${scopeName})!</h1>
            <p style="font-size: 1.1rem; color: #aaa;">Este es tu nuevo Refresh Token:</p>
            <div style="background: #2a2a2a; padding: 20px; border-radius: 8px; word-break: break-all; margin: 20px auto; max-width: 600px; font-family: monospace; border: 1px solid #444;">
              ${tokens.refresh_token}
            </div>
            <div style="text-align: left; max-width: 600px; margin: 40px auto; background: #222; padding: 30px; border-radius: 12px; border: 1px solid #333;">
              <p style="margin-bottom: 15px;"><b>1. Copia el código de arriba.</b></p>
              <p style="margin-bottom: 15px;"><b>2. Ve a Vercel > Settings > Environment Variables.</b></p>
              <p style="margin-bottom: 15px;"><b>3. Edita la variable <span style="color: #4CAF50; font-family: monospace; font-size: 1.1rem;">${envVarName}</span> y pega este nuevo código.</b></p>
              <p><b>4. Haz un Redeploy y todo funcionará perfectamente.</b></p>
            </div>
          </body>
        </html>
      `, { headers: { 'Content-Type': 'text/html' } });
    } else {
      return new NextResponse('No se recibió un refresh token. Inténtalo de nuevo asegurándote de dar todos los permisos en la pantalla de Google.', { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
