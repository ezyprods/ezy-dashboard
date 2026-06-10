'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar as CalendarIcon, Loader2, AlertCircle, Link2, ExternalLink, Play, Clock, Plus, ChevronLeft, ChevronRight, CalendarDays, MapPin } from 'lucide-react';
import { format, isToday, isTomorrow, parseISO, startOfMonth, getDaysInMonth, getDay, addMonths, subMonths, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/Button';
import { NewEventModal } from '@/components/calendar/NewEventModal';
import type { Artist } from '@/types';
import { cn } from '@/lib/utils';

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
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const fetchEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      const [calendarData, artistsData] = await Promise.all([
        fetch('/api/calendar?days=60').then(res => res.json()), // Aumentado a 60 días para cubrir más meses
        fetch('/api/artists').then(res => res.json()),
      ]);
      if (calendarData.needsAuth || calendarData.error) {
        setError(calendarData.error || 'Autenticación requerida');
      } else {
        setEvents(calendarData.events || []);
      }
      setArtists(artistsData.artists || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const detectArtist = (summary: string) => {
    if (!summary) return null;
    const lowerSummary = summary.toLowerCase();
    return artists.find(a => lowerSummary.includes(a.name.toLowerCase()));
  };

  const getEventsForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return events.filter(e => e.start.startsWith(dateStr));
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

  // --- BUILD CALENDAR GRID ---
  const buildCalendarDays = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = startOfMonth(date);
    let startDayOfWeek = getDay(firstDay) - 1; // 0=Sunday, we want 0=Monday
    if (startDayOfWeek < 0) startDayOfWeek = 6;
    
    const daysInMonth = getDaysInMonth(date);
    const prevMonthDate = subMonths(date, 1);
    const daysInPrevMonth = getDaysInMonth(prevMonthDate);
    
    const days = [];
    // prev month
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      days.push({ day: daysInPrevMonth - i, isCurrentMonth: false, date: new Date(year, month - 1, daysInPrevMonth - i) });
    }
    // current month
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({ day: d, isCurrentMonth: true, date: new Date(year, month, d) });
    }
    // next month
    let nextDay = 1;
    while (days.length < 42) {
      days.push({ day: nextDay, isCurrentMonth: false, date: new Date(year, month + 1, nextDay) });
      nextDay++;
    }
    return days;
  };

  const calendarDays = buildCalendarDays(currentMonth);
  const selectedDateEvents = selectedDate ? getEventsForDate(selectedDate) : [];

  return (
    <div className="space-y-6 animate-fade-in pb-20 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-text-primary flex items-center gap-3">
            <CalendarIcon className="w-8 h-8 text-accent" />
            Calendario
          </h1>
          <p className="text-text-secondary mt-1">Agenda interactiva sincronizada con Google Calendar.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setShowNewEvent(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Nuevo Evento
          </Button>
          <a href="https://calendar.google.com" target="_blank" rel="noreferrer">
            <Button variant="outline" className="gap-2">
              <ExternalLink className="w-4 h-4" /> Google Calendar
            </Button>
          </a>
        </div>
      </div>

      <NewEventModal
        isOpen={showNewEvent}
        onClose={() => setShowNewEvent(false)}
        onCreated={fetchEvents}
      />

      {/* Main Layout: Grid (Left/Center) | Sidebar (Right) */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        
        {/* INTERACTIVE CALENDAR GRID */}
        <div className="xl:col-span-3 glass rounded-2xl border border-border flex flex-col overflow-hidden shadow-2xl">
          {/* Calendar Nav */}
          <div className="flex items-center justify-between p-4 border-b border-border bg-surface-elevated/50">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <h2 className="text-xl font-bold text-text-primary capitalize w-48 text-center">
                {format(currentMonth, 'MMMM yyyy', { locale: es })}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
            
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={() => {
                const today = new Date();
                setCurrentMonth(today);
                setSelectedDate(today);
              }}
              className="gap-2 text-accent font-semibold bg-accent/10 hover:bg-accent/20 border border-accent/20"
            >
              <CalendarDays className="w-4 h-4" /> Hoy
            </Button>
          </div>

          {/* Grid Layout */}
          <div className="flex-1 bg-surface/30">
            {/* Days of Week */}
            <div className="grid grid-cols-7 border-b border-border bg-surface-elevated/30 text-center text-xs font-bold text-text-secondary uppercase tracking-widest py-3">
              <div>Lun</div><div>Mar</div><div>Mié</div><div>Jue</div><div>Vie</div><div>Sáb</div><div>Dom</div>
            </div>
            
            {/* 42-day Grid */}
            <div className="grid grid-cols-7 auto-rows-fr h-[600px]">
              {calendarDays.map((d, i) => {
                const dayEvents = getEventsForDate(d.date);
                const isSelected = selectedDate && isSameDay(d.date, selectedDate);
                const isTodayDate = isSameDay(d.date, new Date());
                const isPast = d.date < new Date(new Date().setHours(0,0,0,0));

                return (
                  <div
                    key={i}
                    onClick={() => setSelectedDate(d.date)}
                    onContextMenu={(e) => {
                      // Custom right click can be intercepted by global ContextMenu
                      e.currentTarget.setAttribute('data-context', 'calendar-day');
                    }}
                    className={cn(
                      "min-h-[100px] border-r border-b border-border/50 p-2 cursor-pointer transition-colors relative group",
                      !d.isCurrentMonth && "bg-surface-elevated/20 opacity-50",
                      isSelected && "bg-accent/5",
                      !isSelected && "hover:bg-surface-elevated/50",
                      isTodayDate && "bg-accent/10"
                    )}
                  >
                    {/* Day Number */}
                    <div className="flex justify-between items-start mb-2">
                      <span className={cn(
                        "text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full",
                        isTodayDate ? "bg-accent text-white" : "text-text-primary group-hover:text-accent transition-colors"
                      )}>
                        {d.day}
                      </span>
                      {dayEvents.length > 0 && (
                        <span className="text-[10px] text-text-secondary font-mono bg-surface rounded px-1.5 py-0.5 opacity-60 group-hover:opacity-100">
                          {dayEvents.length}
                        </span>
                      )}
                    </div>

                    {/* Event Pills */}
                    <div className="space-y-1.5 overflow-hidden max-h-[calc(100%-30px)]">
                      {dayEvents.slice(0, 3).map(event => {
                        const isArtistEvent = detectArtist(event.summary);
                        return (
                          <div 
                            key={event.id}
                            className={cn(
                              "text-xs truncate px-2 py-1 rounded border",
                              isArtistEvent 
                                ? "bg-accent/15 border-accent/30 text-accent-light font-medium shadow-[0_0_8px_rgba(108,92,231,0.1)]" 
                                : "bg-surface-elevated border-border/80 text-text-secondary",
                              isPast && "opacity-60"
                            )}
                            title={event.summary}
                          >
                            <span className="opacity-70 mr-1.5 font-mono text-[10px]">
                              {format(parseISO(event.start), 'HH:mm')}
                            </span>
                            {event.summary}
                          </div>
                        );
                      })}
                      {dayEvents.length > 3 && (
                        <div className="text-[10px] text-text-secondary pl-1 font-medium">
                          +{dayEvents.length - 3} más...
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* SIDEBAR: Selected Date Info */}
        <div className="xl:col-span-1 space-y-6">
          <div className="glass rounded-2xl border border-border p-6 shadow-xl sticky top-24">
            {selectedDate ? (
              <>
                <h3 className="font-bold text-xl capitalize text-text-primary mb-1">
                  {isSameDay(selectedDate, new Date()) ? 'Hoy' : format(selectedDate, "EEEE d", { locale: es })}
                </h3>
                <p className="text-sm text-accent mb-6 capitalize">{format(selectedDate, "MMMM yyyy", { locale: es })}</p>

                {selectedDateEvents.length === 0 ? (
                  <div className="text-center py-8 border border-dashed border-border rounded-xl bg-surface/30">
                    <CalendarIcon className="w-8 h-8 text-text-secondary mx-auto mb-2 opacity-50" />
                    <p className="text-text-secondary text-sm">No hay eventos para este día.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {selectedDateEvents.map(event => {
                      const detectedArtist = detectArtist(event.summary);
                      return (
                        <div key={event.id} className="p-4 rounded-xl border border-border/60 bg-surface-elevated/50 hover:border-accent/50 transition-colors group">
                          <div className="flex items-center gap-2 mb-2">
                            <Clock className="w-3.5 h-3.5 text-accent" />
                            <span className="text-xs font-mono text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                              {format(parseISO(event.start), 'HH:mm')} - {format(parseISO(event.end), 'HH:mm')}
                            </span>
                          </div>
                          <h4 className="font-bold text-text-primary text-sm leading-tight mb-2">
                            {event.summary}
                          </h4>
                          {event.description && (
                            <p className="text-xs text-text-secondary line-clamp-3 mb-3">
                              {event.description}
                            </p>
                          )}
                          
                          {detectedArtist ? (
                            <Button 
                              size="sm" 
                              onClick={() => router.push(`/artists/${detectedArtist.id}`)}
                              className="w-full bg-accent/10 text-accent hover:bg-accent hover:text-white"
                            >
                              <Play className="w-3 h-3 mr-2" /> Ir a Proyecto
                            </Button>
                          ) : (
                            <a href={event.htmlLink} target="_blank" rel="noreferrer">
                              <Button variant="outline" size="sm" className="w-full text-xs">
                                <ExternalLink className="w-3 h-3 mr-2" /> Detalles
                              </Button>
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12">
                <CalendarIcon className="w-12 h-12 text-border mx-auto mb-4" />
                <h3 className="font-bold text-lg mb-2">Selecciona un día</h3>
                <p className="text-sm text-text-secondary">Haz clic en cualquier día del calendario para ver los detalles de los eventos programados.</p>
              </div>
            )}
          </div>
          
          <div className="bg-surface-elevated rounded-2xl border border-border p-5">
            <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
              <Link2 className="w-4 h-4 text-accent" /> Magia EZY
            </h3>
            <p className="text-xs text-text-secondary leading-relaxed">
              El calendario lee tus eventos. Si el título contiene el nombre de un artista (ej: "Mix AmoryOdio"), se enlazará automáticamente con su proyecto.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
