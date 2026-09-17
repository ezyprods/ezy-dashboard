'use client';

import React, { useMemo, useState } from 'react';
import { ChevronDown, Search, Check, Plus, Loader2, Music } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { ArtistAvatar } from '@/components/ui/ArtistAvatar';
import { cn, sortArtistsByRecent } from '@/lib/utils';
import { PERSONAL_PROJECT_CATEGORIES } from '@/lib/constants';
import { normalizeForSearch } from '@/components/explorer/fileKinds';
import type { Artist, PersonalProject, PersonalProjectCategory } from '@/types';

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

export function PersonalProjectPicker({
  projects, value, onChange, onCreate, highlight,
}: {
  projects: PersonalProject[];
  value: string;
  onChange: (id: string) => void;
  onCreate: (input: { title: string; category: PersonalProjectCategory }) => Promise<PersonalProject>;
  highlight?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<PersonalProjectCategory>('beat');
  const [busy, setBusy] = useState(false);
  const selected = projects.find(p => p.id === value);

  const list = useMemo(() => {
    const q = normalizeForSearch(query.trim());
    return projects.filter(p => !q || normalizeForSearch(`${p.title} ${p.tags?.join(' ') || ''}`).includes(q));
  }, [projects, query]);

  const create = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const project = await onCreate({ title: title.trim(), category });
      onChange(project.id);
      setOpen(false);
      setCreating(false);
      setTitle('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" onClick={() => { setQuery(''); setCreating(false); setOpen(true); }} className={cn(triggerClass, highlight && !selected && 'border-warning/60 ring-2 ring-warning/20')}>
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: selected ? PERSONAL_PROJECT_CATEGORIES[selected.category]?.bgColor : undefined, color: selected ? PERSONAL_PROJECT_CATEGORIES[selected.category]?.color : undefined }}
        >
          <Music className="w-4 h-4" />
        </span>
        <span className={cn('flex-1 truncate text-sm', selected ? 'font-medium text-text-primary' : 'text-text-secondary')}>
          {selected ? selected.title : 'Elige un proyecto personal…'}
        </span>
        <ChevronDown className="w-4 h-4 text-text-secondary shrink-0" />
      </button>
      {open && (
        <Modal isOpen onClose={() => setOpen(false)} title="Proyecto personal">
          {creating ? (
            <div className="space-y-4 -mt-1">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-secondary">Título</label>
                <input autoFocus value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') create(); }} placeholder="Ej: Midnight Dream" className="w-full h-11 bg-surface border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-accent" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-text-secondary">Categoría</label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.entries(PERSONAL_PROJECT_CATEGORIES) as [PersonalProjectCategory, any][]).map(([key, cfg]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setCategory(key)}
                      className={cn('h-10 px-3 rounded-xl border text-xs font-semibold text-left truncate transition-colors', category === key ? 'border-accent bg-accent/10 text-text-primary' : 'border-border text-text-secondary hover:bg-surface')}
                    >
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setCreating(false)} className="h-10 px-4 rounded-xl border border-border text-sm hover:bg-surface">Volver</button>
                <button type="button" onClick={create} disabled={busy || !title.trim()} className="h-10 px-4 rounded-xl bg-accent text-white text-sm font-semibold disabled:opacity-40 inline-flex items-center gap-2">
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />} Crear proyecto
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 -mt-1">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-text-secondary absolute left-3 top-1/2 -translate-y-1/2" />
                  <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar proyecto…" className="w-full h-11 bg-surface border border-border rounded-xl pl-9 pr-3 text-sm focus:outline-none focus:border-accent" />
                </div>
                <button type="button" onClick={() => { setTitle(query); setCreating(true); }} className="h-11 px-3 rounded-xl bg-accent/10 text-accent text-sm font-semibold inline-flex items-center gap-1.5 shrink-0">
                  <Plus className="w-4 h-4" /> Nuevo
                </button>
              </div>
              <div className="max-h-[min(55dvh,420px)] overflow-y-auto overscroll-contain -mx-1 px-1 space-y-0.5">
                {list.map(p => {
                  const cfg = PERSONAL_PROJECT_CATEGORIES[p.category];
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { onChange(p.id); setOpen(false); }}
                      className={cn('w-full flex items-center gap-3 px-2.5 min-h-[52px] rounded-xl text-left transition-colors', p.id === value ? 'bg-accent/10' : 'hover:bg-surface')}
                    >
                      <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: cfg?.bgColor, color: cfg?.color }}>
                        <Music className="w-4 h-4" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">{p.title}</p>
                        <p className="text-[11px] text-text-secondary truncate">{cfg?.label}{p.bpm ? ` · ${p.bpm} BPM` : ''}{p.key ? ` · ${p.key}` : ''}</p>
                      </div>
                      {p.id === value && <Check className="w-4 h-4 text-accent shrink-0" />}
                    </button>
                  );
                })}
                {list.length === 0 && <p className="text-sm text-text-secondary text-center py-8">Ningún proyecto coincide</p>}
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
