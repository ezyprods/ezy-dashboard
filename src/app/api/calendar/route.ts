import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getAuthClient } from '@/lib/drive';

export async function GET() {
  try {
    const auth = getAuthClient();
    const calendar = google.calendar({ version: 'v3', auth });
    
    // Configurar fechas (hoy hasta dentro de 7 días)
    const timeMin = new Date();
    timeMin.setHours(0, 0, 0, 0); // Inicio de hoy
    
    const timeMax = new Date();
    timeMax.setDate(timeMax.getDate() + 7);
    timeMax.setHours(23, 59, 59, 999); // Fin del séptimo día

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      maxResults: 15,
      singleEvents: true,
      orderBy: 'startTime',
    });
    
    const items = response.data.items || [];
    
    // Mapear eventos a un formato simple
    const events = items.map(item => ({
      id: item.id,
      summary: item.summary,
      description: item.description,
      start: item.start?.dateTime || item.start?.date,
      end: item.end?.dateTime || item.end?.date,
      htmlLink: item.htmlLink,
      colorId: item.colorId,
    }));

    return NextResponse.json({ events });
  } catch (error: any) {
    console.error('Calendar API Error:', error);
    return NextResponse.json({ error: 'Failed to fetch calendar events', details: error.message }, { status: 500 });
  }
}
