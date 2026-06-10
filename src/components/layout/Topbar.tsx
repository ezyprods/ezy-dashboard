'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, Menu, Timer, CalendarDays, Plus, Play, Square, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CommandMenu } from '@/components/layout/CommandMenu';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { useRouter } from 'next/navigation';

// ─── Global Timer Popover ───────────────────────────────────────────────────

const TIMER_KEY = 'ezy_global_timer_start';

function formatHMS(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

function GlobalTimerPopover({ onClose }: { onClose: () => void }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [label, setLabel] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Restore persisted timer state on mount
  useEffect(() => {
    const stored = localStorage.getItem(TIMER_KEY);
    if (stored) {
      const startTs = Number(stored);
      if (!isNaN(startTs)) {
        const elapsed = Math.floor((Date.now() - startTs) / 1000);
        setElapsedSeconds(elapsed);
        setIsRunning(true);
      }
    }
  }, []);

  // Tick
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        const stored = localStorage.getItem(TIMER_KEY);
        if (stored) {
          setElapsedSeconds(Math.floor((Date.now() - Number(stored)) / 1000));
        }
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]);

  const handleStart = () => {
    const startTs = Date.now() - elapsedSeconds * 1000;
    localStorage.setItem(TIMER_KEY, String(startTs));
    setIsRunning(true);
  };

  const handleStop = () => {
    setIsRunning(false);
    localStorage.removeItem(TIMER_KEY);
  };

  const handleReset = () => {
    setIsRunning(false);
    setElapsedSeconds(0);
    setLabel('');
    localStorage.removeItem(TIMER_KEY);
  };

  return (
    <div className="absolute right-0 mt-2 w-72 glass rounded-xl shadow-xl border border-border z-50 p-4 animate-slide-in">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-bold text-sm text-text-primary flex items-center gap-2">
          <Timer className="w-4 h-4 text-accent" />
          Cronómetro Global
        </h4>
        <button onClick={onClose} className="text-text-secondary hover:text-text-primary">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Display */}
      <div className="text-center py-4">
        <span
          className={`text-4xl font-mono font-bold tracking-wider ${
            isRunning ? 'text-accent' : 'text-text-primary'
          }`}
        >
          {formatHMS(elapsedSeconds)}
        </span>
        {isRunning && (
          <div className="flex items-center justify-center gap-1.5 mt-2">
            <span className="w-1.5 h-1.5 bg-error rounded-full animate-pulse" />
            <span className="text-[10px] text-error uppercase tracking-wider font-bold">En marcha</span>
          </div>
        )}
      </div>

      {/* Label input (shown when stopped and has time) */}
      {!isRunning && elapsedSeconds > 0 && (
        <input
          type="text"
          placeholder="Etiqueta de sesión (opcional)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="w-full mb-3 px-3 py-2 text-sm rounded-lg bg-surface border border-border focus:outline-none focus:border-accent text-text-primary placeholder:text-text-secondary"
        />
      )}

      {/* Controls */}
      <div className="flex gap-2">
        {isRunning ? (
          <button
            onClick={handleStop}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-error/10 text-error hover:bg-error/20 text-sm font-medium transition-colors"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            Parar
          </button>
        ) : (
          <button
            onClick={handleStart}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-accent text-white hover:bg-accent/90 text-sm font-medium transition-colors"
          >
            <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
            Iniciar
          </button>
        )}
        {elapsedSeconds > 0 && (
          <button
            onClick={handleReset}
            className="px-3 py-2 rounded-lg bg-surface-elevated text-text-secondary hover:text-text-primary text-sm font-medium transition-colors"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Plus Quick Actions Popover ──────────────────────────────────────────────

function QuickActionsPopover({ onClose }: { onClose: () => void }) {
  const router = useRouter();

  const actions = [
    {
      label: 'Nuevo Artista',
      icon: '🎤',
      onClick: () => { router.push('/artists'); onClose(); },
    },
    {
      label: 'Subir archivo',
      icon: '📁',
      onClick: () => { router.push('/artists'); onClose(); },
    },
  ];

  return (
    <div className="absolute right-0 mt-2 w-52 glass rounded-xl shadow-xl border border-border z-50 p-2 animate-slide-in">
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={action.onClick}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-elevated text-sm text-text-primary transition-colors text-left"
        >
          <span>{action.icon}</span>
          {action.label}
        </button>
      ))}
    </div>
  );
}

