'use client';

import React, { useMemo, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { ArtistAvatar } from '@/components/ui/ArtistAvatar';
import { normalizeForSearch } from '@/components/explorer/fileKinds';
import { cn, sortArtistsByRecent } from '@/lib/utils';
import type { Artist } from '@/types';

interface ArtistChecklistProps {
  artists: Artist[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  /** Artists that already received everything: shown with a hint and not preselected */
  alreadyHave?: Set<string>;
  maxHeight?: string;
}

/** Searchable multi-select list of artists (recent first, archived only when searched). */
export function ArtistChecklist({ artists, selected, onChange, alreadyHave, maxHeight = 'min(42dvh, 340px)' }: ArtistChecklistProps) {
  const [query, setQuery] = useState('');
  const q = normalizeForSearch(query.trim());

  const list = useMemo(() => sortArtistsByRecent(artists).filter(a => {
    if (!q) return a.status !== 'archived' || selected.has(a.id);
    return normalizeForSearch(a.name).includes(q) || a.genre?.some(g => normalizeForSearch(g).includes(q)) || a.tags?.some(t => normalizeForSearch(t).includes(q));
  }), [artists, q, selected]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  const allVisibleSelected = list.length > 0 && list.every(a => selected.has(a.id));
  const toggleAllVisible = () => {
    const next = new Set(selected);
    if (allVisibleSelected) list.forEach(a => next.delete(a.id));
    else list.forEach(a => next.add(a.id));
    onChange(next);
  };

  const chosen = artists.filter(a => selected.has(a.id));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-text-secondary absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar por nombre, estilo o etiqueta…"
            className="w-full h-10 bg-surface border border-border rounded-xl pl-9 pr-8 text-sm focus:outline-none focus:border-accent"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-text-secondary" aria-label="Borrar búsqueda">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <button type="button" onClick={toggleAllVisible} disabled={list.length === 0} className="h-10 px-3 rounded-xl border border-border text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-surface shrink-0 disabled:opacity-40">
          {allVisibleSelected ? 'Ninguno' : q ? 'Todos estos' : 'Todos'}
        </button>
      </div>

      {chosen.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chosen.map(a => (
            <button key={a.id} type="button" onClick={() => toggle(a.id)} className="h-7 pl-1 pr-2 rounded-full bg-accent/15 text-accent text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-accent/25">
              <ArtistAvatar name={a.name} photoUrl={a.photoUrl} size="sm" className="w-5 h-5 text-[8px]" />
              <span className="max-w-[140px] truncate">{a.name}</span>
              <X className="w-3 h-3" />
            </button>
          ))}
        </div>
      )}

      <div className="overflow-y-auto overscroll-contain rounded-xl border border-border/60 divide-y divide-border/40" style={{ maxHeight }}>
        {list.map(a => {
          const checked = selected.has(a.id);
          const has = alreadyHave?.has(a.id);
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => toggle(a.id)}
              className={cn('w-full flex items-center gap-3 px-3 min-h-[50px] text-left transition-colors', checked ? 'bg-accent/10' : 'hover:bg-surface')}
              aria-pressed={checked}
            >
              <span className={cn('w-5 h-5 rounded-md border flex items-center justify-center shrink-0', checked ? 'bg-accent border-accent text-white' : 'border-border bg-surface-elevated')}>
                {checked && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
              </span>
              <ArtistAvatar name={a.name} photoUrl={a.photoUrl} size="sm" className="w-8 h-8" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">{a.name}</p>
                {a.genre?.length ? <p className="text-[11px] text-text-secondary truncate">{a.genre.slice(0, 3).join(' · ')}</p> : null}
              </div>
              {has && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-success/10 text-success shrink-0">Ya lo tiene</span>}
            </button>
          );
        })}
        {list.length === 0 && <p className="text-sm text-text-secondary text-center py-8">Ningún artista coincide</p>}
      </div>
    </div>
  );
}
