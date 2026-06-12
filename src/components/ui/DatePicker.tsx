'use client';

import * as React from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, addMonths, subMonths, startOfMonth, getDaysInMonth, getDay, isSameDay, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

interface DatePickerProps {
  value?: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  id?: string;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Seleccionar fecha",
  className,
  required,
  id
}: DatePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [currentMonth, setCurrentMonth] = React.useState<Date>(() => {
    if (value) {
      const parsed = parseISO(value);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return new Date();
  });

  const containerRef = React.useRef<HTMLDivElement>(null);

  // Close when clicking outside
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Update current month if value changes externally
  React.useEffect(() => {
    if (value) {
      const parsed = parseISO(value);
      if (!isNaN(parsed.getTime())) {
        setCurrentMonth(parsed);
      }
    }
  }, [value]);

  const selectedDate = value ? parseISO(value) : null;

  // Build a fixed 42-day grid
  const buildCalendarDays = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = startOfMonth(date);
    let startDayOfWeek = getDay(firstDay) - 1; // 0 = Monday
    if (startDayOfWeek < 0) startDayOfWeek = 6;

    const daysInMonth = getDaysInMonth(date);
    const prevMonthDate = subMonths(date, 1);
    const daysInPrevMonth = getDaysInMonth(prevMonthDate);

    const days = [];
    // Previous month days
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      days.push({
        day: daysInPrevMonth - i,
        isCurrentMonth: false,
        date: new Date(year, month - 1, daysInPrevMonth - i)
      });
    }
    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({
        day: d,
        isCurrentMonth: true,
        date: new Date(year, month, d)
      });
    }
    // Next month days (fill up to exactly 42 days)
    let nextDay = 1;
    while (days.length < 42) {
      days.push({
        day: nextDay,
        isCurrentMonth: false,
        date: new Date(year, month + 1, nextDay)
      });
      nextDay++;
    }
    return days;
  };

  const calendarDays = buildCalendarDays(currentMonth);

  const handleSelectDate = (date: Date) => {
    const formatted = format(date, 'yyyy-MM-dd');
    onChange(formatted);
    setIsOpen(false);
  };

  const formattedValue = selectedDate && !isNaN(selectedDate.getTime())
    ? format(selectedDate, 'd MMM, yyyy', { locale: es })
    : '';

  return (
    <div className="relative w-full" ref={containerRef} id={id}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors text-left",
          className
        )}
      >
        <span className={cn("truncate", !formattedValue && "text-text-secondary")}>
          {formattedValue || placeholder}
        </span>
        <CalendarIcon className="w-4 h-4 text-text-secondary shrink-0 ml-2" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 z-50 mt-1.5 w-72 rounded-xl border border-border bg-surface-elevated/95 backdrop-blur-md p-3 shadow-2xl animate-fade-in">
          {/* Header navigation (FIXED size, elements won't shift) */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="p-1.5 rounded-lg hover:bg-surface text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-text-primary capitalize select-none">
              {format(currentMonth, 'MMMM yyyy', { locale: es })}
            </span>
            <button
              type="button"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="p-1.5 rounded-lg hover:bg-surface text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Days of Week headers */}
          <div className="grid grid-cols-7 text-center text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1 select-none">
            <span>Lu</span><span>Ma</span><span>Mi</span><span>Ju</span><span>Vi</span><span>Sá</span><span>Do</span>
          </div>

          {/* 42-day grid (Always 6 rows, so popup height NEVER changes) */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((d, index) => {
              const isSelected = selectedDate && isSameDay(d.date, selectedDate);
              const isToday = isSameDay(d.date, new Date());
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleSelectDate(d.date)}
                  className={cn(
                    "h-8 w-8 text-xs font-medium rounded-lg flex items-center justify-center transition-colors cursor-pointer",
                    !d.isCurrentMonth && "text-text-secondary/30 hover:bg-surface hover:text-text-primary/50",
                    d.isCurrentMonth && "text-text-primary hover:bg-surface",
                    isToday && "border border-accent/40 text-accent",
                    isSelected && "bg-accent text-white hover:bg-accent/90 shadow-md shadow-accent/20"
                  )}
                >
                  {d.day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
