'use client';

import { useEffect, useState } from 'react';
import { Search, Loader2, Film, Image as ImageIcon, Music, Check } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { cn, formatFileSize } from '@/lib/utils';
import { formatSeconds } from '@/lib/instagram/limits';
import { driveThumb, searchDrive, type DriveItem } from './igClient';

type Kind = 'image' | 'video' | 'audio';

const KIND_LABEL: Record<Kind, string> = { image: 'Imágenes', video: 'Vídeos', audio: 'Audio' };
const KIND_ICON = { image: ImageIcon, video: Film, audio: Music };

export function DrivePicker({
  kinds,
  multiple,
  title = 'Elegir de Drive',
  onClose,
  onPick,
}: {
  kinds: Kind[];
  multiple?: boolean;
  title?: string;
  onClose: () => void;
  onPick: (files: (DriveItem & { kind: Kind })[]) => void;
}) {
  const [kind, setKind] = useState<Kind>(kinds[0]);
  const [q, setQ] = useState('');
  const [files, setFiles] = useState<DriveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<Map<string, DriveItem & { kind: Kind }>>(new Map());

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    const t = setTimeout(() => {
      searchDrive(kind, q)
        .then(f => { if (alive) setFiles(f); })
        .catch(e => { if (alive) setError(e.message); })
        .finally(() => { if (alive) setLoading(false); });
    }, q ? 300 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [kind, q]);

  const toggle = (f: DriveItem) => {
    const item = { ...f, kind };
    if (!multiple) {
      onPick([item]);
      return;
    }
    setPicked(prev => {
      const next = new Map(prev);
      if (next.has(f.id)) next.delete(f.id);
      else next.set(f.id, item);
      return next;
    });
  };

  return (
    <Modal isOpen onClose={onClose} title={title} className="md:max-w-2xl!">
      <div className="space-y-3 -mt-1">
        {kinds.length > 1 && (
          <div className="flex gap-1 p-1 rounded-xl bg-surface border border-border w-fit">
            {kinds.map(k => {
              const Icon = KIND_ICON[k];
              return (
                <button key={k} type="button" onClick={() => setKind(k)}
                  className={cn('flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-medium transition-colors', kind === k ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary')}>
                  <Icon className="w-3.5 h-3.5" />{KIND_LABEL[k]}
                </button>
              );
            })}
          </div>
        )}
        <div className="relative">
          <Search className="w-4 h-4 text-text-secondary absolute left-3 top-1/2 -translate-y-1/2" />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre…"
            className="w-full h-11 bg-surface border border-border rounded-xl pl-9 pr-3 text-sm focus:outline-none focus:border-accent" />
        </div>
        <div className="min-h-[260px] max-h-[min(55dvh,460px)] overflow-y-auto overscroll-contain -mx-1 px-1">
          {loading ? (
            <div className="flex items-center justify-center h-60 text-text-secondary"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : error ? (
            <p className="text-sm text-error p-4">{error}</p>
          ) : files.length === 0 ? (
            <p className="text-sm text-text-secondary p-6 text-center">No hay {KIND_LABEL[kind].toLowerCase()} {q ? `con «${q}»` : 'en tu Drive'}.</p>
          ) : kind === 'audio' ? (
            <div className="space-y-0.5">
              {files.map(f => (
                <button key={f.id} type="button" onClick={() => toggle(f)}
                  className={cn('w-full flex items-center gap-3 px-3 min-h-[52px] rounded-xl text-left transition-colors', picked.has(f.id) ? 'bg-accent/10' : 'hover:bg-surface')}>
                  <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0"><Music className="w-4 h-4 text-accent" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{f.name}</p>
                    <p className="text-[11px] text-text-secondary">{formatFileSize(f.size)}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {files.map(f => (
                <button key={f.id} type="button" onClick={() => toggle(f)}
                  className={cn('relative aspect-square rounded-xl overflow-hidden border-2 bg-surface transition-all', picked.has(f.id) ? 'border-accent' : 'border-transparent hover:border-border')}>
                  <img src={driveThumb(f.id, 300)} alt="" loading="lazy" className="w-full h-full object-cover" />
                  <span className="absolute inset-x-0 bottom-0 px-1.5 py-1 bg-gradient-to-t from-black/80 to-transparent text-[10px] text-white truncate text-left">
                    {kind === 'video' && f.duration ? `${formatSeconds(f.duration)} · ` : ''}{f.name}
                  </span>
                  {picked.has(f.id) && (
                    <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-accent text-white flex items-center justify-center"><Check className="w-3 h-3" /></span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        {multiple && (
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="h-10 px-4 rounded-xl text-sm text-text-secondary hover:text-text-primary">Cancelar</button>
            <button type="button" disabled={picked.size === 0} onClick={() => onPick([...picked.values()])}
              className="h-10 px-4 rounded-xl text-sm font-semibold bg-accent text-white disabled:opacity-40">
              Añadir {picked.size || ''}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
