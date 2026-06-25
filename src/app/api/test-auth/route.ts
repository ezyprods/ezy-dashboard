import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getDriveAuthClient, listFolders } from '@/lib/drive';
import { DRIVE_ROOT_FOLDER_ID } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function GET() {
  const driveToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  const generalToken = process.env.GOOGLE_REFRESH_TOKEN;
  const calendarToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
  const clientId = process.env.GOOGLE_CLIENT_ID;

  const activeToken = driveToken || generalToken;

  let rawApiError = null;
  let filesCount = -1;
  let listFoldersError = null;
  let foldersCount = -1;

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
    rawApiError = { message: e.message, code: e.code };
  }

  try {
    const folders = await listFolders(DRIVE_ROOT_FOLDER_ID);
    foldersCount = folders.length;
  } catch (e: any) {
    listFoldersError = { message: e.message, code: e.code };
  }

  return NextResponse.json({
    status: 'Diagnostics V2',
    tokens: {
      hasClientId: !!clientId,
      driveToken: driveToken ? `${driveToken.substring(0, 10)}... (length: ${driveToken.length})` : null,
      activeTokenUsed: activeToken ? `${activeToken.substring(0, 10)}...` : null,
      folderId: DRIVE_ROOT_FOLDER_ID
    },
    testCallRaw: {
      success: !rawApiError,
      filesCount,
      error: rawApiError
    },
    testListFolders: {
      success: !listFoldersError,
      foldersCount,
      error: listFoldersError
    }
  });
}


