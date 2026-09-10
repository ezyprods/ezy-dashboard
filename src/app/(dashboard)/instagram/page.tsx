'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Camera,
  Plus,
  Trash2,
  Search,
  ChevronDown,
  Film,
  Image as ImageIcon,
  Clock,
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  X,
  MoreVertical,
  Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { format, isBefore, startOfDay, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { PackSchedulerModal } from '@/components/instagram/PackSchedulerModal';
import type { InstagramPack, InstagramContentType } from '@/types/instagram';
import { CONTENT_TYPE_LABELS, CONTENT_TYPE_EMOJIS } from '@/types/instagram';
import { useArtists } from '@/lib/hooks/useArtists';
import { customConfirm } from '@/lib/dialog';

// ─── LocalStorage persistence ─────────────────────────────────────────────────

const STORAGE_KEY = 'ezy_instagram_packs';

function loadPacks(): InstagramPack[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePacks(packs: InstagramPack[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(packs));
  } catch {}
}

// ─── Small helpers ────────────────────────────────────────────────────────────

const TYPES: InstagramContentType[] = ['story', 'feed', 'reel'];

const TYPE_ICONS: Record<InstagramContentType, React.FC<{ className?: string }>> = {
  story: Camera,
  feed: ImageIcon,
  reel: Film,
};

const TYPE_COLORS: Record<InstagramContentType, string> = {
  story: 'text-pink-400 bg-pink-500/10 border-pink-500/30',
  feed: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  reel: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
};

function addHoursToTime(time: string, hours: number): string {
  const [h, m] = time.split(':').map(Number);
  const totalMinutes = h * 60 + m + hours * 60;
  const newH = Math.floor(totalMinutes / 60) % 24;
  const newM = totalMinutes % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

// ─── Slot Badge ───────────────────────────────────────────────────────────────

function SlotBadge({
  type,
  pack,
}: {
  type: InstagramContentType;
  pack: InstagramPack;
}) {
  const slot = pack[type];
  const Icon = TYPE_ICONS[type];
  const colorClass = TYPE_COLORS[type];

  if (!slot) {
    return (
      <div className="flex flex-col items-center justify-center gap-0.5 py-2 opacity-20">
        <Icon className="w-4 h-4 text-text-secondary" />
        <span className="text-[9px] text-text-secondary font-medium">—</span>
      </div>
    );
  }

  return (
    <div className={cn('rounded-xl border px-2.5 py-2 text-center', colorClass)}>
      <Icon className="w-3.5 h-3.5 mx-auto mb-0.5" />
      <p className="text-[11px] font-mono font-bold leading-none">{slot.time}</p>
      {slot.autoDelete && (
        <p className="text-[9px] mt-1 text-warning font-mono opacity-80">
          🗑 {addHoursToTime(slot.time, slot.autoDeleteOffsetHours)}
        </p>
      )}
    </div>
  );
}

// ─── Pack Row ─────────────────────────────────────────────────────────────────

function PackRow({
  pack,
  onDelete,
  isPast,
}: {
  pack: InstagramPack;
  onDelete: (id: string) => void;
  isPast: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const dateObj = new Date(pack.date + 'T00:00:00');
  const isToday =
    format(dateObj, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');

  return (
    <div
      className={cn(
        'grid items-center gap-3 px-4 py-3 border-b border-border/40 last:border-0 transition-colors hover:bg-surface-elevated/40',
        isPast && 'opacity-50'
      )}
      style={{ gridTemplateColumns: '140px 1fr 1fr 1fr 40px' }}
    >
      {/* Date */}
      <div className="flex items-center gap-2.5">
        <div
          className={cn(
            'w-9 h-9 rounded-xl flex flex-col items-center justify-center shrink-0 border',
            isToday
              ? 'bg-accent text-white border-accent shadow-md shadow-accent/20'
              : 'bg-surface border-border/60 text-text-primary'
          )}
        >
          <span className="text-sm font-black leading-none">
            {format(dateObj, 'd')}
          </span>
          <span className="text-[9px] uppercase font-bold leading-none mt-0.5 opacity-70">
            {format(dateObj, 'MMM', { locale: es })}
          </span>
        </div>
        <div>
          <p
            className={cn(
              'text-xs font-semibold capitalize',
              isToday ? 'text-accent' : 'text-text-primary'
            )}
          >
            {isToday ? 'Hoy' : format(dateObj, 'EEEE', { locale: es })}
          </p>
          {pack.artistName && (
            <p className="text-[10px] text-text-secondary mt-0.5 truncate max-w-[90px]">
              🎤 {pack.artistName}
            </p>
          )}
        </div>
      </div>

      {/* Slots */}
      {TYPES.map((type) => (
        <SlotBadge key={type} type={type} pack={pack} />
      ))}

      {/* Actions */}
      <div className="relative flex justify-end">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface transition-colors cursor-pointer"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-30"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute right-0 top-8 z-40 w-36 bg-surface-elevated border border-border rounded-xl shadow-xl py-1 animate-menu-in">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete(pack.id);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-error hover:bg-error/10 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Eliminar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InstagramStudioPage() {
  const { activeArtists, isLoading: isLoadingArtists } = useArtists();
  const [packs, setPacks] = useState<InstagramPack[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedArtistId, setSelectedArtistId] = useState<string>('');
  const [artistDropdownOpen, setArtistDropdownOpen] = useState(false);
  const [artistSearch, setArtistSearch] = useState('');
  const [filterArtistId, setFilterArtistId] = useState<string>('');
  const [showPast, setShowPast] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    setPacks(loadPacks());
  }, []);

  const selectedArtist = activeArtists.find((a) => a.id === selectedArtistId);

  const filteredArtists = useMemo(() => {
    if (!artistSearch) return activeArtists;
    return activeArtists.filter((a) =>
      a.name.toLowerCase().includes(artistSearch.toLowerCase())
    );
  }, [activeArtists, artistSearch]);

  const handleSavePacks = useCallback(
    (newPacks: InstagramPack[]) => {
      setPacks((prev) => {
        const updated = [...prev, ...newPacks];
        savePacks(updated);
        return updated;
      });
    },
    []
  );

  const handleDelete = useCallback(async (id: string) => {
    if (!(await customConfirm('¿Eliminar este pack de contenido?'))) return;
    setPacks((prev) => {
      const updated = prev.filter((p) => p.id !== id);
      savePacks(updated);
      return updated;
    });
  }, []);

  const today = startOfDay(new Date());

  const displayPacks = useMemo(() => {
    let result = packs;
    if (filterArtistId) {
      result = result.filter((p) => p.artistId === filterArtistId);
    }
    if (!showPast) {
      result = result.filter(
        (p) => !isBefore(new Date(p.date + 'T00:00:00'), today)
      );
    }
    return result.sort((a, b) => a.date.localeCompare(b.date));
  }, [packs, filterArtistId, showPast, today]);

  // Stats
  const upcoming = packs.filter(
    (p) => !isBefore(new Date(p.date + 'T00:00:00'), today)
  );
  const totalPublications = upcoming.reduce((acc, p) => {
    return acc + TYPES.filter((t) => !!p[t]).length;
  }, 0);
  const autoDeleteCount = upcoming.reduce((acc, p) => {
    return acc + TYPES.filter((t) => p[t]?.autoDelete).length;
  }, 0);

  return (
    <div className="space-y-6 animate-fade-in pb-20 max-w-[1400px] mx-auto">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-text-primary flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pink-500/30 via-purple-500/20 to-orange-500/20 border border-pink-500/30 flex items-center justify-center">
              <Camera className="w-5 h-5 text-pink-400" />
            </div>
            Instagram Studio
          </h1>
          <p className="text-text-secondary mt-1">
            Planifica campañas de contenido con packs de historia, feed y reel.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Artist filter (small) */}
          {filterArtistId && (
            <button
              onClick={() => setFilterArtistId('')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent/10 border border-accent/20 rounded-full text-xs text-accent font-medium hover:bg-error/10 hover:text-error hover:border-error/20 transition-colors cursor-pointer"
            >
              🎤 {activeArtists.find((a) => a.id === filterArtistId)?.name}
              <X className="w-3 h-3" />
            </button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPast((v) => !v)}
            className={cn(
              'gap-1.5 text-xs',
              showPast && 'bg-surface-elevated border-accent/30 text-accent'
            )}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            {showPast ? 'Ocultar pasados' : 'Ver pasados'}
          </Button>

          <Button
            onClick={() => setShowModal(true)}
            className="gap-2 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 shadow-lg shadow-pink-500/20"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nuevo Pack</span>
            <span className="sm:hidden">Pack</span>
          </Button>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: 'Packs programados',
            value: upcoming.length,
            icon: '📅',
            color: 'text-accent',
          },
          {
            label: 'Publicaciones totales',
            value: totalPublications,
            icon: '📊',
            color: 'text-blue-400',
          },
          {
            label: 'Con autoeliminar',
            value: autoDeleteCount,
            icon: '🗑',
            color: 'text-warning',
          },
          {
            label: 'Artistas activos',
            value: new Set(upcoming.filter((p) => p.artistId).map((p) => p.artistId)).size,
            icon: '🎤',
            color: 'text-pink-400',
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="glass rounded-2xl border border-border p-4 flex items-center gap-3"
          >
            <span className="text-2xl shrink-0">{stat.icon}</span>
            <div>
              <p className={cn('text-2xl font-black leading-none', stat.color)}>
                {stat.value}
              </p>
              <p className="text-xs text-text-secondary mt-0.5">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Artist filter bar ── */}
      {activeArtists.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setFilterArtistId('')}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer',
              !filterArtistId
                ? 'bg-accent text-white border-accent'
                : 'bg-surface-elevated border-border text-text-secondary hover:text-text-primary'
            )}
          >
            Todos
          </button>
          {activeArtists.slice(0, 8).map((a) => (
            <button
              key={a.id}
              onClick={() =>
                setFilterArtistId((prev) => (prev === a.id ? '' : a.id))
              }
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer',
                filterArtistId === a.id
                  ? 'bg-accent text-white border-accent'
                  : 'bg-surface-elevated border-border text-text-secondary hover:text-text-primary'
              )}
            >
              {a.name}
            </button>
          ))}
        </div>
      )}

      {/* ── Main board ── */}
      <div className="glass rounded-2xl border border-border overflow-hidden shadow-xl">
        {/* Column headers */}
        <div
          className="grid items-center gap-3 px-4 py-3 bg-surface-elevated/60 border-b border-border text-xs font-bold text-text-secondary uppercase tracking-wider"
          style={{ gridTemplateColumns: '140px 1fr 1fr 1fr 40px' }}
        >
          <span>Fecha</span>
          <span className="flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5 text-pink-400" />
            Historia
          </span>
          <span className="flex items-center gap-1.5">
            <ImageIcon className="w-3.5 h-3.5 text-blue-400" />
            Feed Post
          </span>
          <span className="flex items-center gap-1.5">
            <Film className="w-3.5 h-3.5 text-purple-400" />
            Reel
          </span>
          <span />
        </div>

        {/* Rows */}
        {displayPacks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-pink-500/20 to-purple-500/20 border border-pink-500/20 flex items-center justify-center mb-4">
              <Camera className="w-8 h-8 text-pink-400/60" />
            </div>
            <p className="font-bold text-text-primary text-lg">
              {showPast || packs.length === 0
                ? 'Sin packs programados'
                : 'Sin packs próximos'}
            </p>
            <p className="text-text-secondary text-sm mt-1 max-w-xs">
              {packs.length === 0
                ? 'Crea tu primer pack para empezar a planificar tu contenido de Instagram.'
                : showPast
                ? 'No hay packs que coincidan con el filtro activo.'
                : 'Todos los packs son pasados. Activa "Ver pasados" para verlos.'}
            </p>
            {packs.length === 0 && (
              <Button
                className="mt-6 gap-2 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500"
                onClick={() => setShowModal(true)}
              >
                <Plus className="w-4 h-4" />
                Crear primer pack
              </Button>
            )}
          </div>
        ) : (
          displayPacks.map((pack) => (
            <PackRow
              key={pack.id}
              pack={pack}
              onDelete={handleDelete}
              isPast={isBefore(new Date(pack.date + 'T00:00:00'), today)}
            />
          ))
        )}
      </div>

      {/* ── Pack Scheduler Modal ── */}
      <PackSchedulerModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSave={handleSavePacks}
        artistId={selectedArtistId || undefined}
        artistName={selectedArtist?.name}
      />
    </div>
  );
}
