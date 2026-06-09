import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function GET(request: Request) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.BETTER_AUTH_URL + '/api/auth/google-token'
  );

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    // Redirect to Google to get the code
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent select_account',
      scope: [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/calendar.events',
        'email',
        'profile'
      ]
    });
    return NextResponse.redirect(url);
  }

  try {
    // Exchange the code for a token
    const { tokens } = await oauth2Client.getToken(code);
    
    if (tokens.refresh_token) {
      return new NextResponse(`
        <html>
          <body style="font-family: sans-serif; padding: 40px; text-align: center;">
            <h1 style="color: #4CAF50;">¡Conexión Exitosa (FULL PERMISSIONS)!</h1>
            <p>Este es tu nuevo Token Maestro (tiene permisos TOTALES de Drive + Calendario):</p>
            <div style="background: #eee; padding: 20px; border-radius: 8px; word-break: break-all; margin: 20px auto; max-width: 600px; font-family: monospace;">
              ${tokens.refresh_token}
            </div>
            <p><b>1. Copia el código de arriba.</b></p>
            <p><b>2. Ve a Vercel > Environment Variables.</b></p>
            <p><b>3. Edita la variable GOOGLE_REFRESH_TOKEN y pega este nuevo código.</b></p>
            <p><b>4. Haz un Redeploy y todo funcionará perfectamente.</b></p>
          </body>
        </html>
      `, { headers: { 'Content-Type': 'text/html' } });
    } else {
      return new NextResponse('No se recibió un refresh token. Inténtalo de nuevo asegurándote de dar todos los permisos.', { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
