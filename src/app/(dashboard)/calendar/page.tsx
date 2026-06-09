'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar as CalendarIcon, Loader2, AlertCircle, Link2, ExternalLink, Play, Clock } from 'lucide-react';
import { format, isToday, isTomorrow, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/Button';
import { authClient } from '@/lib/auth-client';
import type { Artist } from '@/types';

interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  htmlLink: string;
}

export default function CalendarPage() {
  const router = useRouter();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/calendar?days=30').then(res => res.json()),
      fetch('/api/artists').then(res => res.json())
    ]).then(([calendarData, artistsData]) => {
      if (calendarData.needsAuth || calendarData.error) {
        setError(calendarData.error || 'Autenticación requerida');
      } else {
        setEvents(calendarData.events || []);
      }
      setArtists(artistsData.artists || []);
      setIsLoading(false);
    }).catch(err => {
      setError(err.message);
      setIsLoading(false);
    });
  }, []);

  const formatEventTime = (dateStr: string) => {
    const date = parseISO(dateStr);
    return format(date, 'HH:mm');
  };

  const getEventDateText = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (isToday(date)) return 'Hoy';
    if (isTomorrow(date)) return 'Mañana';
    return format(date, "EEEE d 'de' MMMM", { locale: es });
  };

  // Agrupar eventos por día
  const groupedEvents = events.reduce((acc, event) => {
    const dateStr = event.start.split('T')[0];
    if (!acc[dateStr]) acc[dateStr] = [];
    acc[dateStr].push(event);
    return acc;
  }, {} as Record<string, CalendarEvent[]>);

  // Magic detection: Match event summary with artist names
  const detectArtist = (summary: string) => {
    if (!summary) return null;
    const lowerSummary = summary.toLowerCase();
    return artists.find(a => lowerSummary.includes(a.name.toLowerCase()));
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh]">
        <Loader2 className="w-12 h-12 animate-spin text-accent mb-4" />
        <p className="text-text-secondary">Sincronizando con Google Calendar...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh]">
        <div className="glass p-12 rounded-3xl border border-error/20 flex flex-col items-center max-w-md text-center">
          <AlertCircle className="w-16 h-16 text-warning mb-6" />
          <h2 className="text-2xl font-bold mb-2">Conexión Requerida</h2>
          <p className="text-text-secondary mb-8">
            {error.includes('permisos') ? error : 'Necesitas sincronizar tu cuenta de Google Calendar para usar el Calendario Inteligente.'}
          </p>
          <Button 
            onClick={() => {
              window.location.href = '/api/auth/google-token';
            }} 
            size="lg" 
            className="w-full"
          >
            Conectar con Google
          </Button>
        </div>
      </div>
    );
  }

  const sortedDates = Object.keys(groupedEvents).sort();

  return (
    <div className="space-y-8 animate-fade-in pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-text-primary flex items-center gap-3">
            <CalendarIcon className="w-8 h-8 text-accent" />
            Calendario Inteligente
          </h1>
          <p className="text-text-secondary mt-1">Próximos 30 días sincronizados desde Google Calendar.</p>
        </div>
        <a href="https://calendar.google.com" target="_blank" rel="noreferrer">
          <Button variant="outline" className="gap-2">
            <ExternalLink className="w-4 h-4" /> Abrir en Google
          </Button>
        </a>
      </div>

      {sortedDates.length === 0 ? (
        <div className="glass p-12 rounded-3xl border border-dashed border-border text-center flex flex-col items-center">
          <CalendarIcon className="w-16 h-16 text-text-secondary opacity-50 mb-4" />
          <h3 className="text-xl font-bold mb-2">Agenda despejada</h3>
          <p className="text-text-secondary">No tienes eventos programados para los próximos 30 días.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Timeline View */}
          <div className="lg:col-span-2 space-y-8">
            {sortedDates.map((dateStr) => {
              const dayEvents = groupedEvents[dateStr];
              const isPast = new Date(dateStr) < new Date(new Date().setHours(0,0,0,0));
              
              return (
                <div key={dateStr} className={`relative pl-8 ${isPast ? 'opacity-60' : ''}`}>
                  {/* Timeline Line */}
                  <div className="absolute left-[11px] top-8 bottom-[-32px] w-0.5 bg-border/50" />
                  
                  {/* Date Header */}
                  <div className="relative mb-4">
                    <div className="absolute -left-[37px] top-1.5 w-4 h-4 rounded-full bg-accent/20 border-2 border-accent" />
                    <h3 className="text-lg font-bold capitalize text-text-primary">
                      {getEventDateText(dateStr)}
                    </h3>
                  </div>

                  {/* Events */}
                  <div className="space-y-3">
                    {dayEvents.map(event => {
                      const detectedArtist = detectArtist(event.summary);
                      
                      return (
                        <div key={event.id} className="glass rounded-xl p-4 border border-border/50 hover:border-accent/50 transition-colors group">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-start gap-4">
                              <div className="text-center shrink-0 w-16 bg-surface/50 rounded-lg py-2 border border-border/30">
                                <p className="font-mono font-bold text-accent">{formatEventTime(event.start)}</p>
                                <p className="text-[10px] text-text-secondary mt-0.5">{formatEventTime(event.end)}</p>
                              </div>
                              <div>
                                <h4 className="font-semibold text-text-primary text-lg leading-tight">{event.summary}</h4>
                                {event.description && (
                                  <p className="text-sm text-text-secondary mt-1 line-clamp-2">{event.description}</p>
                                )}
                              </div>
                            </div>
                            
                            <div className="flex flex-col items-end gap-2 shrink-0">
                              {detectedArtist ? (
                                <Button 
                                  size="sm" 
                                  onClick={() => router.push(`/artists/${detectedArtist.id}`)}
                                  className="bg-accent/10 text-accent hover:bg-accent hover:text-white"
                                >
                                  <Play className="w-4 h-4 mr-2" />
                                  Ir al Proyecto
                                </Button>
                              ) : (
                                <a href={event.htmlLink} target="_blank" rel="noreferrer" className="text-xs text-text-secondary hover:text-accent flex items-center gap-1 transition-colors">
                                  Ver detalles <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Smart Insights Sidebar */}
          <div className="space-y-6">
            <div className="bg-surface-elevated rounded-2xl border border-border p-6 shadow-xl">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                <Link2 className="w-5 h-5 text-accent" />
                Interconexión EZY
              </h3>
              <p className="text-sm text-text-secondary mb-4 leading-relaxed">
                El calendario lee tus eventos de Google. Si el título del evento contiene el nombre de alguno de tus artistas, generará automáticamente un botón para abrir su proyecto en Drive.
              </p>
              <div className="p-3 bg-accent/10 border border-accent/20 rounded-lg text-sm text-accent">
                <strong>Tip:</strong> Renombra tus eventos en Google Calendar a algo como "Grabación de guitarras con AmoryOdio" para que funcione la magia.
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