// ─── Topbar ──────────────────────────────────────────────────────────────────

type ActivePopover = 'timer' | 'bell' | 'plus' | null;

export function Topbar() {
  const router = useRouter();
  const [activePopover, setActivePopover] = useState<ActivePopover>(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const topbarRef = useRef<HTMLElement>(null);

  // Check timer running state for indicator dot
  useEffect(() => {
    const check = () => {
      const stored = localStorage.getItem(TIMER_KEY);
      setTimerRunning(!!stored);
    };
    check();
    const id = setInterval(check, 2000);
    return () => clearInterval(id);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!activePopover) return;
    const handler = (e: MouseEvent) => {
      if (topbarRef.current && !topbarRef.current.contains(e.target as Node)) {
        setActivePopover(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [activePopover]);

  const toggle = useCallback((key: ActivePopover) => {
    setActivePopover((prev) => (prev === key ? null : key));
  }, []);

  return (
    <header
      ref={topbarRef}
      className="h-16 border-b border-border bg-surface/80 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between px-6"
    >
      <div className="flex items-center flex-1">
        {/* Mobile menu button */}
        <Button variant="ghost" size="icon" className="md:hidden mr-2">
          <Menu className="w-5 h-5" />
        </Button>

        {/* Global Search */}
        <CommandMenu />
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />

        {/* ── Timer ── */}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="relative cursor-pointer"
            onClick={() => toggle('timer')}
            aria-label="Cronómetro"
          >
            <Timer className="w-5 h-5" />
            {timerRunning && (
              <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full border border-surface animate-pulse" />
            )}
          </Button>
          {activePopover === 'timer' && (
            <GlobalTimerPopover onClose={() => setActivePopover(null)} />
          )}
        </div>

        {/* ── Calendar ── */}
        <Button
          variant="ghost"
          size="icon"
          className="cursor-pointer"
          onClick={() => router.push('/calendar')}
          aria-label="Calendario"
        >
          <CalendarDays className="w-5 h-5" />
        </Button>

        {/* ── Plus (Quick Actions) ── */}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="cursor-pointer"
            onClick={() => toggle('plus')}
            aria-label="Acciones rápidas"
          >
            <Plus className="w-5 h-5" />
          </Button>
          {activePopover === 'plus' && (
            <QuickActionsPopover onClose={() => setActivePopover(null)} />
          )}
        </div>

        {/* ── Bell (Notifications) ── */}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="relative cursor-pointer"
            onClick={() => toggle('bell')}
            aria-label="Notificaciones"
          >
            <Bell className="w-5 h-5" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full border border-surface" />
          </Button>
          {activePopover === 'bell' && (
            <div className="absolute right-0 mt-2 w-64 glass rounded-xl shadow-xl border border-border z-50 p-4 animate-slide-in">
              <h4 className="font-bold text-sm mb-2 text-text-primary">Notificaciones</h4>
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <Bell className="w-8 h-8 text-text-secondary opacity-50 mb-2" />
                <p className="text-xs text-text-secondary">No tienes notificaciones nuevas.</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Profile ── */}
        <div className="relative flex items-center gap-3 border-l border-border pl-4 ml-2 group cursor-pointer">
          <div className="w-9 h-9 rounded-full bg-surface-elevated border border-border flex items-center justify-center overflow-hidden">
            <span className="text-sm font-medium">P</span>
          </div>
          <div className="hidden md:block">
            <p className="text-sm font-medium text-text-primary">Productor</p>
            <p className="text-xs text-text-secondary">Admin</p>
          </div>

          {/* Profile Dropdown - hover-based */}
          <div className="absolute right-0 top-full mt-2 w-48 glass rounded-xl shadow-xl border border-border opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 p-2">
            <button
              onClick={async () => {
                const { authClient } = await import('@/lib/auth-client');
                await authClient.signOut();
                window.location.reload();
              }}
              className="w-full text-left px-4 py-2 text-sm text-error hover:bg-error/10 rounded-lg transition-colors flex items-center gap-2"
            >
              Cerrar Sesión
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
