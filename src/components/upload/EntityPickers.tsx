'use client';

import React, { useMemo, useState } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { ArtistAvatar } from '@/components/ui/ArtistAvatar';
import { cn, sortArtistsByRecent } from '@/lib/utils';
import { normalizeForSearch } from '@/components/explorer/fileKinds';
import type { Artist } from '@/types';

const triggerClass = 'w-full h-11 flex items-center gap-2.5 px-3 rounded-xl border border-border bg-surface hover:border-accent/50 transition-colors text-left min-w-0';

export function ArtistPicker({ artists, value, onChange, highlight }: { artists: Artist[]; value: string; onChange: (id: string) => void; highlight?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = artists.find(a => a.id === value);
  const list = useMemo(() => {
    const q = normalizeForSearch(query.trim());
    return sortArtistsByRecent(artists).filter(a => !q || normalizeForSearch(a.name).includes(q) || a.genre?.some(g => normalizeForSearch(g).includes(q)));
  }, [artists, query]);

  return (
    <>
      <button type="button" onClick={() => { setQuery(''); setOpen(true); }} className={cn(triggerClass, highlight && !selected && 'border-warning/60 ring-2 ring-warning/20')}>
        {selected ? (
          <>
            <ArtistAvatar name={selected.name} photoUrl={selected.photoUrl} size="sm" className="w-7 h-7" />
            <span className="flex-1 truncate text-sm font-medium text-text-primary">{selected.name}</span>
          </>
        ) : (
          <span className="flex-1 truncate text-sm text-text-secondary">Elige un artista…</span>
        )}
        <ChevronDown className="w-4 h-4 text-text-secondary shrink-0" />
      </button>
      {open && (
        <Modal isOpen onClose={() => setOpen(false)} title="Elegir artista">
          <div className="space-y-3 -mt-1">
            <div className="relative">
              <Search className="w-4 h-4 text-text-secondary absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar artista…"
                className="w-full h-11 bg-surface border border-border rounded-xl pl-9 pr-3 text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <div className="max-h-[min(55dvh,420px)] overflow-y-auto overscroll-contain -mx-1 px-1 space-y-0.5">
              {list.map(a => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => { onChange(a.id); setOpen(false); }}
                  className={cn('w-full flex items-center gap-3 px-2.5 min-h-[52px] rounded-xl text-left transition-colors', a.id === value ? 'bg-accent/10' : 'hover:bg-surface')}
                >
                  <ArtistAvatar name={a.name} photoUrl={a.photoUrl} size="sm" className="w-9 h-9" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{a.name}</p>
                    {a.genre?.length ? <p className="text-[11px] text-text-secondary truncate">{a.genre.slice(0, 3).join(' · ')}</p> : null}
                  </div>
                  {a.id === value && <Check className="w-4 h-4 text-accent shrink-0" />}
                </button>
              ))}
              {list.length === 0 && <p className="text-sm text-text-secondary text-center py-8">Ningún artista coincide</p>}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
