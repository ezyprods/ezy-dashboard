'use client';

import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Check, CheckCircle2, Copy, Download, Loader2, Mail, MessageCircle, Send, X } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { ArtistAvatar } from '@/components/ui/ArtistAvatar';
import { useArtists } from '@/lib/hooks/useArtists';
import { cn, getWhatsAppUrl } from '@/lib/utils';
import { findItem } from '@/components/explorer/driveStore';
import { KindIcon, stripExtension } from '@/components/explorer/fileKinds';
import { copyText } from '@/components/explorer/explorerUtils';
import { useExplorer } from '@/components/explorer/useExplorerController';
import type { DriveItem } from '@/components/explorer/types';
import type { Artist, BeatSend } from '@/types';
import { ArtistChecklist } from './ArtistChecklist';
import { apiCreateSend, apiUpdateSend, useLibrary } from './libraryStore';

export const portalBeatsUrl = (artistId: string) => `${window.location.origin}/portal/${artistId}?tab=beats`;

/** Files inside the given items (folders counted recursively through the explorer index). */
export function countFiles(items: DriveItem[], index: DriveItem[]): number {
  const children = new Map<string, DriveItem[]>();
  for (const i of index) {
    if (!i.parentId) continue;
    if (!children.has(i.parentId)) children.set(i.parentId, []);
    children.get(i.parentId)!.push(i);
  }
  const seen = new Set<string>();
  const walk = (folderId: string, depth: number) => {
    if (depth > 40) return;
    for (const child of children.get(folderId) || []) {
      if (child.isFolder) walk(child.id, depth + 1);
      else seen.add(child.id);
    }
  };
  for (const item of items) {
    if (item.isFolder) walk(item.id, 0);
    else seen.add(item.id);
  }
  return seen.size;
}

const fill = (template: string, values: Record<string, string>) =>
  Object.entries(values).reduce((text, [key, value]) => text.split(`{${key}}`).join(value), template);

function defaultTitle(items: DriveItem[], locationOf: (i: DriveItem) => string) {
  if (items.length === 1) return items[0].isFolder ? items[0].name : stripExtension(items[0].name);
  const date = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  const parents = new Set(items.map(i => i.parentId));
  const place = parents.size === 1 ? locationOf(items[0]) : '';
  return place ? `${place} · ${items.length} beats` : `${items.length} beats · ${date}`;
}

const DEFAULT_MESSAGE = 'Hola {nombre}! Te he dejado beats nuevos en tu portal ({envío}). Escúchalos aquí y dime si alguno te encaja:\n{enlace}';

