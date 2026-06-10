'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Circle, Clock, Eye, CheckCircle2 } from 'lucide-react';
import type { FlexTaskStatus } from '@/types';

const STATUS_OPTIONS: {
  value: FlexTaskStatus;
  label: string;
  icon: typeof Circle;
  color: string;
}[] = [
  { value: 'todo', label: 'Pendiente', icon: Circle, color: 'text-text-secondary' },
  { value: 'in_progress', label: 'En progreso', icon: Clock, color: 'text-accent' },
  { value: 'review', label: 'Revisión', icon: Eye, color: 'text-warning' },
  { value: 'done', label: 'Hecho', icon: CheckCircle2, color: 'text-success' },
];

interface StatusPickerProps {
  value: FlexTaskStatus;
  onChange: (status: FlexTaskStatus) => void;
}

export function StatusPicker({ value, onChange }: StatusPickerProps) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  const current = STATUS_OPTIONS.find((o) => o.value === value) ?? STATUS_OPTIONS[0];
  const CurrentIcon = current.icon;

  const openMenu = () => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 4, left: rect.left });
    setOpen(true);
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const menu =
    open &&
    createPortal(
      <>
        {/* Invisible overlay so clicks outside close the menu */}
        <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
        <div
          className="fixed z-[70] min-w-[160px] bg-surface border border-border rounded-xl shadow-2xl py-1 overflow-hidden"
          // Prevent the overlay click from firing when clicking inside the menu
          onClick={(e) => e.stopPropagation()}
          style={{
            top: menuPos.top,
            left: menuPos.left,
            animation: 'statusPickerIn 120ms ease-out forwards',
          }}
        >
          {STATUS_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isActive = opt.value === value;
            return (
              <button
                key={opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-surface-elevated ${
                  isActive ? 'text-accent font-medium' : 'text-text-primary'
                }`}
              >
                <Icon className={`w-4 h-4 ${opt.color}`} />
                {opt.label}
              </button>
            );
          })}
        </div>
        <style>{`
          @keyframes statusPickerIn {
            from { opacity: 0; transform: scale(0.95) translateY(-4px); }
            to   { opacity: 1; transform: scale(1)   translateY(0); }
          }
        `}</style>
      </>,
      document.body
    );

  return (
    <>
      <button
        ref={btnRef}
        onClick={openMenu}
        className={`shrink-0 transition-colors hover:scale-110 ${current.color}`}
        title={current.label}
        type="button"
      >
        <CurrentIcon className="w-4 h-4" />
      </button>
      {menu}
    </>
  );
}
