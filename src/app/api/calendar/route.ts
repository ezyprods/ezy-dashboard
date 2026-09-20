export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
import { NextResponse } from 'next/server';
import { calendar as calendarApi } from '@googleapis/calendar';
import { getCalendarAuthClient } from '@/lib/calendarAuth';

const TIME_ZONE = 'Europe/Madrid';

/** Start of "today" in the studio time zone (the server runs in UTC on Vercel). */
function startOfTodayInStudioTz(): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const y = parts.find(p => p.type === 'year')!.value;
  const m = parts.find(p => p.type === 'month')!.value;
  const d = parts.find(p => p.type === 'day')!.value;
  // Midnight in Madrid expressed in UTC (offset computed for that instant)
  const guess = new Date(`${y}-${m}-${d}T00:00:00Z`);
  const madridWall = new Date(guess.toLocaleString('en-US', { timeZone: TIME_ZONE })).getTime();
  const utcWall = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  return new Date(guess.getTime() - (madridWall - utcWall));
}

function mapEvent(item: any) {
  return {
    id: item.id,
    summary: item.summary,
    description: item.description,
    start: item.start?.dateTime || item.start?.date,
    end: item.end?.dateTime || item.end?.date,
    allDay: !item.start?.dateTime,
    htmlLink: item.htmlLink,
    colorId: item.colorId,
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const timeMinParam = searchParams.get('timeMin');
    const timeMaxParam = searchParams.get('timeMax');

    let timeMin: Date;
    let timeMax: Date;

    if (timeMinParam && timeMaxParam && !isNaN(Date.parse(timeMinParam)) && !isNaN(Date.parse(timeMaxParam))) {
      // Explicit range (used by the calendar page for the visible month)
      timeMin = new Date(timeMinParam);
      timeMax = new Date(timeMaxParam);
    } else {
      const days = Math.min(Math.max(parseInt(searchParams.get('days') || '30', 10) || 30, 1), 366);
      timeMin = startOfTodayInStudioTz();
      timeMax = new Date(timeMin.getTime() + (days + 1) * 24 * 60 * 60 * 1000 - 1);
    }

    const auth = getCalendarAuthClient();
    const calendar = calendarApi({ version: 'v3', auth });

    const items: any[] = [];
    let pageToken: string | undefined = undefined;
    let pages = 0;
    do {
      const response: any = await calendar.events.list({
        calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        maxResults: 250,
        singleEvents: true,
        orderBy: 'startTime',
        pageToken,
      });
      items.push(...(response.data.items || []));
      pageToken = response.data.nextPageToken || undefined;
      pages++;
    } while (pageToken && pages < 10);

    return NextResponse.json({ events: items.map(mapEvent) });
  } catch (error: any) {
    console.error('Calendar API Error:', error);

    // Check if it's a permissions error
    const isAuthError = error.code === 401 || error.code === 403 || error.message?.includes('invalid_grant') || error.message?.includes('insufficient');

    return NextResponse.json({
      error: 'Failed to fetch calendar events',
      details: error.message,
      needsAuth: isAuthError
    }, { status: isAuthError ? 403 : 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { summary, description, startDateTime, endDateTime, startDate, endDate } = body;

    const isAllDay = Boolean(startDate && endDate);
    if (!summary || (!isAllDay && (!startDateTime || !endDateTime))) {
      return NextResponse.json(
        { error: 'summary, startDateTime and endDateTime are required' },
        { status: 400 }
      );
    }

    const auth = getCalendarAuthClient();
    const calendar = calendarApi({ version: 'v3', auth });

    const response = await calendar.events.insert({
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      requestBody: {
        summary,
        description: description || undefined,
        start: isAllDay ? { date: startDate } : { dateTime: startDateTime, timeZone: TIME_ZONE },
        end: isAllDay ? { date: endDate } : { dateTime: endDateTime, timeZone: TIME_ZONE },
      },
    });

    return NextResponse.json({ event: response.data });
  } catch (error: any) {
    console.error('Calendar POST Error:', error);
    const isAuthError =
      error.code === 401 ||
      error.code === 403 ||
      error.message?.includes('invalid_grant') ||
      error.message?.includes('insufficient');
    return NextResponse.json(
      { error: 'Failed to create calendar event', details: error.message, needsAuth: isAuthError },
      { status: isAuthError ? 403 : 500 }
    );
  }
}
