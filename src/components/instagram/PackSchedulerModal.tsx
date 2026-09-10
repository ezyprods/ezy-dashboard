'use client';

import { useState, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  X,
  Check,
  Plus,
  Trash2,
  Clock,
  Camera,
  Image as ImageIcon,
  Film,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  getDaysInMonth,
  getDay,
  isSameDay,
  isBefore,
  startOfDay,
} from 'date-fns';
import { es } from 'date-fns/locale';
import type { InstagramPack, InstagramSlot, InstagramContentType } from '@/types/instagram';
import { CONTENT_TYPE_LABELS, CONTENT_TYPE_EMOJIS } from '@/types/instagram';
import { v4 as uuidv4 } from 'uuid';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function addHoursToTime(time: string, hours: number): string {
  const [h, m] = time.split(':').map(Number);
  const totalMinutes = h * 60 + m + hours * 60;
  const newH = Math.floor(totalMinutes / 60) % 24;
  const newM = totalMinutes % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

function buildDefaultSlot(time: string = '12:00'): InstagramSlot {
  return { time, autoDelete: false, autoDeleteOffsetHours: 24 };
}

// ─── Slot Config Component ───────────────────────────────────────────────────

interface SlotConfigProps {
  label: string;
  emoji: string;
  slot: InstagramSlot | undefined;
  enabled: boolean;
  onToggle: () => void;
  onChange: (slot: InstagramSlot) => void;
}

function SlotConfig({ label, emoji, slot, enabled, onToggle, onChange }: SlotConfigProps) {
  const handleAutoDeleteToggle = () => {
    if (!slot) return;
    const nowEnabled = !slot.autoDelete;
    onChange({
      ...slot,
      autoDelete: nowEnabled,
      // Al activar: 24h después por defecto
      autoDeleteOffsetHours: nowEnabled ? 24 : slot.autoDeleteOffsetHours,
    });
  };

  const handleTimeChange = (newTime: string) => {
    if (!slot) return;
    onChange({ ...slot, time: newTime });
  };

  const handleOffsetChange = (hours: number) => {
    if (!slot) return;
    onChange({ ...slot, autoDeleteOffsetHours: Math.max(1, hours) });
  };

  // Calcular hora de eliminación relativa (ejemplo para mostrar al usuario)
  const deleteTimeExample = slot?.autoDelete
    ? addHoursToTime(slot.time, slot.autoDeleteOffsetHours)
    : null;

  return (
    <div
      className={cn(
        'rounded-2xl border transition-all duration-200',
        enabled
          ? 'border-accent/40 bg-accent/5 shadow-sm shadow-accent/10'
          : 'border-border/60 bg-surface-elevated/30 opacity-60'
      )}
    >
      {/* Header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 cursor-pointer group"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-xl">{emoji}</span>
          <div className="text-left">
            <p className="font-semibold text-sm text-text-primary">{label}</p>
            {enabled && slot && (
              <p className="text-xs text-text-secondary font-mono">{slot.time}</p>
            )}
          </div>
        </div>
        <div
          className={cn(
            'w-11 h-6 rounded-full transition-all duration-200 relative shrink-0',
            enabled ? 'bg-accent' : 'bg-border'
          )}
        >
          <div
            className={cn(
              'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-200',
              enabled ? 'left-[calc(100%-22px)]' : 'left-0.5'
            )}
          />
        </div>
      </button>

      {/* Body: only shown when enabled */}
      {enabled && slot && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/30 pt-3">
          {/* Hora de publicación */}
          <div className="flex items-center gap-3">
            <Clock className="w-4 h-4 text-text-secondary shrink-0" />
            <div className="flex-1">
              <label className="text-xs text-text-secondary font-medium mb-1 block">
                Hora de publicación
              </label>
              <input
                type="time"
                value={slot.time}
                onChange={(e) => handleTimeChange(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-border bg-surface text-text-primary text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent/50 cursor-pointer"
              />
            </div>
          </div>

          {/* Autoeliminar toggle */}
          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-xs font-semibold text-text-primary">Autoeliminar</p>
              {slot.autoDelete && deleteTimeExample && (
                <p className="text-xs text-text-secondary font-mono mt-0.5">
                  ≈ {deleteTimeExample} (+{slot.autoDeleteOffsetHours}h)
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={handleAutoDeleteToggle}
              className={cn(
                'w-10 h-5.5 rounded-full transition-all duration-200 relative shrink-0 cursor-pointer',
                slot.autoDelete ? 'bg-warning' : 'bg-border'
              )}
              style={{ height: '22px', width: '40px' }}
            >
              <div
                className={cn(
                  'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-200',
                  slot.autoDelete ? 'left-[calc(100%-18px)]' : 'left-0.5'
                )}
              />
            </button>
          </div>

          {/* Offset hours input (only when autoDelete is on) */}
          {slot.autoDelete && (
            <div className="flex items-center gap-2 bg-warning/5 border border-warning/20 rounded-xl p-3 animate-fade-in">
              <AlertCircle className="w-3.5 h-3.5 text-warning shrink-0" />
              <span className="text-xs text-text-secondary flex-1">Eliminar</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleOffsetChange(slot.autoDeleteOffsetHours - 1)}
                  className="w-7 h-7 rounded-lg bg-surface border border-border flex items-center justify-center hover:bg-surface-elevated transition-colors cursor-pointer"
                >
                  <span className="text-sm leading-none">−</span>
                </button>
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={slot.autoDeleteOffsetHours}
                  onChange={(e) => handleOffsetChange(parseInt(e.target.value) || 24)}
                  className="w-14 h-7 text-center text-sm font-mono border border-border rounded-lg bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent/50"
                />
                <button
                  type="button"
                  onClick={() => handleOffsetChange(slot.autoDeleteOffsetHours + 1)}
                  className="w-7 h-7 rounded-lg bg-surface border border-border flex items-center justify-center hover:bg-surface-elevated transition-colors cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                </button>
                <span className="text-xs text-text-secondary ml-1">h después</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Multi Date Picker ────────────────────────────────────────────────────────

interface MultiDatePickerProps {
  selectedDates: string[];
  onToggleDate: (date: string) => void;
}

function MultiDatePicker({ selectedDates, onToggleDate }: MultiDatePickerProps) {
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const today = startOfDay(new Date());

  const buildDays = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = startOfMonth(date);
    let startDayOfWeek = getDay(firstDay) - 1;
    if (startDayOfWeek < 0) startDayOfWeek = 6;

    const daysInMonth = getDaysInMonth(date);
    const prevMonthDays = getDaysInMonth(subMonths(date, 1));

    const days = [];
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      days.push({
        day: prevMonthDays - i,
        isCurrentMonth: false,
        date: new Date(year, month - 1, prevMonthDays - i),
      });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({ day: d, isCurrentMonth: true, date: new Date(year, month, d) });
    }
    let next = 1;
    while (days.length < 42) {
      days.push({ day: next, isCurrentMonth: false, date: new Date(year, month + 1, next) });
      next++;
    }
    return days;
  };

  const days = buildDays(currentMonth);

  return (
    <div className="space-y-3">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          className="p-2 rounded-lg hover:bg-surface-elevated transition-colors cursor-pointer text-text-secondary hover:text-text-primary"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-bold text-text-primary capitalize select-none">
          {format(currentMonth, 'MMMM yyyy', { locale: es })}
        </span>
        <button
          type="button"
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          className="p-2 rounded-lg hover:bg-surface-elevated transition-colors cursor-pointer text-text-secondary hover:text-text-primary"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 text-center text-[10px] font-bold text-text-secondary uppercase tracking-wider">
        {['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((d, idx) => {
          const dateStr = format(d.date, 'yyyy-MM-dd');
          const isSelected = selectedDates.includes(dateStr);
          const isPast = isBefore(d.date, today);
          const isToday = isSameDay(d.date, today);

          return (
            <button
              key={idx}
              type="button"
              disabled={isPast && !isToday}
              onClick={() => onToggleDate(dateStr)}
              className={cn(
                'h-9 w-full text-xs font-medium rounded-lg flex items-center justify-center transition-all duration-150 cursor-pointer relative',
                !d.isCurrentMonth && 'opacity-25',
                isPast && !isToday && 'opacity-20 cursor-not-allowed',
                isToday && !isSelected && 'border border-accent/40 text-accent font-bold',
                isSelected
                  ? 'bg-accent text-white shadow-md shadow-accent/30 scale-105 font-bold'
                  : 'hover:bg-surface-elevated text-text-primary'
              )}
            >
              {d.day}
              {isSelected && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-white/90" />
              )}
            </button>
          );
        })}
      </div>

      {/* Selected count chip */}
      {selectedDates.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap pt-1">
          {selectedDates.sort().map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onToggleDate(d)}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-accent/15 text-accent border border-accent/30 rounded-full text-xs font-medium hover:bg-error/15 hover:text-error hover:border-error/30 transition-colors group cursor-pointer"
            >
              <span>{format(new Date(d + 'T00:00:00'), 'd MMM', { locale: es })}</span>
              <X className="w-3 h-3 opacity-60 group-hover:opacity-100" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

interface PackSchedulerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (packs: InstagramPack[]) => void;
  artistId?: string;
  artistName?: string;
}

type Step = 1 | 2 | 3;

const TYPES: InstagramContentType[] = ['story', 'feed', 'reel'];

const TYPE_ICONS: Record<InstagramContentType, React.FC<{ className?: string }>> = {
  story: Camera,
  feed: ImageIcon,
  reel: Film,
};

export function PackSchedulerModal({
  isOpen,
  onClose,
  onSave,
  artistId,
  artistName,
}: PackSchedulerModalProps) {
  const [step, setStep] = useState<Step>(1);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);

  // Pack config: which types are enabled + their slots
  const [enabled, setEnabled] = useState<Record<InstagramContentType, boolean>>({
    story: true,
    feed: true,
    reel: true,
  });
  const [slots, setSlots] = useState<Record<InstagramContentType, InstagramSlot>>({
    story: buildDefaultSlot('18:00'),
    feed: buildDefaultSlot('19:00'),
    reel: buildDefaultSlot('20:00'),
  });

  const reset = () => {
    setStep(1);
    setSelectedDates([]);
    setEnabled({ story: true, feed: true, reel: true });
    setSlots({
      story: buildDefaultSlot('18:00'),
      feed: buildDefaultSlot('19:00'),
      reel: buildDefaultSlot('20:00'),
    });
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const toggleDate = useCallback((date: string) => {
    setSelectedDates((prev) =>
      prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date]
    );
  }, []);

  const toggleType = (type: InstagramContentType) => {
    setEnabled((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  const updateSlot = (type: InstagramContentType, slot: InstagramSlot) => {
    setSlots((prev) => ({ ...prev, [type]: slot }));
  };

  const handleConfirm = () => {
    const now = new Date().toISOString();
    const packs: InstagramPack[] = selectedDates.sort().map((date) => ({
      id: uuidv4(),
      date,
      artistId,
      artistName,
      story: enabled.story ? { ...slots.story } : undefined,
      feed: enabled.feed ? { ...slots.feed } : undefined,
      reel: enabled.reel ? { ...slots.reel } : undefined,
      createdAt: now,
    }));
    onSave(packs);
    handleClose();
  };

  const activeTypes = TYPES.filter((t) => enabled[t]);
  const totalPublications = selectedDates.length * activeTypes.length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-0 md:p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={handleClose}
      />

      {/* Panel */}
      <div className="relative z-10 w-full md:max-w-2xl bg-surface-elevated rounded-t-[32px] md:rounded-2xl shadow-2xl border-t md:border border-border max-h-[94vh] flex flex-col animate-slide-up md:animate-scale-in pb-[env(safe-area-inset-bottom)]">
        {/* Drag handle (mobile) */}
        <div className="w-12 h-1.5 bg-border/80 rounded-full mx-auto mt-3 mb-1 md:hidden shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-3">
            {/* Step dots */}
            <div className="flex items-center gap-1.5">
              {([1, 2, 3] as Step[]).map((s) => (
                <div
                  key={s}
                  className={cn(
                    'rounded-full transition-all duration-200',
                    s === step
                      ? 'w-5 h-2 bg-accent'
                      : s < step
                      ? 'w-2 h-2 bg-accent/50'
                      : 'w-2 h-2 bg-border'
                  )}
                />
              ))}
            </div>
            <div>
              <h2 className="text-base font-bold text-text-primary leading-tight">
                {step === 1 && 'Selecciona fechas'}
                {step === 2 && 'Configura el pack'}
                {step === 3 && 'Confirmar y guardar'}
              </h2>
              <p className="text-xs text-text-secondary">
                {step === 1 && 'Elige los días en los que publicar este pack'}
                {step === 2 && 'Configura cada tipo de contenido y sus horarios'}
                {step === 3 && `${totalPublications} publicación${totalPublications !== 1 ? 'es' : ''} en ${selectedDates.length} fecha${selectedDates.length !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* ── Step 1: Multi-date picker ── */}
          {step === 1 && (
            <MultiDatePicker selectedDates={selectedDates} onToggleDate={toggleDate} />
          )}

          {/* ── Step 2: Pack config ── */}
          {step === 2 && (
            <div className="space-y-3">
              {TYPES.map((type) => {
                const Icon = TYPE_ICONS[type];
                return (
                  <SlotConfig
                    key={type}
                    label={CONTENT_TYPE_LABELS[type]}
                    emoji={CONTENT_TYPE_EMOJIS[type]}
                    slot={slots[type]}
                    enabled={enabled[type]}
                    onToggle={() => toggleType(type)}
                    onChange={(s) => updateSlot(type, s)}
                  />
                );
              })}

              {activeTypes.length === 0 && (
                <div className="text-center py-8 text-text-secondary text-sm">
                  Activa al menos un tipo de contenido
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Summary ── */}
          {step === 3 && (
            <div className="space-y-4">
              {/* Summary header */}
              <div className="glass rounded-2xl border border-border p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
                  <span className="text-2xl">📅</span>
                </div>
                <div>
                  <p className="font-bold text-text-primary">
                    {totalPublications} publicaciones programadas
                  </p>
                  <p className="text-sm text-text-secondary">
                    {selectedDates.length} fecha{selectedDates.length !== 1 ? 's' : ''} ×{' '}
                    {activeTypes.length} tipo{activeTypes.length !== 1 ? 's' : ''} de contenido
                  </p>
                  {artistName && (
                    <p className="text-xs text-accent mt-0.5">🎤 {artistName}</p>
                  )}
                </div>
              </div>

              {/* Per-date breakdown */}
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {selectedDates.sort().map((date) => (
                  <div
                    key={date}
                    className="glass rounded-xl border border-border/60 px-4 py-3 flex items-center gap-3"
                  >
                    <div className="w-10 h-10 rounded-xl bg-surface flex flex-col items-center justify-center shrink-0 border border-border/60">
                      <span className="text-xs font-black text-accent leading-none">
                        {format(new Date(date + 'T00:00:00'), 'd')}
                      </span>
                      <span className="text-[9px] text-text-secondary uppercase font-bold leading-none mt-0.5">
                        {format(new Date(date + 'T00:00:00'), 'MMM', { locale: es })}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-text-primary capitalize">
                        {format(new Date(date + 'T00:00:00'), 'EEEE d MMMM', { locale: es })}
                      </p>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {TYPES.filter((t) => enabled[t]).map((type) => {
                          const s = slots[type];
                          return (
                            <span
                              key={type}
                              className="flex items-center gap-1 text-[10px] text-text-secondary font-mono"
                            >
                              {CONTENT_TYPE_EMOJIS[type]}{' '}
                              <span className="text-text-primary font-semibold">{s.time}</span>
                              {s.autoDelete && (
                                <span className="text-warning ml-0.5">
                                  🗑 +{s.autoDeleteOffsetHours}h
                                </span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border/50 shrink-0 flex items-center gap-3">
          {step > 1 && (
            <Button
              variant="ghost"
              onClick={() => setStep((s) => (s - 1) as Step)}
              className="flex items-center gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" />
              Atrás
            </Button>
          )}
          <div className="flex-1" />

          {step === 1 && (
            <Button
              disabled={selectedDates.length === 0}
              onClick={() => setStep(2)}
              className="gap-1.5"
            >
              Siguiente
              <ChevronRight className="w-4 h-4" />
            </Button>
          )}

          {step === 2 && (
            <Button
              disabled={activeTypes.length === 0}
              onClick={() => setStep(3)}
              className="gap-1.5"
            >
              Ver resumen
              <ChevronRight className="w-4 h-4" />
            </Button>
          )}

          {step === 3 && (
            <Button
              onClick={handleConfirm}
              className="gap-1.5 bg-accent hover:bg-accent/90"
            >
              <Check className="w-4 h-4" />
              Confirmar y guardar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
