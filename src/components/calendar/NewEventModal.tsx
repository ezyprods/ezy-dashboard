'use client';

import { useState, useEffect } from 'react';
import { CalendarPlus, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: string;
  end: string;
  htmlLink: string;
}

interface NewEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  initialDate?: string; // YYYY-MM-DD
  editEvent?: CalendarEvent | null;
}

type ToastState = { type: 'success' | 'error'; message: string } | null;

export function NewEventModal({ isOpen, onClose, onCreated, initialDate, editEvent }: NewEventModalProps) {
  const today = new Date().toISOString().split('T')[0];

  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:00');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  useEffect(() => {
    if (isOpen) {
      if (editEvent) {
        setSummary(editEvent.summary || '');
        setDescription(editEvent.description || '');
        
        // Parse start and end times
        try {
          const startDateObj = new Date(editEvent.start);
          const endDateObj = new Date(editEvent.end);
          
          // Format to YYYY-MM-DD locally
          const yyyy = startDateObj.getFullYear();
          const mm = String(startDateObj.getMonth() + 1).padStart(2, '0');
          const dd = String(startDateObj.getDate()).padStart(2, '0');
          setDate(`${yyyy}-${mm}-${dd}`);
          
          const startH = String(startDateObj.getHours()).padStart(2, '0');
          const startM = String(startDateObj.getMinutes()).padStart(2, '0');
          setStartTime(`${startH}:${startM}`);
          
          const endH = String(endDateObj.getHours()).padStart(2, '0');
          const endM = String(endDateObj.getMinutes()).padStart(2, '0');
          setEndTime(`${endH}:${endM}`);
        } catch (e) {
          setDate(today);
          setStartTime('10:00');
          setEndTime('11:00');
        }
      } else {
        setSummary('');
        setDescription('');
        setDate(initialDate || today);
        setStartTime('10:00');
        setEndTime('11:00');
      }
    }
  }, [isOpen, editEvent, initialDate, today]);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!summary.trim() || !date || !startTime || !endTime) return;

    const startDateTime = `${date}T${startTime}:00`;
    const endDateTime = `${date}T${endTime}:00`;

    if (endDateTime <= startDateTime) {
      showToast('error', 'La hora de fin debe ser posterior a la de inicio.');
      return;
    }

    setIsSubmitting(true);
    try {
      const url = editEvent ? `/api/calendar/${editEvent.id}` : '/api/calendar';
      const method = editEvent ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          summary: summary.trim(), 
          description: description.trim() || undefined, 
          startDateTime, 
          endDateTime 
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        showToast('error', data.error || `Error al ${editEvent ? 'editar' : 'crear'} el evento.`);
      } else {
        showToast('success', `"${summary}" ${editEvent ? 'editado' : 'creado'} correctamente.`);
        onCreated();
        setTimeout(() => onClose(), 1200);
      }
    } catch (err: any) {
      showToast('error', err.message || 'Error de red.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputCls =
    'w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/50 outline-none focus:border-accent transition-colors';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editEvent ? "Editar Evento" : "Nuevo Evento"}
      description={editEvent ? "Edita los detalles de tu evento de Google Calendar." : "Crea un evento directamente en tu Google Calendar."}
    >
      {/* Inline toast */}
      {toast && (
        <div
          className={`flex items-center gap-2 mb-4 px-3 py-2 rounded-lg text-sm border ${
            toast.type === 'success'
              ? 'bg-success/10 border-success/30 text-success'
              : 'bg-error/10 border-error/30 text-error'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Title */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            Título <span className="text-error">*</span>
          </label>
          <input
            type="text"
            required
            placeholder="Ej. Sesión de mezcla con Artista"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className={inputCls}
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            Descripción <span className="text-text-secondary/50">(opcional)</span>
          </label>
          <textarea
            rows={2}
            placeholder="Notas adicionales..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`${inputCls} resize-none`}
          />
        </div>

        {/* Date */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            Fecha <span className="text-error">*</span>
          </label>
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputCls}
          />
        </div>

        {/* Time row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Inicio <span className="text-error">*</span>
            </label>
            <input
              type="time"
              required
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Fin <span className="text-error">*</span>
            </label>
            <input
              type="time"
              required
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            className="flex-1 gap-2"
            disabled={isSubmitting || !summary.trim()}
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : editEvent ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <CalendarPlus className="w-4 h-4" />
            )}
            {editEvent ? 'Guardar Cambios' : 'Crear Evento'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
