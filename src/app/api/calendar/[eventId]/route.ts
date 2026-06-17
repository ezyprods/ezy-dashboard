import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getCalendarAuthClient } from '@/lib/drive';

export async function PUT(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await params;
    const body = await request.json();
    const { summary, description, startDateTime, endDateTime } = body;

    if (!eventId) {
      return NextResponse.json({ error: 'eventId is required' }, { status: 400 });
    }

    const auth = getCalendarAuthClient();
    const calendar = google.calendar({ version: 'v3', auth });
    
    // First, fetch the existing event to keep any properties we're not overwriting
    const existingEvent = await calendar.events.get({
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      eventId: eventId
    });

    const response = await calendar.events.update({
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      eventId: eventId,
      requestBody: {
        ...existingEvent.data,
        summary: summary !== undefined ? summary : existingEvent.data.summary,
        description: description !== undefined ? description : existingEvent.data.description,
        start: startDateTime ? { dateTime: startDateTime, timeZone: 'Europe/Madrid' } : existingEvent.data.start,
        end: endDateTime ? { dateTime: endDateTime, timeZone: 'Europe/Madrid' } : existingEvent.data.end,
      },
    });

    return NextResponse.json({ event: response.data });
  } catch (error: any) {
    console.error('Calendar PUT Error:', error);
    const isAuthError = error.code === 401 || error.code === 403 || error.message?.includes('invalid_grant');
    return NextResponse.json(
      { error: 'Failed to update calendar event', details: error.message, needsAuth: isAuthError },
      { status: isAuthError ? 403 : 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await params;

    if (!eventId) {
      return NextResponse.json({ error: 'eventId is required' }, { status: 400 });
    }

    const auth = getCalendarAuthClient();
    const calendar = google.calendar({ version: 'v3', auth });

    await calendar.events.delete({
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      eventId: eventId,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Calendar DELETE Error:', error);
    const isAuthError = error.code === 401 || error.code === 403 || error.message?.includes('invalid_grant');
    return NextResponse.json(
      { error: 'Failed to delete calendar event', details: error.message, needsAuth: isAuthError },
      { status: isAuthError ? 403 : 500 }
    );
  }
}
