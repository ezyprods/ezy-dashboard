'use client';

import { useState, useEffect } from 'react';
import { Calendar, Loader2, AlertCircle } from 'lucide-react';
import { format, isToday, isTomorrow, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  htmlLink: string;
}

export function CalendarWidget() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      const res = await fetch('/api/calendar');
      if (!res.ok) throw new Error('Failed to fetch calendar');
      const data = await res.json();
      setEvents(data.events || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const formatEventDate = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (isToday(date)) return `Hoy, ${format(date, 'HH:mm')}`;
    if (isTomorrow(date)) return `Mañana, ${format(date, 'HH:mm')}`;
    return format(date, "EEEE d 'a las' HH:mm", { locale: es });
  };

  return (
    <div className="glass rounded-xl p-6 border border-border">
      <div className="flex items-center gap-2 mb-4">
        <Calendar className="w-5 h-5 text-accent" />
        <h2 className="text-lg font-semibold text-text-primary">Próximos 7 días</h2>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-4">
          <Loader2 className="w-5 h-5 animate-spin text-text-secondary" />
        </div>
      ) : error ? (
        <div className="flex items-start gap-3 p-3 bg-error/10 border border-error/20 rounded-lg text-error">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="text-sm">No se pudo cargar el calendario. {error}</p>
        </div>
      ) : events.length === 0 ? (
        <div className="flex items-start gap-3 opacity-60 p-4 border border-dashed border-border rounded-lg justify-center text-center">
          <div>
            <p className="text-sm font-medium text-text-primary">Agenda libre</p>
            <p className="text-xs text-text-secondary mt-1">No hay eventos próximos esta semana.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map(event => (
            <a 
              key={event.id} 
              href={event.htmlLink}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3 rounded-lg border border-border bg-surface-elevated hover:border-accent/50 hover:bg-surface transition-all group"
            >
              <h3 className="font-medium text-sm text-text-primary group-hover:text-accent transition-colors line-clamp-1">
                {event.summary || 'Evento sin título'}
              </h3>
              <p className="text-xs text-text-secondary mt-1 capitalize">
                {formatEventDate(event.start)}
              </p>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
