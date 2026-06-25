'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Calendar as CalendarIcon, 
  Loader2, 
  AlertCircle, 
  Link2, 
  ExternalLink, 
  Play, 
  Clock, 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  CalendarDays, 
  MapPin, 
  Edit, 
  Trash2, 
  Copy, 
  ArrowRightLeft, 
  Users, 
  Eye,
  X
} from 'lucide-react';
import { format, isToday, isTomorrow, parseISO, startOfMonth, getDaysInMonth, getDay, addMonths, subMonths, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/Button';
import { NewEventModal } from '@/components/calendar/NewEventModal';
import { useContextMenu } from '@/lib/contexts/ContextMenuContext';
import type { Artist } from '@/types';
import { cn } from '@/lib/utils';
import { customAlert, customConfirm, customPrompt } from '@/lib/dialog';


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
  const { showMenu } = useContextMenu();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Form states for modal
  const [initialDate, setInitialDate] = useState<string | undefined>(undefined);
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);
  
  // Custom filter and view states
  const [artistFilter, setArtistFilter] = useState<string | null>(null);
  const [showMonthYearSelector, setShowMonthYearSelector] = useState(false);
  const calendarGridRef = useRef<HTMLDivElement>(null);
  const lastScrollTimeRef = useRef(0);
  const [viewMode, setViewMode] = useState<'month' | 'list'>('list');
  const [isMobileView, setIsMobileView] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobileView(mobile);
      setViewMode(mobile ? 'list' : 'month');
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const fetchEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      const [calendarData, artistsData] = await Promise.all([
        fetch('/api/calendar?days=60').then(res => res.json()),
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

  // Filter events by artist filter if set
  const getEventsForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const baseEvents = artistFilter 
      ? events.filter(e => e.summary?.toLowerCase().includes(artistFilter.toLowerCase())) 
      : events;
    return baseEvents.filter(e => e.start.startsWith(dateStr));
  };

  // CRUD event operations
  const handleDelete = async (eventId: string) => {
    if (!await customConfirm('¿Estás seguro de que quieres eliminar este evento?')) return;
    try {
      const res = await fetch(`/api/calendar/${eventId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchEvents();
      } else {
        customAlert('Error al eliminar el evento.');
      }
    } catch (err) {
      console.error(err);
      customAlert('Error de red al eliminar el evento.');
    }
  };

  const handleDuplicate = async (event: CalendarEvent) => {
    try {
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: `${event.summary} (Copia)`,
          description: event.description,
          startDateTime: event.start,
          endDateTime: event.end,
        }),
      });
      if (res.ok) {
        fetchEvents();
      } else {
        customAlert('Error al duplicar el evento.');
      }
    } catch (err) {
      console.error(err);
      customAlert('Error de red al duplicar el evento.');
    }
  };

  const handleMoveEvent = async (event: CalendarEvent, daysOffset: number) => {
    try {
      const startDate = new Date(event.start);
      const endDate = new Date(event.end);
      
      startDate.setDate(startDate.getDate() + daysOffset);
      endDate.setDate(endDate.getDate() + daysOffset);

      const res = await fetch(`/api/calendar/${event.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDateTime: startDate.toISOString(),
          endDateTime: endDate.toISOString(),
        }),
      });
      if (res.ok) {
        fetchEvents();
      } else {
        customAlert('Error al mover el evento.');
      }
    } catch (err) {
      console.error(err);
      customAlert('Error de red al mover el evento.');
    }
  };

  const handleMoveToDate = async (event: CalendarEvent) => {
    const defaultDateStr = event.start.split('T')[0];
    const newDateStr = await customPrompt('Introduce la nueva fecha (AAAA-MM-DD):', defaultDateStr);
    if (!newDateStr) return;
    
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDateStr)) {
      customAlert('Formato de fecha inválido. Utilice AAAA-MM-DD.');
      return;
    }

    try {
      const timePartStart = event.start.split('T')[1] || '10:00:00';
      const timePartEnd = event.end.split('T')[1] || '11:00:00';
      
      const startDateTime = `${newDateStr}T${timePartStart}`;
      const endDateTime = `${newDateStr}T${timePartEnd}`;

      const res = await fetch(`/api/calendar/${event.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDateTime,
          endDateTime,
        }),
      });
      if (res.ok) {
        fetchEvents();
      } else {
        customAlert('Error al mover el evento.');
      }
    } catch (err) {
      console.error(err);
      customAlert('Error de red al mover el evento.');
    }
  };

  // Wheel Month Navigation (Non-passive to prevent page scroll)
  useEffect(() => {
    const el = calendarGridRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault(); // Prevents the whole page from scrolling
      
      const now = Date.now();
      if (now - lastScrollTimeRef.current < 450) return;
      if (Math.abs(e.deltaY) < 15) return;
      
      lastScrollTimeRef.current = now;
      if (e.deltaY > 0) {
        setCurrentMonth(prev => addMonths(prev, 1));
      } else {
        setCurrentMonth(prev => subMonths(prev, 1));
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  // Context Menu handlers
  const handleDayContextMenu = (e: React.MouseEvent, d: { day: number, isCurrentMonth: boolean, date: Date }) => {
    e.preventDefault();
    e.stopPropagation();

    showMenu(e.clientX, e.clientY, [
      {
        label: 'Nuevo Evento',
        icon: 'Plus',
        action: () => {
          setInitialDate(format(d.date, 'yyyy-MM-dd'));
          setEditEvent(null);
          setShowNewEvent(true);
        }
      },
      {
        label: 'Ir a hoy',
        icon: 'CalendarDays',
        action: () => {
          const today = new Date();
          setCurrentMonth(today);
          setSelectedDate(today);
        }
      },
      {
        label: 'Ver detalles del día',
        icon: 'Eye',
        action: () => {
          setSelectedDate(d.date);
        }
      }
    ]);
  };

  const handleEventContextMenu = (e: React.MouseEvent, event: CalendarEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const artist = detectArtist(event.summary);

    const items = [
      {
        label: 'Editar Evento',
        icon: 'Settings2',
        action: () => {
          setEditEvent(event);
          setShowNewEvent(true);
        }
      },
      {
        label: 'Duplicar Evento',
        icon: 'Copy',
        action: () => handleDuplicate(event)
      },
      {
        label: 'Mover a mañana',
        icon: 'ArrowRightLeft',
        action: () => handleMoveEvent(event, 1)
      },
      {
        label: 'Mover a otra fecha...',
        icon: 'Calendar',
        action: () => handleMoveToDate(event)
      },
      {
        label: 'Eliminar Evento',
        icon: 'Trash2',
        variant: 'danger' as const,
        action: () => handleDelete(event.id)
      }
    ];

    if (artist) {
      items.unshift({
        label: `Ver eventos de ${artist.name}`,
        icon: 'Users',
        action: () => {
          setArtistFilter(artist.name);
        }
      });
    }

    showMenu(e.clientX, e.clientY, items);
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
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      days.push({ day: daysInPrevMonth - i, isCurrentMonth: false, date: new Date(year, month - 1, daysInPrevMonth - i) });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({ day: d, isCurrentMonth: true, date: new Date(year, month, d) });
    }
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
    <div className="space-y-6 animate-fade-in pb-20 max-w-[1600px] mx-auto select-none">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-text-primary flex items-center gap-3">
            <CalendarIcon className="w-8 h-8 text-accent" />
            Calendario
          </h1>
          <p className="text-text-secondary mt-1">Agenda interactiva sincronizada con Google Calendar.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View mode toggle */}
          <div className="flex rounded-lg overflow-hidden border border-border">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                viewMode === 'list' ? 'bg-accent text-white' : 'bg-surface-elevated text-text-secondary hover:text-text-primary'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" /> Lista
            </button>
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors flex items-center gap-1.5 border-l border-border ${
                viewMode === 'month' ? 'bg-accent text-white' : 'bg-surface-elevated text-text-secondary hover:text-text-primary'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" /> Mes
            </button>
          </div>
          <Button onClick={() => { setEditEvent(null); setInitialDate(undefined); setShowNewEvent(true); }} className="gap-2">
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Nuevo Evento</span><span className="sm:hidden">Nuevo</span>
          </Button>
          <a href="https://calendar.google.com" target="_blank" rel="noreferrer" className="hidden md:block">
            <Button variant="outline" className="gap-2">
              <ExternalLink className="w-4 h-4" /> Google Calendar
            </Button>
          </a>
        </div>
      </div>

      {/* Artist Filter Alert */}
      {artistFilter && (
        <div className="flex items-center justify-between bg-accent/10 border border-accent/20 px-4 py-3 rounded-xl text-sm text-accent-light animate-fade-in">
          <span className="flex items-center gap-2">
            <Users className="w-4 h-4 text-accent" />
            Mostrando solo eventos relacionados con el artista: <strong className="text-white">{artistFilter}</strong>
          </span>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setArtistFilter(null)} 
            className="text-xs hover:bg-accent/20 text-accent-light hover:text-white flex items-center gap-1.5 h-8 py-0 px-3"
          >
            <X className="w-3.5 h-3.5" /> Quitar Filtro
          </Button>
        </div>
      )}

      <NewEventModal
        isOpen={showNewEvent}
        onClose={() => {
          setShowNewEvent(false);
          setEditEvent(null);
          setInitialDate(undefined);
        }}
        onCreated={fetchEvents}
        initialDate={initialDate}
        editEvent={editEvent}
      />

      {/* ── LIST VIEW ── (default on mobile, toggle on desktop) */}
      {viewMode === 'list' ? (
        <div className="space-y-2 animate-fade-in">
          {/* Month navigation for list view */}
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <span className="text-base font-bold capitalize">
                {format(currentMonth, 'MMMM yyyy', { locale: es })}
              </span>
              <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { const today = new Date(); setCurrentMonth(today); setSelectedDate(today); }}
              className="gap-2 text-accent font-semibold bg-accent/10 hover:bg-accent/20 border border-accent/20 text-xs"
            >
              <CalendarDays className="w-4 h-4" /> Hoy
            </Button>
          </div>

          {/* Events grouped by day */}
          {(() => {
            const year = currentMonth.getFullYear();
            const month = currentMonth.getMonth();
            const daysInMonth = getDaysInMonth(currentMonth);
            const days = Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1));
            const daysWithEvents = days.map(date => ({
              date,
              events: getEventsForDate(date),
            })).filter(d => d.events.length > 0);

            if (daysWithEvents.length === 0) {
              return (
                <div className="glass rounded-2xl p-12 text-center border border-dashed border-border">
                  <CalendarIcon className="w-12 h-12 text-text-secondary mx-auto mb-3 opacity-40" />
                  <p className="font-semibold text-text-primary">Sin eventos este mes</p>
                  <p className="text-sm text-text-secondary mt-1">Crea un nuevo evento para empezar</p>
                  <Button
                    className="mt-4"
                    onClick={() => { setEditEvent(null); setInitialDate(undefined); setShowNewEvent(true); }}
                  >
                    <Plus className="w-4 h-4 mr-2" /> Nuevo Evento
                  </Button>
                </div>
              );
            }

            return daysWithEvents.map(({ date, events }) => {
              const isTodayDate = isSameDay(date, new Date());
              const isPast = date < new Date(new Date().setHours(0,0,0,0));
              return (
                <div key={date.toISOString()} className="animate-fade-in">
                  {/* Day header */}
                  <div className={`flex items-center gap-3 px-1 mb-2 mt-4 first:mt-0`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                      isTodayDate ? 'bg-accent text-white shadow-lg shadow-accent/30' : 'bg-surface-elevated text-text-secondary border border-border'
                    }`}>
                      {format(date, 'd')}
                    </div>
                    <div>
                      <p className={`font-semibold text-sm capitalize ${
                        isTodayDate ? 'text-accent' : isPast ? 'text-text-secondary' : 'text-text-primary'
                      }`}>
                        {isTodayDate ? 'Hoy' : format(date, 'EEEE', { locale: es })}
                      </p>
                      <p className="text-xs text-text-secondary capitalize">{format(date, 'd MMMM', { locale: es })}</p>
                    </div>
                    <div className="flex-1 h-px bg-border/50" />
                    <button
                      onClick={() => { setInitialDate(format(date, 'yyyy-MM-dd')); setEditEvent(null); setShowNewEvent(true); }}
                      className="p-2 text-text-secondary hover:text-accent hover:bg-accent/10 rounded-lg transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                      title="Añadir evento"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Events for this day */}
                  <div className="space-y-2 pl-0">
                    {events.map(event => {
                      const detectedArtist = detectArtist(event.summary);
                      return (
                        <div
                          key={event.id}
                          onContextMenu={(e) => handleEventContextMenu(e, event)}
                          className={`glass rounded-2xl p-4 border transition-all cursor-pointer group ${
                            detectedArtist ? 'border-accent/30 bg-accent/5 hover:border-accent/50' : 'border-border/60 hover:border-border'
                          } ${isPast ? 'opacity-60' : ''}`}
                          onClick={() => setSelectedDate(date)}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`w-1 self-stretch rounded-full shrink-0 ${
                              detectedArtist ? 'bg-accent' : 'bg-border'
                            }`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                                  detectedArtist ? 'bg-accent/10 text-accent' : 'bg-surface-elevated text-text-secondary'
                                }`}>
                                  {format(parseISO(event.start), 'HH:mm')} — {format(parseISO(event.end), 'HH:mm')}
                                </span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDelete(event.id); }}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-text-secondary hover:text-error hover:bg-error/10 rounded-lg min-h-[36px] min-w-[36px] flex items-center justify-center"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <h4 className={`font-bold text-sm leading-tight ${
                                detectedArtist ? 'text-text-primary' : 'text-text-primary'
                              }`}>{event.summary}</h4>
                              {event.description && (
                                <p className="text-xs text-text-secondary mt-1 line-clamp-2">{event.description}</p>
                              )}
                              {detectedArtist && (
                                <div className="mt-2">
                                  <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full border border-accent/20 font-medium">
                                    🎤 {detectedArtist.name}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      ) : (
      /* ── MONTH GRID VIEW ── */
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        
        {/* INTERACTIVE CALENDAR GRID */}
        <div 
          ref={calendarGridRef}
          className="xl:col-span-3 glass rounded-2xl border border-border flex flex-col overflow-hidden shadow-2xl"
        >
          {/* Calendar Nav */}
          <div className="flex items-center justify-between p-4 border-b border-border bg-surface-elevated/50 z-30">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                <ChevronLeft className="w-5 h-5" />
              </Button>
              
              {/* Custom Selector Popover */}
              <div className="relative">
                <button
                  onClick={() => setShowMonthYearSelector(!showMonthYearSelector)}
                  className="text-xl font-bold text-text-primary capitalize w-48 text-center py-1.5 px-3 rounded-lg hover:bg-surface-elevated transition-colors flex items-center justify-center gap-1.5 group select-none cursor-pointer"
                >
                  {format(currentMonth, 'MMMM yyyy', { locale: es })}
                  <span className="text-text-secondary group-hover:text-accent transition-colors text-xs">▼</span>
                </button>

                {showMonthYearSelector && (
                  <>
                    <div 
                      className="fixed inset-0 z-40 cursor-default" 
                      onClick={() => setShowMonthYearSelector(false)}
                    />
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-72 bg-surface-elevated border border-border rounded-2xl p-4 shadow-2xl z-50 animate-menu-in">
                      {/* Year Selector */}
                      <div className="flex items-center justify-between border-b border-border/40 pb-3 mb-3">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 w-8 p-0"
                          onClick={() => {
                            setCurrentMonth(prev => new Date(prev.getFullYear() - 1, prev.getMonth(), 1));
                          }}
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <span className="font-bold text-text-primary text-base">
                          {currentMonth.getFullYear()}
                        </span>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 w-8 p-0"
                          onClick={() => {
                            setCurrentMonth(prev => new Date(prev.getFullYear() + 1, prev.getMonth(), 1));
                          }}
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>

                      {/* Month Grid */}
                      <div className="grid grid-cols-3 gap-2">
                        {['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'].map((mon, index) => {
                          const isSelectedMonth = currentMonth.getMonth() === index;
                          return (
                            <button
                              key={mon}
                              onClick={() => {
                                setCurrentMonth(prev => new Date(prev.getFullYear(), index, 1));
                                setShowMonthYearSelector(false);
                              }}
                              className={cn(
                                "py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer",
                                isSelectedMonth 
                                  ? "bg-accent text-white shadow-lg shadow-accent/25"
                                  : "text-text-secondary hover:bg-surface/50 hover:text-text-primary"
                              )}
                            >
                              {mon}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>

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
                    onContextMenu={(e) => handleDayContextMenu(e, d)}
                    className={cn(
                      "min-h-[100px] border-r border-b border-border/50 p-2 cursor-pointer transition-colors relative group",
                      !d.isCurrentMonth && "bg-surface-elevated/20 opacity-50",
                      isSelected && "bg-accent/5",
                      !isSelected && "hover:bg-surface-elevated/50",
                      isTodayDate && "bg-accent/10"
                    )}
                  >
                    {/* Day Number & Hover Plus */}
                    <div className="flex justify-between items-start mb-2 relative">
                      <span className={cn(
                        "text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full transition-colors",
                        isTodayDate ? "bg-accent text-white" : "text-text-primary group-hover:text-accent"
                      )}>
                        {d.day}
                      </span>

                      {/* Hover '+' Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setInitialDate(format(d.date, 'yyyy-MM-dd'));
                          setEditEvent(null);
                          setShowNewEvent(true);
                        }}
                        className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 transition-opacity bg-accent/20 hover:bg-accent text-accent hover:text-white p-1 rounded-md z-20 cursor-pointer"
                        title="Nuevo Evento"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>

                      {dayEvents.length > 0 && (
                        <span className="text-[10px] text-text-secondary font-mono bg-surface rounded px-1.5 py-0.5 opacity-60 group-hover:opacity-0 transition-opacity">
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
                            onContextMenu={(e) => handleEventContextMenu(e, event)}
                            className={cn(
                              "text-xs truncate px-2 py-1 rounded border transition-colors",
                              isArtistEvent 
                                ? "bg-accent/15 border-accent/30 text-accent-light font-medium shadow-[0_0_8px_rgba(108,92,231,0.1)] hover:bg-accent/20" 
                                : "bg-surface-elevated border-border/80 text-text-secondary hover:bg-border/60",
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
                        <div 
                          key={event.id} 
                          onContextMenu={(e) => handleEventContextMenu(e, event)}
                          className="p-4 rounded-xl border border-border/60 bg-surface-elevated/50 hover:border-accent/50 transition-colors group cursor-context-menu"
                        >
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                              <Clock className="w-3.5 h-3.5 text-accent" />
                              <span className="text-xs font-mono text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                                {format(parseISO(event.start), 'HH:mm')} - {format(parseISO(event.end), 'HH:mm')}
                              </span>
                            </div>
                            <button
                              onClick={() => handleDelete(event.id)}
                              className="text-text-secondary hover:text-error opacity-0 group-hover:opacity-100 transition-all cursor-pointer p-0.5 rounded hover:bg-error/10"
                              title="Eliminar Evento"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
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
            <p className="text-xs text-text-secondary leading-relaxed animate-pulse">
              Click derecho en días u/o eventos para ver más opciones rápidas y gestionar de forma nativa.
            </p>
          </div>
        </div>

      </div>
      )}
    </div>
  );
}
