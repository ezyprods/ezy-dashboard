'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
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
  /** Shows a "Quitar fecha" action that sets the value to '' */
  clearable?: boolean;
}

const POPUP_WIDTH = 288; // w-72
const POPUP_HEIGHT = 340;

export function DatePicker({
  value,
  onChange,
  placeholder = "Seleccionar fecha",
  className,
  required,
  id,
  clearable = false,
}: DatePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [currentMonth, setCurrentMonth] = React.useState<Date>(() => {
    if (value) {
      const parsed = parseISO(value);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return new Date();
  });
  const [position, setPosition] = React.useState<{ top: number; left: number } | null>(null);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const popupRef = React.useRef<HTMLDivElement>(null);

  // The popup is rendered in a portal with fixed positioning so it is never clipped
  // by scrollable containers (e.g. the production matrix table) or modals.
  const updatePosition = React.useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = Math.min(rect.left, vw - POPUP_WIDTH - 8);
    left = Math.max(8, left);
    const spaceBelow = vh - rect.bottom;
    const top = spaceBelow >= POPUP_HEIGHT || rect.top < POPUP_HEIGHT
      ? Math.min(rect.bottom + 6, Math.max(8, vh - POPUP_HEIGHT - 8))
      : Math.max(8, rect.top - POPUP_HEIGHT - 6);
    setPosition({ top, left });
  }, []);

  React.useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  // Close when clicking/tapping outside (the popup lives in a portal)
  React.useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (popupRef.current?.contains(target)) return;
      setIsOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

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

  const handleSelectDate = (date: Date) => {
    onChange(format(date, 'yyyy-MM-dd'));
    setIsOpen(false);
  };

  const formattedValue = selectedDate && !isNaN(selectedDate.getTime())
    ? format(selectedDate, 'd MMM, yyyy', { locale: es })
    : '';

  const popup = isOpen && position && typeof document !== 'undefined' ? createPortal(
    <div
      ref={popupRef}
      className="fixed z-[10000] w-72 rounded-xl border border-border bg-surface-elevated/95 backdrop-blur-md p-3 shadow-2xl animate-fade-in"
      style={{ top: position.top, left: position.left }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          className="p-2 rounded-lg hover:bg-surface text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
          aria-label="Mes anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-text-primary capitalize select-none">
          {format(currentMonth, 'MMMM yyyy', { locale: es })}
        </span>
        <button
          type="button"
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          className="p-2 rounded-lg hover:bg-surface text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
          aria-label="Mes siguiente"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 text-center text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1 select-none">
        <span>Lu</span><span>Ma</span><span>Mi</span><span>Ju</span><span>Vi</span><span>Sá</span><span>Do</span>
      </div>

      {/* 42-day grid (always 6 rows, so the popup height never changes) */}
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
                "h-8 w-8 text-xs font-medium rounded-lg flex items-center justify-center transition-colors cursor-pointer mx-auto",
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

      <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/50">
        <button
          type="button"
          onClick={() => handleSelectDate(new Date())}
          className="text-xs font-semibold text-accent hover:underline px-1 py-1"
        >
          Hoy
        </button>
        {clearable && !required && value && (
          <button
            type="button"
            onClick={() => { onChange(''); setIsOpen(false); }}
            className="text-xs font-semibold text-text-secondary hover:text-error flex items-center gap-1 px-1 py-1"
          >
            <X className="w-3 h-3" /> Quitar fecha
          </button>
        )}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div className="relative w-full" ref={containerRef} id={id}>
      <button
        ref={buttonRef}
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
      {popup}
    </div>
  );
}
