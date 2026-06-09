import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getAuthClient } from '@/lib/drive';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30', 10);

    const auth = getAuthClient();
    const calendar = google.calendar({ version: 'v3', auth });
    
    // Configurar fechas
    const timeMin = new Date();
    timeMin.setHours(0, 0, 0, 0); // Inicio de hoy
    
    const timeMax = new Date();
    timeMax.setDate(timeMax.getDate() + days);
    timeMax.setHours(23, 59, 59, 999); // Fin del periodo

    const response = await calendar.events.list({
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      maxResults: days > 7 ? 100 : 15,
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
    
    // Check if it's a permissions error
    const isAuthError = error.code === 401 || error.code === 403 || error.message?.includes('invalid_grant') || error.message?.includes('insufficient');
    
    return NextResponse.json({ 
      error: 'Failed to fetch calendar events', 
      details: error.message,
      needsAuth: isAuthError 
    }, { status: isAuthError ? 403 : 500 });
  }
}