/** After sending: quick ways to let each artist know (WhatsApp, email, link). */
function NotifyArtists({ send, artists, onDone }: { send: BeatSend; artists: Artist[]; onDone: () => void }) {
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [emailState, setEmailState] = useState<Record<string, 'sending' | 'sent' | 'error'>>({});
  const textFor = (a: Artist) => fill(message, { nombre: a.name, 'envío': send.title, enlace: portalBeatsUrl(a.id) });

  const sendEmail = async (a: Artist) => {
    if (!a.email) return;
    setEmailState(s => ({ ...s, [a.id]: 'sending' }));
    try {
      const res = await fetch('/api/communications/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistEmail: a.email, artistName: a.name, projectName: send.title, message: textFor(a), portalUrl: portalBeatsUrl(a.id) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || 'No se pudo enviar');
      setEmailState(s => ({ ...s, [a.id]: 'sent' }));
    } catch (err: any) {
      setEmailState(s => ({ ...s, [a.id]: 'error' }));
      toast.error(`${a.name}: ${err.message}`);
    }
  };

  const withEmail = artists.filter(a => a.email && emailState[a.id] !== 'sent');

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-success/30 bg-success/10 p-4 flex items-center gap-3">
        <CheckCircle2 className="w-6 h-6 text-success shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-text-primary">“{send.title}” ya está en el portal de {artists.length === 1 ? artists[0].name : `${artists.length} artistas`}</p>
          <p className="text-xs text-text-secondary">Cuando asignes un beat a alguien, desaparecerá automáticamente para los demás.</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-text-secondary">Mensaje para avisarles <span className="opacity-70">({'{nombre}'}, {'{envío}'} y {'{enlace}'} se rellenan solos)</span></label>
        <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3} className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent resize-none" />
      </div>

      <div className="rounded-xl border border-border/60 divide-y divide-border/40 max-h-[min(40dvh,320px)] overflow-y-auto overscroll-contain">
        {artists.map(a => (
          <div key={a.id} className="flex items-center gap-3 px-3 min-h-[52px]">
            <ArtistAvatar name={a.name} photoUrl={a.photoUrl} size="sm" className="w-8 h-8" />
            <span className="flex-1 min-w-0 text-sm font-medium text-text-primary truncate">{a.name}</span>
            {a.phone && (
              <a href={getWhatsAppUrl(a.phone, textFor(a))} target="_blank" rel="noopener noreferrer" className="h-8 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20" title="Abrir WhatsApp con el mensaje">
                <MessageCircle className="w-3.5 h-3.5" /> <span className="hidden sm:inline">WhatsApp</span>
              </a>
            )}
            {a.email && (
              <button type="button" onClick={() => sendEmail(a)} disabled={emailState[a.id] === 'sending' || emailState[a.id] === 'sent'} className={cn('h-8 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 border', emailState[a.id] === 'sent' ? 'border-success/30 text-success' : 'border-border text-text-secondary hover:text-text-primary hover:bg-surface')} title={`Enviar email a ${a.email}`}>
                {emailState[a.id] === 'sending' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : emailState[a.id] === 'sent' ? <Check className="w-3.5 h-3.5" /> : <Mail className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{emailState[a.id] === 'sent' ? 'Enviado' : 'Email'}</span>
              </button>
            )}
            <button type="button" onClick={() => copyText(textFor(a), `Mensaje para ${a.name} copiado`)} className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface" title="Copiar mensaje con el enlace" aria-label={`Copiar mensaje para ${a.name}`}>
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-col-reverse sm:flex-row gap-2">
        {withEmail.length > 1 && (
          <button type="button" onClick={() => withEmail.forEach(sendEmail)} className="h-10 px-4 rounded-xl border border-border text-sm font-medium hover:bg-surface inline-flex items-center justify-center gap-2 sm:mr-auto">
            <Mail className="w-4 h-4" /> Email a todos ({withEmail.length})
          </button>
        )}
        <button type="button" onClick={onDone} className="h-10 px-5 rounded-xl bg-accent text-white text-sm font-semibold inline-flex items-center justify-center gap-2 sm:ml-auto">
          <Check className="w-4 h-4" /> Listo
        </button>
      </div>
    </div>
  );
}

/**
 * Sends library items to artists (or edits an existing send). Sending never copies files:
 * the send only references the items, so each artist's portal always shows what is still available.
 */
export function SendBeatsModal({ items, mergeIntoId, editSend, onClose }: {
  items: DriveItem[];
  mergeIntoId?: string;
  editSend?: BeatSend | null;
  onClose: () => void;
}) {
  const ex = useExplorer();
  const { artists } = useArtists();
  const library = useLibrary();
  const isEdit = !!editSend;

  const [mode, setMode] = useState<'new' | 'merge'>(mergeIntoId ? 'merge' : 'new');
  const [targetId, setTargetId] = useState(mergeIntoId || library.sends[0]?.id || '');
  const target = library.sends.find(s => s.id === (isEdit ? editSend!.id : targetId));
  const [title, setTitle] = useState(() => editSend?.title || defaultTitle(items, ex.locationOf));
  const [note, setNote] = useState(editSend?.note || '');
  const [allowDownload, setAllowDownload] = useState(editSend ? editSend.allowDownload !== false : true);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(editSend?.artistIds || []));
  const [itemIds, setItemIds] = useState<string[]>(() => editSend?.itemIds || items.map(i => i.id));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ send: BeatSend; artists: Artist[] } | null>(null);

  const resolvedItems = useMemo(
    () => itemIds.map(id => items.find(i => i.id === id) || findItem(id)).filter(Boolean) as DriveItem[],
    [itemIds, items],
  );

  // Artists that already see every chosen item
  const alreadyHave = useMemo(() => {
    const merging = mode === 'merge' && target ? new Set(target.artistIds) : null;
    if (isEdit) return new Set<string>();
    if (items.length === 0) return merging || new Set<string>();
    const perItem = items.map(item => new Set<string>(ex.sentInfo(item)?.artistIds || []));
    const common = new Set<string>(Array.from(perItem[0]).filter(id => perItem.every(set => set.has(id))));
    merging?.forEach(id => common.add(id));
    return common;
  }, [items, ex, mode, target, isEdit]);

  const beatCount = useMemo(() => countFiles(resolvedItems, ex.index.items), [resolvedItems, ex.index.items]);

  const selectedArtists = artists.filter(a => selected.has(a.id));
  const newArtists = selectedArtists.filter(a => !alreadyHave.has(a.id));

  const submit = async () => {
    if (busy) return;
    if (isEdit) {
      if (selected.size === 0) return toast.error('Un envío necesita al menos un artista');
      setBusy(true);
      try {
        const added = selectedArtists.filter(a => !editSend!.artistIds.includes(a.id));
        const saved = await apiUpdateSend(editSend!.id, { title: title.trim() || editSend!.title, note, allowDownload, artistIds: Array.from(selected), itemIds });
        if (added.length) setDone({ send: saved, artists: added });
        else {
          toast.success('Envío actualizado');
          onClose();
        }
      } catch (err: any) {
        toast.error(err.message);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (selected.size === 0) return toast.error('Elige al menos un artista');
    setBusy(true);
    try {
      const result = await apiCreateSend({
        title: title.trim(),
        note: note.trim() || undefined,
        itemIds: items.map(i => i.id),
        artistIds: Array.from(selected),
        allowDownload,
        mergeIntoId: mode === 'merge' ? targetId : undefined,
      });
      const fresh = artists.filter(a => result.newArtistIds.includes(a.id));
      if (fresh.length === 0) {
        toast.success(result.merged ? `Añadido a “${result.send.title}”` : 'Envío guardado');
        onClose();
        return;
      }
      if (result.merged && mode === 'new') toast.info(`Ya existía un envío con lo mismo: se ha ampliado “${result.send.title}” en vez de duplicarlo`);
      setDone({ send: result.send, artists: fresh });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Modal isOpen onClose={onClose} title="Envío listo" className="md:max-w-xl">
        <NotifyArtists send={done.send} artists={done.artists} onDone={onClose} />
      </Modal>
    );
  }

  const heading = isEdit ? 'Editar envío' : mode === 'merge' && target ? `Añadir a “${target.title}”` : 'Enviar a artistas';

  return (
    <Modal isOpen onClose={onClose} title={heading} description={isEdit ? undefined : 'No se copia nada: los artistas ven los beats en su portal mientras sigan en tu biblioteca.'} className="md:max-w-2xl">
      <div className="space-y-4">
        {/* What is being sent */}
        {resolvedItems.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">
              {isEdit ? 'Contenido del envío' : 'Vas a enviar'} · {beatCount} archivo{beatCount === 1 ? '' : 's'}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {resolvedItems.slice(0, 12).map(item => (
                <span key={item.id} className="h-8 pl-2 pr-2.5 rounded-lg bg-surface border border-border/60 text-xs text-text-primary inline-flex items-center gap-1.5 max-w-[240px]">
                  <KindIcon item={item} className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.name}</span>
                  {isEdit && resolvedItems.length > 1 && (
                    <button type="button" onClick={() => setItemIds(ids => ids.filter(id => id !== item.id))} className="text-text-secondary hover:text-error -mr-1" aria-label={`Quitar ${item.name}`}>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </span>
              ))}
              {resolvedItems.length > 12 && <span className="h-8 px-2.5 rounded-lg text-xs text-text-secondary inline-flex items-center">y {resolvedItems.length - 12} más</span>}
            </div>
          </div>
        )}

        {/* New send vs. add to an existing one (avoids a new send for every little batch) */}
        {!isEdit && !mergeIntoId && library.sends.length > 0 && (
          <div className="flex p-0.5 rounded-xl bg-surface border border-border/70">
            {(['new', 'merge'] as const).map(m => (
              <button key={m} type="button" onClick={() => setMode(m)} className={cn('flex-1 h-9 rounded-lg text-xs font-semibold', mode === m ? 'bg-surface-elevated text-text-primary shadow-sm' : 'text-text-secondary')}>
                {m === 'new' ? 'Nuevo envío' : 'Añadir a un envío existente'}
              </button>
            ))}
          </div>
        )}

        {mode === 'merge' && !isEdit && !mergeIntoId ? (
          <select value={targetId} onChange={e => setTargetId(e.target.value)} className="w-full h-11 bg-surface border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-accent">
            {library.sends.map(s => <option key={s.id} value={s.id}>{s.title} · {s.artistIds.length} artista{s.artistIds.length === 1 ? '' : 's'}</option>)}
          </select>
        ) : mode === 'new' || isEdit ? (
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary">Nombre del envío (lo ve el artista)</label>
              <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} className="w-full h-11 bg-surface border border-border rounded-xl px-3 text-sm focus:outline-none focus:border-accent" />
            </div>
            <button type="button" onClick={() => setAllowDownload(v => !v)} className={cn('h-11 px-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-2', allowDownload ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border text-text-secondary')} aria-pressed={allowDownload}>
              <Download className="w-4 h-4" /> {allowDownload ? 'Pueden descargar' : 'Solo escuchar'}
            </button>
          </div>
        ) : null}

        {(mode === 'new' || isEdit) && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary">Nota (opcional)</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={1000} placeholder="Ej: Selección de trap oscuro, 140-150 BPM. Los libres se van rápido 🔥" className="w-full bg-surface border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent resize-none" />
          </div>
        )}

        <div className="space-y-1.5">
          <p className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Artistas</p>
          <ArtistChecklist artists={artists} selected={selected} onChange={setSelected} alreadyHave={alreadyHave} />
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
          <button type="button" onClick={onClose} className="h-11 sm:h-10 px-4 rounded-xl border border-border text-sm font-medium hover:bg-surface sm:mr-auto">Cancelar</button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || selected.size === 0 || (isEdit && itemIds.length === 0)}
            className="h-11 sm:h-10 px-5 rounded-xl bg-accent text-white text-sm font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {isEdit
              ? 'Guardar cambios'
              : newArtists.length === 0 && selected.size > 0
                ? 'Guardar (ya lo tienen)'
                : `Enviar a ${newArtists.length || selected.size} artista${(newArtists.length || selected.size) === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
