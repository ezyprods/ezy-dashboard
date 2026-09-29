'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Minus, Plus, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEqualizer } from '@/lib/hooks/useEqualizer';
import {
  EQ_BANDS, EQ_BAND_COUNT, EQ_MAX_DB, EQ_MIN_DB, EQ_PRESETS,
  eqCurveDb, setBandGain, updateEq,
} from '@/lib/audio/equalizer';

// Graph geometry (SVG user units)
const W = 600;
const H = 330;
const PAD_X = 34;
const PAD_TOP = 22;
const PAD_BOTTOM = 18;
const plotH = H - PAD_TOP - PAD_BOTTOM;

const xOf = (i: number) => PAD_X + (i * (W - 2 * PAD_X)) / (EQ_BAND_COUNT - 1);
const yOf = (db: number) => PAD_TOP + ((EQ_MAX_DB - db) / (EQ_MAX_DB - EQ_MIN_DB)) * plotH;
const dbOfY = (y: number) => EQ_MAX_DB - ((y - PAD_TOP) / plotH) * (EQ_MAX_DB - EQ_MIN_DB);

const fmtDb = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`;

/**
 * X position of an arbitrary frequency on the evenly-spaced band axis
 * (piecewise log interpolation between neighbouring band centres).
 */
function xOfFreq(freq: number): number {
  for (let i = 0; i < EQ_BAND_COUNT - 1; i++) {
    const a = EQ_BANDS[i].freq, b = EQ_BANDS[i + 1].freq;
    if (freq <= b) {
      const t = Math.log(freq / a) / Math.log(b / a);
      return xOf(i) + t * (xOf(i + 1) - xOf(i));
    }
  }
  return xOf(EQ_BAND_COUNT - 1);
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative w-[52px] h-[30px] rounded-full transition-colors shrink-0',
        checked ? 'bg-accent' : 'bg-border'
      )}
    >
      <span
        className={cn(
          'absolute top-[3px] left-[3px] w-6 h-6 rounded-full bg-white shadow-md transition-transform',
          checked && 'translate-x-[22px]'
        )}
      />
    </button>
  );
}

function EqGraph({ gains, enabled, selected, onSelect }: {
  gains: number[];
  enabled: boolean;
  selected: number;
  onSelect: (i: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  // Relative drag: a stray tap selects a band but never changes it
  const dragStart = useRef<{ y: number; db: number } | null>(null);
  const gradId = useId().replace(/:/g, '');

  const toSvg = (clientX: number, clientY: number) => {
    const svg = svgRef.current!;
    const r = svg.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * W, y: ((clientY - r.top) / r.height) * H };
  };

  const nearestBand = (x: number) => {
    let best = 0;
    for (let i = 1; i < EQ_BAND_COUNT; i++) if (Math.abs(xOf(i) - x) < Math.abs(xOf(best) - x)) best = i;
    return best;
  };

  const points = gains.map((g, i) => `${xOf(i)},${yOf(g)}`).join(' ');
  const area = `${xOf(0)},${yOf(EQ_MIN_DB)} ${points} ${xOf(EQ_BAND_COUNT - 1)},${yOf(EQ_MIN_DB)}`;

  // What the filters really do between the points
  const response = useMemo(() => {
    const out: string[] = [];
    const f0 = EQ_BANDS[0].freq, f1 = EQ_BANDS[EQ_BAND_COUNT - 1].freq;
    const steps = 120;
    for (let s = 0; s <= steps; s++) {
      const f = f0 * Math.pow(f1 / f0, s / steps);
      const db = Math.max(EQ_MIN_DB - 4, Math.min(EQ_MAX_DB + 4, eqCurveDb(gains, f)));
      out.push(`${xOfFreq(f).toFixed(1)},${yOf(db).toFixed(1)}`);
    }
    return out.join(' ');
  }, [gains]);

  return (
    <div className={cn('select-none transition-opacity', !enabled && 'opacity-45')}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto touch-none cursor-pointer overflow-visible"
        onPointerDown={(e) => {
          const { x, y } = toSvg(e.clientX, e.clientY);
          const i = nearestBand(x);
          e.currentTarget.setPointerCapture(e.pointerId);
          dragStart.current = { y, db: gains[i] };
          setDragging(i);
          onSelect(i);
        }}
        onPointerMove={(e) => {
          if (dragging === null || !dragStart.current) return;
          const { y, db } = dragStart.current;
          setBandGain(dragging, db + dbOfY(toSvg(e.clientX, e.clientY).y) - dbOfY(y));
        }}
        onPointerUp={() => { setDragging(null); dragStart.current = null; }}
        onPointerCancel={() => { setDragging(null); dragStart.current = null; }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Grid: band columns + ±12 / 0 dB rows */}
        {EQ_BANDS.map((_, i) => (
          <line key={i} x1={xOf(i)} x2={xOf(i)} y1={PAD_TOP} y2={H - PAD_BOTTOM} stroke="currentColor" className="text-border" strokeOpacity={0.5} />
        ))}
        {[EQ_MAX_DB, 6, 0, -6, EQ_MIN_DB].map(db => (
          <line
            key={db}
            x1={PAD_X} x2={W - PAD_X} y1={yOf(db)} y2={yOf(db)}
            stroke="currentColor"
            className="text-border"
            strokeOpacity={db === 0 ? 0.9 : 0.35}
            strokeDasharray={db === 0 ? undefined : '3 5'}
          />
        ))}
        <text x={4} y={yOf(EQ_MAX_DB) + 4} className="fill-text-secondary" fontSize="11">+12</text>
        <text x={10} y={yOf(0) + 4} className="fill-text-secondary" fontSize="11">0</text>
        <text x={6} y={yOf(EQ_MIN_DB) + 4} className="fill-text-secondary" fontSize="11">-12</text>

        {/* Spotify-style filled polyline */}
        <polygon points={area} fill={`url(#${gradId})`} />
        <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth={6} strokeLinejoin="round" strokeLinecap="round" />

        {/* Actual summed filter response */}
        <polyline points={response} fill="none" stroke="currentColor" className="text-text-primary" strokeOpacity={0.55} strokeWidth={1.5} strokeDasharray="4 4" />

        {gains.map((g, i) => (
          <g key={i}>
            {(dragging === i || selected === i) && (
              <circle cx={xOf(i)} cy={yOf(g)} r={dragging === i ? 22 : 18} fill="var(--accent)" fillOpacity={0.22} />
            )}
            <circle cx={xOf(i)} cy={yOf(g)} r={dragging === i ? 14 : 12} fill="#fff" stroke="rgba(0,0,0,0.25)" strokeWidth={1} />
            {dragging === i && (
              <text x={xOf(i)} y={Math.max(12, yOf(g) - 24)} textAnchor="middle" fontSize="15" fontWeight={700} className="fill-text-primary">
                {fmtDb(g)} dB
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

export function EqualizerPanel({ onClose }: { onClose: () => void }) {
  const eq = useEqualizer();
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const activePreset = EQ_PRESETS.find(p => p.gains.every((g, i) => Math.abs(g - eq.gains[i]) < 0.05));
  const nudge = (delta: number) => setBandGain(selected, eq.gains[selected] + delta);

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end md:items-center justify-center" role="dialog" aria-modal="true" aria-label="Ecualizador">
      <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={onClose} />
      <div className="relative w-full md:max-w-xl bg-surface-elevated border border-border rounded-t-[28px] md:rounded-3xl shadow-2xl animate-slide-up max-h-[calc(100dvh-env(safe-area-inset-top,0px)-0.5rem)] overflow-y-auto overscroll-contain pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] px-safe">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-surface-elevated/95 backdrop-blur flex items-center justify-between px-4 pt-3 pb-2">
          <button onClick={onClose} aria-label="Cerrar ecualizador" className="w-11 h-11 rounded-full flex items-center justify-center text-text-secondary hover:text-text-primary active:bg-surface">
            <X className="w-5 h-5" />
          </button>
          <h2 className="text-base font-bold text-text-primary">Ecualizador</h2>
          <button
            onClick={() => updateEq({ gains: [0, 0, 0, 0, 0, 0], preamp: 0 })}
            aria-label="Poner plano"
            title="Poner plano"
            className="w-11 h-11 rounded-full flex items-center justify-center text-text-secondary hover:text-text-primary active:bg-surface"
          >
            <RotateCcw className="w-4.5 h-4.5" />
          </button>
        </div>

        <div className="px-5">
          {/* On / off */}
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-[15px] font-semibold text-text-primary">Ecualizador</p>
              <p className="text-xs text-text-secondary">Se guarda en este dispositivo</p>
            </div>
            <Toggle checked={eq.enabled} onChange={(v) => updateEq({ enabled: v })} label="Activar ecualizador" />
          </div>

          {/* Presets */}
          <div className="-mx-5 px-5 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden py-2">
            {EQ_PRESETS.map(p => (
              <button
                key={p.id}
                onClick={() => updateEq({ gains: [...p.gains] })}
                className={cn(
                  'shrink-0 px-3.5 h-9 rounded-full text-[13px] font-semibold border transition-colors',
                  activePreset?.id === p.id
                    ? 'bg-accent text-white border-accent'
                    : 'bg-surface border-border text-text-secondary hover:text-text-primary'
                )}
              >
                {p.name}
              </button>
            ))}
            {!activePreset && (
              <span className="shrink-0 px-3.5 h-9 rounded-full text-[13px] font-semibold border border-accent/50 text-accent flex items-center">
                Personalizado
              </span>
            )}
          </div>

          {/* Graph */}
          <div className="mt-3">
            <EqGraph gains={eq.gains} enabled={eq.enabled} selected={selected} onSelect={setSelected} />
            <div className="relative h-11 mt-1">
              {EQ_BANDS.map((b, i) => (
                <button
                  key={b.freq}
                  onClick={() => setSelected(i)}
                  className={cn(
                    'absolute -translate-x-1/2 flex flex-col items-center px-1 rounded-md',
                    selected === i ? 'text-text-primary' : 'text-text-secondary'
                  )}
                  style={{ left: `${(xOf(i) / W) * 100}%` }}
                >
                  <span className="text-[11px] font-medium tracking-wide">{b.label}</span>
                  <span className={cn('text-[11px] font-mono tabular-nums', selected === i && 'text-accent font-bold')}>{fmtDb(eq.gains[i])}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Fine tune for the selected band */}
          <div className="mt-3 flex items-center gap-3 rounded-2xl bg-surface border border-border/60 p-2">
            <button onClick={() => nudge(-0.5)} aria-label="Bajar 0,5 dB" className="w-11 h-11 rounded-xl flex items-center justify-center bg-surface-elevated border border-border/60 text-text-primary active:scale-95">
              <Minus className="w-4 h-4" />
            </button>
            <div className="flex-1 text-center">
              <p className="text-[11px] text-text-secondary uppercase tracking-wider">{EQ_BANDS[selected].label}</p>
              <p className="text-lg font-bold font-mono tabular-nums text-text-primary">{fmtDb(eq.gains[selected])} dB</p>
            </div>
            <button onClick={() => nudge(0.5)} aria-label="Subir 0,5 dB" className="w-11 h-11 rounded-xl flex items-center justify-center bg-surface-elevated border border-border/60 text-text-primary active:scale-95">
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Advanced */}
          <div className="mt-5 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="eq-preamp" className="text-sm font-medium text-text-primary">Pre-ganancia</label>
                <span className="text-xs font-mono tabular-nums text-text-secondary">{fmtDb(eq.preamp)} dB</span>
              </div>
              <input
                id="eq-preamp"
                type="range"
                min={-12}
                max={0}
                step={0.5}
                value={eq.preamp}
                onChange={(e) => updateEq({ preamp: Number(e.target.value) })}
                className="w-full accent-accent"
              />
              <p className="text-[11px] text-text-secondary mt-1">Bájala si notas distorsión con refuerzos fuertes.</p>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-text-primary">Limitador anti-saturación</p>
                <p className="text-[11px] text-text-secondary">Evita que los picos distorsionen al subir bandas.</p>
              </div>
              <Toggle checked={eq.limiter} onChange={(v) => updateEq({ limiter: v })} label="Limitador anti-saturación" />
            </div>

            <p className="text-[11px] text-text-secondary/80 leading-relaxed flex gap-2">
              <SlidersHorizontal className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              Mismas 6 bandas y rango (±12 dB) que Spotify. Arrastra los puntos o usa −/+ para afinar; la línea discontinua muestra la respuesta real del filtro.
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Small EQ button: opens the panel, shows whether the EQ is active. */
export function EqualizerButton({ className, variant = 'icon' }: { className?: string; variant?: 'icon' | 'tile' }) {
  const eq = useEqualizer();
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === 'tile' ? (
        <button onClick={() => setOpen(true)} className={className} aria-label="Ecualizador">
          <span className="relative">
            <SlidersHorizontal className={cn('w-5 h-5', eq.enabled ? 'text-accent' : '')} />
            {eq.enabled && <span className="absolute -top-1 -right-1.5 w-2 h-2 rounded-full bg-accent" />}
          </span>
          EQ {eq.enabled ? 'ON' : 'OFF'}
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className={cn('relative transition-colors', eq.enabled ? 'text-accent' : 'text-text-secondary hover:text-text-primary', className)}
          title={eq.enabled ? 'Ecualizador activado' : 'Ecualizador'}
          aria-label="Ecualizador"
        >
          <SlidersHorizontal className="w-4 h-4" />
          {eq.enabled && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-accent" />}
        </button>
      )}
      {open && <EqualizerPanel onClose={() => setOpen(false)} />}
    </>
  );
}
