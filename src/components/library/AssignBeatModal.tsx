'use client';

import React, { useMemo, useState } from 'react';
import { ArrowRight, Check, Loader2, Search, UserCheck } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { ArtistAvatar } from '@/components/ui/ArtistAvatar';
import { useArtists } from '@/lib/hooks/useArtists';
import { cn, sortArtistsByRecent } from '@/lib/utils';
import { KindIcon, normalizeForSearch } from '@/components/explorer/fileKinds';
import { useExplorer } from '@/components/explorer/useExplorerController';
import type { DriveItem } from '@/components/explorer/types';
import type { Artist } from '@/types';

function ArtistRow({ artist, selected, hint, onClick }: { artist: Artist; selected: boolean; hint?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('w-full flex items-center gap-3 px-3 min-h-[52px] rounded-xl text-left transition-colors border', selected ? 'bg-accent/10 border-accent/50' : 'border-transparent hover:bg-surface')}
      aria-pressed={selected}
    >
      <ArtistAvatar name={artist.name} photoUrl={artist.photoUrl} size="sm" className="w-9 h-9" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">{artist.name}</p>
        {hint && <p className="text-[11px] text-text-secondary truncate">{hint}</p>}
      </div>
      {selected && <Check className="w-4 h-4 text-accent shrink-0" />}
    </button>
  );
}

/**
 * Hands beats to one artist: they are moved (not copied) into `<artist>/Beats`, so they disappear
 * from the library and from every other artist's portal at once. Undo is available from the toast.
 */
export function AssignBeatModal({ items, onClose }: { items: DriveItem[]; onClose: () => void }) {
  const ex = useExplorer();
  const { artists } = useArtists();
  const [artistId, setArtistId] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  // Artists who received these beats come first: they are the usual candidates
  const receivers = useMemo(() => {
    const ids = new Set<string>();
    items.forEach(i => ex.sentInfo(i)?.artistIds.forEach(a => ids.add(a)));
    return sortArtistsByRecent(artists.filter(a => ids.has(a.id)));
  }, [items, ex, artists]);

  const q = normalizeForSearch(query.trim());
  const others = useMemo(
    () => sortArtistsByRecent(artists).filter(a => !receivers.includes(a) && (q ? normalizeForSearch(a.name).includes(q) : a.status !== 'archived')),
    [artists, receivers, q],
  );
  const visibleReceivers = q ? receivers.filter(a => normalizeForSearch(a.name).includes(q)) : receivers;
  const artist = artists.find(a => a.id === artistId);

  const confirm = async () => {
    if (!artist || busy) return;
    setBusy(true);
    const ok = await ex.assignTo(items, artist);
    setBusy(false);
    if (ok) onClose();
  };

  const single = items.length === 1 ? items[0] : null;

  return (
    <Modal isOpen onClose={onClose} title={single ? 'Asignar beat' : `Asignar ${items.length} elementos`} description="Se mueve a la carpeta Beats del artista y deja de estar disponible para los demás." className="md:max-w-xl">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {items.slice(0, 8).map(item => (
            <span key={item.id} className="h-8 pl-2 pr-2.5 rounded-lg bg-surface border border-border/60 text-xs text-text-primary inline-flex items-center gap-1.5 max-w-[260px]">
              <KindIcon item={item} className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.name}</span>
            </span>
          ))}
          {items.length > 8 && <span className="h-8 px-2 text-xs text-text-secondary inline-flex items-center">y {items.length - 8} más</span>}
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-text-secondary absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar artista…" className="w-full h-11 bg-surface border border-border rounded-xl pl-9 pr-3 text-sm focus:outline-none focus:border-accent" />
        </div>

        <div className="max-h-[min(48dvh,380px)] overflow-y-auto overscroll-contain -mx-1 px-1 space-y-3">
          {visibleReceivers.length > 0 && (
            <div className="space-y-0.5">
              <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-accent">Lo han recibido</p>
              {visibleReceivers.map(a => <ArtistRow key={a.id} artist={a} selected={a.id === artistId} hint="Lo tiene en su portal" onClick={() => setArtistId(a.id)} />)}
            </div>
          )}
          <div className="space-y-0.5">
            {visibleReceivers.length > 0 && <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-text-secondary">Otros artistas</p>}
            {others.map(a => <ArtistRow key={a.id} artist={a} selected={a.id === artistId} hint={a.genre?.slice(0, 3).join(' · ')} onClick={() => setArtistId(a.id)} />)}
            {others.length === 0 && visibleReceivers.length === 0 && <p className="text-sm text-text-secondary text-center py-8">Ningún artista coincide</p>}
          </div>
        </div>

        {artist && (
          <div className="rounded-xl bg-accent/10 border border-accent/20 px-3 py-2.5 text-xs text-text-primary flex items-center gap-2 animate-fade-in">
            <UserCheck className="w-4 h-4 text-accent shrink-0" />
            <span className="min-w-0 flex-1">
              {single ? <b className="break-all">{single.name}</b> : <b>{items.length} elementos</b>} <ArrowRight className="inline w-3 h-3 mx-0.5" /> {artist.name} / Beats
            </span>
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row gap-2">
          <button type="button" onClick={onClose} className="h-11 sm:h-10 px-4 rounded-xl border border-border text-sm font-medium hover:bg-surface sm:mr-auto">Cancelar</button>
          <button type="button" onClick={confirm} disabled={!artist || busy} className="h-11 sm:h-10 px-5 rounded-xl bg-accent text-white text-sm font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
            {artist ? `Asignar a ${artist.name}` : 'Elige un artista'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
