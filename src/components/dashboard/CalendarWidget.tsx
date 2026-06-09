'use client';

import { useState, useEffect } from 'react';
import { Calendar, Loader2, AlertCircle } from 'lucide-react';
import { format, isToday, isTomorrow, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/Button';

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
      const res = await fetch('/api/calendar?days=7');
      const data = await res.json();
      
      if (!res.ok) {
        if (data.needsAuth) {
          throw new Error('Faltan permisos de Calendario. Por favor, asegúrate de actualizar tu GOOGLE_REFRESH_TOKEN tras añadir los nuevos scopes.');
        }
        throw new Error(data.error || 'Failed to fetch calendar');
      }
      
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
        <div className="flex flex-col items-center justify-center p-6 bg-surface-elevated rounded-xl border border-border text-center">
          <Calendar className="w-8 h-8 text-text-secondary mb-3 opacity-50" />
          <p className="text-sm font-medium text-text-primary mb-1">Conecta tu Calendario</p>
          <p className="text-xs text-text-secondary mb-4 px-2">
            Necesitas sincronizar tu cuenta de Google Calendar para ver tus próximas sesiones aquí.
          </p>
          <Button 
            onClick={async () => {
              try {
                await authClient.signIn.social({ provider: 'google', callbackURL: '/dashboard' });
              } catch (e) {
                console.error(e);
              }
            }} 
            variant="outline" 
            size="sm" 
            className="w-full"
          >
            Configurar conexión
          </Button>
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
