import { auth as calendarAuth, calendar as calendarApi } from '@googleapis/calendar';

/**
 * Calendar auth lives here rather than in `lib/drive.ts` so the calendar routes
 * stop pulling the Drive client into their function bundle — and so the OAuth2
 * client comes from the same `@googleapis/calendar` copy of google-auth-library
 * that consumes it (the per-API packages don't share one).
 */
export const getCalendarAuthClient = () => {
  const oauth2Client = new calendarAuth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.BETTER_AUTH_URL + '/api/auth/callback/google'
  );

  const token = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN;
  if (token) {
    oauth2Client.setCredentials({ refresh_token: token });
  }

  return oauth2Client;
};

export const getCalendarService = () =>
  calendarApi({ version: 'v3', auth: getCalendarAuthClient() });
