import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export const dynamic = 'force-dynamic';

export async function GET() {
  const driveToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  const generalToken = process.env.GOOGLE_REFRESH_TOKEN;
  const calendarToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
  const clientId = process.env.GOOGLE_CLIENT_ID;

  const activeToken = driveToken || generalToken;

  let apiError = null;
  let filesCount = -1;

  try {
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.BETTER_AUTH_URL + '/api/auth/callback/google'
    );
    if (activeToken) {
      oauth2Client.setCredentials({ refresh_token: activeToken });
    }

    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const res = await drive.files.list({
      pageSize: 1,
      fields: 'files(id, name)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    filesCount = res.data.files ? res.data.files.length : 0;
  } catch (e: any) {
    apiError = {
      message: e.message,
      stack: e.stack,
      code: e.code,
      response: e.response?.data
    };
  }

  return NextResponse.json({
    status: 'Diagnostics',
    tokens: {
      hasClientId: !!clientId,
      driveToken: driveToken ? `${driveToken.substring(0, 10)}... (length: ${driveToken.length})` : null,
      generalToken: generalToken ? `${generalToken.substring(0, 10)}... (length: ${generalToken.length})` : null,
      calendarToken: calendarToken ? `${calendarToken.substring(0, 10)}... (length: ${calendarToken.length})` : null,
      activeTokenUsed: activeToken ? `${activeToken.substring(0, 10)}...` : null,
    },
    testCall: {
      success: !apiError,
      filesCount,
      error: apiError
    }
  });
}
