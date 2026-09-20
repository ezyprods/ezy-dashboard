'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Send, UserPlus, Pencil, MoreHorizontal, Undo2, ExternalLink, Play, Pause, FolderOpen, UserCheck, Music2,
  FolderPlus, ArrowRight, Download, Headphones,
} from 'lucide-react';
import { ArtistAvatar } from '@/components/ui/ArtistAvatar';
import { useArtists } from '@/lib/hooks/useArtists';
import { useAudioControls } from '@/lib/contexts/AudioContext';
import { useContextMenu } from '@/lib/contexts/ContextMenuContext';
import { customConfirm, customPrompt } from '@/lib/dialog';
import { cn, formatRelativeTime, getWhatsAppUrl } from '@/lib/utils';
import { findItem } from '@/components/explorer/driveStore';
import { getExtension, getKind, KindIcon, normalizeForSearch, stripExtension } from '@/components/explorer/fileKinds';
import { copyText } from '@/components/explorer/explorerUtils';
import { useExplorer } from '@/components/explorer/useExplorerController';
import type { DriveItem } from '@/components/explorer/types';
import type { Artist, BeatAssignment, BeatSend } from '@/types';
import { apiDeleteSend, apiRestoreSend, apiUpdateSend } from './libraryStore';
import { countFiles, portalBeatsUrl } from './SendBeatsModal';

function ArtistFilter({ artists, value, onChange, ids }: { artists: Artist[]; value: string; onChange: (id: string) => void; ids: Set<string> }) {
  const options = artists.filter(a => ids.has(a.id)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  if (options.length < 2) return null;
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className="h-9 bg-surface border border-border rounded-xl px-3 text-xs font-medium text-text-primary focus:outline-none focus:border-accent max-w-[200px]">
      <option value="">Todos los artistas</option>
      {options.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
  );
}

function HowItWorks() {
  const ex = useExplorer();
  const steps = [
    { icon: FolderPlus, title: 'Organiza a tu manera', text: 'Crea carpetas libres: por año, por estilo, por pack… Sube tus beats donde quieras.' },
    { icon: Send, title: 'Envía sin duplicar', text: 'Selecciona beats o carpetas enteras → “Enviar a artistas”. No se copia nada: cada artista los ve en su portal.' },
    { icon: UserCheck, title: 'Asigna en un clic', text: '¿A alguien le encaja uno? “Asignar” lo reserva para él: no se mueve, pero desaparece de lo que ven los demás.' },
  ];
  return (
    <div className="p-4 md:p-8">
      <div className="max-w-3xl mx-auto text-center space-y-2 mb-6">
        <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto"><Send className="w-7 h-7 text-accent" /></div>
        <p className="text-base font-bold text-text-primary">Todavía no has enviado beats</p>
        <p className="text-xs text-text-secondary">Así funciona el sistema de envíos:</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3 max-w-3xl mx-auto">
        {steps.map(({ icon: Icon, title, text }, i) => (
          <div key={title} className="rounded-2xl border border-border/60 bg-surface/50 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-accent/15 text-accent text-xs font-bold flex items-center justify-center">{i + 1}</span>
              <Icon className="w-4 h-4 text-accent" />
            </div>
            <p className="text-sm font-semibold text-text-primary">{title}</p>
            <p className="text-xs text-text-secondary leading-relaxed">{text}</p>
          </div>
        ))}
      </div>
      <div className="text-center mt-6">
        <button type="button" onClick={() => ex.setView('folder')} className="h-10 px-4 rounded-xl bg-accent text-white text-sm font-semibold inline-flex items-center gap-2">
          <FolderOpen className="w-4 h-4" /> Ir a mis beats
        </button>
      </div>
    </div>
  );
}

function SendCard({ send, artistsById }: { send: BeatSend; artistsById: Map<string, Artist> }) {
  const ex = useExplorer();
  const { showMenu } = useContextMenu();
  const items = send.itemIds.map(id => findItem(id)).filter(Boolean) as DriveItem[];
  const missing = ex.index.status === 'ready' ? send.itemIds.length - items.length : 0;
  const fileCount = countFiles(items, ex.index.items);
  const recipients = send.artistIds.map(id => artistsById.get(id)).filter(Boolean) as Artist[];

  const openItem = (item: DriveItem) => (item.isFolder ? ex.openFolder(item) : ex.revealInFolder(item));

  const rename = async () => {
    const title = (await customPrompt('Nombre del envío (lo ven los artistas)', send.title, 'Renombrar envío'))?.trim();
    if (!title || title === send.title) return;
    apiUpdateSend(send.id, { title }).catch(err => toast.error(err.message));
  };

  const remove = async () => {
    const ok = await customConfirm(`Los ${recipients.length} artistas dejarán de ver “${send.title}” en su portal. Tus beats no se tocan.`, 'Eliminar envío');
    if (!ok) return;
    try {
      await apiDeleteSend(send.id);
      ex.notify(`Envío “${send.title}” eliminado`, { label: 'eliminar envío', run: () => apiRestoreSend(send) });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const removeArtist = async (artist: Artist) => {
    if (send.artistIds.length === 1) return remove();
    const previous = send.artistIds;
    try {
      await apiUpdateSend(send.id, { artistIds: previous.filter(id => id !== artist.id) });
      ex.notify(`${artist.name} ya no ve “${send.title}”`, { label: 'quitar artista', run: async () => { await apiUpdateSend(send.id, { artistIds: previous }); } });
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const artistMenu = (e: React.MouseEvent, artist: Artist) => {
    const r = e.currentTarget.getBoundingClientRect();
    showMenu(r.left, r.bottom + 6, [
      { heading: artist.name },
      { label: 'Abrir su portal (beats)', icon: 'ExternalLink', action: () => window.open(portalBeatsUrl(artist.id), '_blank', 'noopener') },
      { label: 'Copiar enlace de sus beats', icon: 'Link', action: () => copyText(portalBeatsUrl(artist.id), 'Enlace copiado') },
      ...(artist.phone ? [{ label: 'Avisar por WhatsApp', icon: 'Send', action: () => window.open(getWhatsAppUrl(artist.phone!, `Hola ${artist.name}! Tienes beats nuevos en tu portal (${send.title}):\n${portalBeatsUrl(artist.id)}`), '_blank', 'noopener') }] : []),
      { label: 'Ver ficha del artista', icon: 'User', action: () => window.open(`/artists/${artist.id}`, '_self') },
      { separator: true },
      { label: 'Quitar de este envío', icon: 'X', variant: 'danger' as const, action: () => removeArtist(artist) },
    ]);
  };

  const moreMenu = (e: React.MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    showMenu(r.right - 230, r.bottom + 6, [
      { heading: send.title },
      { label: 'Renombrar', icon: 'Edit3', action: rename },
      { label: 'Editar envío…', icon: 'Pencil', action: () => ex.setEditSend(send) },
      { label: 'Copiar enlaces de todos', icon: 'Copy', action: () => copyText(recipients.map(a => `${a.name}: ${portalBeatsUrl(a.id)}`).join('\n'), 'Enlaces copiados') },
      { label: send.allowDownload ? 'Permitir solo escuchar' : 'Permitir descargas', icon: 'Download', action: () => apiUpdateSend(send.id, { allowDownload: !send.allowDownload }).catch(err => toast.error(err.message)) },
      { separator: true },
      { label: 'Eliminar envío', icon: 'Trash2', variant: 'danger', action: remove },
    ]);
  };

  return (
    <div className="rounded-2xl border border-border/70 bg-surface/40 hover:border-accent/30 transition-colors p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center shrink-0"><Send className="w-[18px] h-[18px]" /></div>
        <div className="flex-1 min-w-0">
          <button type="button" onClick={rename} className="text-sm font-bold text-text-primary truncate max-w-full text-left hover:text-accent" title="Renombrar">{send.title}</button>
          <p className="text-[11px] text-text-secondary flex flex-wrap items-center gap-x-2">
            <span>{fileCount} archivo{fileCount === 1 ? '' : 's'} disponibles</span>
            <span>· {recipients.length} artista{recipients.length === 1 ? '' : 's'}</span>
            <span>· {formatRelativeTime(send.updatedAt || send.createdAt)}</span>
            {send.allowDownload === false ? <span className="inline-flex items-center gap-1 text-warning"><Headphones className="w-3 h-3" /> solo escuchar</span> : <span className="inline-flex items-center gap-1"><Download className="w-3 h-3" /> descarga</span>}
          </p>
          {send.note && <p className="text-xs text-text-secondary mt-1 line-clamp-2 whitespace-pre-line">{send.note}</p>}
        </div>
        <button type="button" onClick={moreMenu} className="w-9 h-9 rounded-xl flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface shrink-0" aria-label="Más acciones del envío">
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {items.map(item => (
          <button key={item.id} type="button" onClick={() => openItem(item)} className="h-8 pl-2 pr-2.5 rounded-lg bg-surface-elevated border border-border/60 text-xs text-text-primary inline-flex items-center gap-1.5 max-w-[220px] hover:border-accent/40" title={item.isFolder ? 'Abrir carpeta' : 'Mostrar en su carpeta'}>
            <KindIcon item={item} className="w-4 h-4 shrink-0" />
            <span className="truncate">{item.name}</span>
          </button>
        ))}
        {missing > 0 && (
          <span className="h-8 px-2.5 rounded-lg text-[11px] text-text-secondary inline-flex items-center border border-dashed border-border" title="Asignados a un artista, eliminados o todavía cargando">
            {missing} ya no disponible{missing === 1 ? '' : 's'}
          </span>
        )}
        {items.length === 0 && missing === 0 && <span className="text-xs text-text-secondary">Sin contenido</span>}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
          {recipients.map(a => (
            <button key={a.id} type="button" onClick={e => artistMenu(e, a)} className="h-8 pl-1 pr-2.5 rounded-full bg-surface-elevated border border-border/60 text-xs font-medium text-text-primary inline-flex items-center gap-1.5 hover:border-accent/40">
              <ArtistAvatar name={a.name} photoUrl={a.photoUrl} size="sm" className="w-6 h-6 text-[9px]" />
              <span className="max-w-[120px] truncate">{a.name}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => ex.openSendDialog([], send.id)} className="h-8 px-3 rounded-lg border border-border text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-surface shrink-0">
          <UserPlus className="w-3.5 h-3.5" /> Añadir artistas
        </button>
        <button type="button" onClick={() => ex.setEditSend(send)} className="h-8 px-3 rounded-lg border border-border text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-surface shrink-0">
          <Pencil className="w-3.5 h-3.5" /> Editar
        </button>
      </div>
    </div>
  );
}

export function SendsView() {
  const ex = useExplorer();
  const { artists } = useArtists();
  const [artistFilter, setArtistFilter] = useState('');
  const artistsById = useMemo(() => new Map(artists.map(a => [a.id, a])), [artists]);
  const sends = ex.library.sends;
  const involved = useMemo(() => new Set(sends.flatMap(s => s.artistIds)), [sends]);

  const q = normalizeForSearch(ex.query.trim());
  const visible = sends.filter(s =>
    (!artistFilter || s.artistIds.includes(artistFilter))
    && (!q || normalizeForSearch(`${s.title} ${s.note || ''} ${s.artistIds.map(id => artistsById.get(id)?.name || '').join(' ')}`).includes(q)));

  if (sends.length === 0) return <HowItWorks />;

  return (
    <div className="p-3 md:p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-xs text-text-secondary flex-1 min-w-[200px]">
          Cada envío apunta a tus beats originales: lo que asignes o borres desaparece solo de todos los portales.
        </p>
        <ArtistFilter artists={artists} ids={involved} value={artistFilter} onChange={setArtistFilter} />
      </div>
      {visible.map(send => <SendCard key={send.id} send={send} artistsById={artistsById} />)}
      {visible.length === 0 && <p className="text-sm text-text-secondary text-center py-12">Ningún envío coincide</p>}
    </div>
  );
}

function AssignmentRow({ assignment, artist }: { assignment: BeatAssignment; artist?: Artist }) {
  const ex = useExplorer();
  const { currentTrack, isPlaying, playTrack, togglePlay } = useAudioControls();
  const [undoing, setUndoing] = useState(false);
  const kind = assignment.isFolder ? 'folder' : getKind('', assignment.fileName);
  const active = currentTrack?.id === assignment.fileId;

  const play = () => {
    if (active) return togglePlay();
    playTrack({
      id: assignment.fileId,
      name: stripExtension(assignment.fileName),
      url: `/api/audio/${assignment.fileId}`,
      pathSegments: [{ name: 'Proyectos personales', url: '/personal-projects' }, ...(assignment.path ? [{ name: assignment.path }] : []), { name: stripExtension(assignment.fileName) }],
    });
  };

  const undo = async () => {
    const ok = await customConfirm(`“${assignment.fileName}” dejará de estar asignado a ${assignment.artistName} y volverá a aparecer en lo que compartas con los demás. El archivo no se mueve.`, 'Quitar asignación');
    if (!ok) return;
    setUndoing(true);
    try {
      await ex.undoAssignments([assignment]);
      toast.success(`“${assignment.fileName}” ya no está asignado`);
    } catch (err: any) {
      toast.error(`No se pudo deshacer: ${err.message}`);
    } finally {
      setUndoing(false);
    }
  };

  return (
    <div className="flex items-center gap-3 px-3 md:px-4 min-h-[60px] border-b border-border/40 last:border-b-0 hover:bg-surface/60">
      {kind === 'audio' ? (
        <button type="button" onClick={play} className={cn('w-9 h-9 rounded-full flex items-center justify-center shrink-0', active ? 'bg-accent text-white' : 'bg-violet-500/10 text-violet-400 hover:bg-accent hover:text-white')} aria-label={active && isPlaying ? 'Pausar' : 'Reproducir'}>
          {active && isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current translate-x-px" />}
        </button>
      ) : (
        <span className="w-9 h-9 flex items-center justify-center shrink-0"><KindIcon item={{ kind, extension: getExtension(assignment.fileName) }} className="w-6 h-6" /></span>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate" title={assignment.fileName}>{assignment.fileName}</p>
        <p className="text-[11px] text-text-secondary truncate flex items-center gap-1">
          <span className="truncate">{assignment.path || 'Raíz'}</span>
          <ArrowRight className="w-3 h-3 shrink-0" />
          <span className="font-semibold text-text-primary truncate">{assignment.artistName}</span>
          <span className="shrink-0">· {formatRelativeTime(assignment.assignedAt)}</span>
        </p>
      </div>
      {artist && <ArtistAvatar name={artist.name} photoUrl={artist.photoUrl} size="sm" className="w-7 h-7 hidden sm:flex" />}
      <Link href={ex.folderHref(assignment.folderId)} className="h-8 w-8 sm:w-auto sm:px-2.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 text-text-secondary hover:text-text-primary hover:bg-surface shrink-0" title="Ver en la biblioteca">
        <ExternalLink className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Ver</span>
      </Link>
      <button type="button" onClick={undo} disabled={undoing} className="h-8 w-8 sm:w-auto sm:px-2.5 rounded-lg border border-border text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-surface shrink-0 disabled:opacity-50" title="Quitar asignación">
        <Undo2 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Quitar</span>
      </button>
    </div>
  );
}

export function AssignedView() {
  const ex = useExplorer();
  const { artists } = useArtists();
  const [artistFilter, setArtistFilter] = useState('');
  const artistsById = useMemo(() => new Map(artists.map(a => [a.id, a])), [artists]);
  const assignments = ex.library.assignments;
  const involved = useMemo(() => new Set(assignments.map(a => a.artistId)), [assignments]);
  const q = normalizeForSearch(ex.query.trim());
  const visible = assignments.filter(a =>
    (!artistFilter || a.artistId === artistFilter)
    && (!q || normalizeForSearch(`${a.fileName} ${a.artistName} ${a.path}`).includes(q)));

  if (assignments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 px-6">
        <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center mb-3"><Music2 className="w-7 h-7 text-accent" /></div>
        <p className="text-sm font-semibold text-text-primary">Aún no has asignado beats</p>
        <p className="text-xs text-text-secondary mt-1 max-w-sm">Clic derecho sobre un beat → “Asignar a un artista”. No se mueve de sitio, solo deja de verse en lo que compartes con los demás, y aquí queda el historial para deshacerlo.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 px-3 md:px-4 py-2.5 border-b border-border/60">
        <p className="text-xs text-text-secondary flex-1">{visible.length} beat{visible.length === 1 ? '' : 's'} asignado{visible.length === 1 ? '' : 's'}</p>
        <ArtistFilter artists={artists} ids={involved} value={artistFilter} onChange={setArtistFilter} />
      </div>
      {visible.map(a => <AssignmentRow key={a.id} assignment={a} artist={artistsById.get(a.artistId)} />)}
      {visible.length === 0 && <p className="text-sm text-text-secondary text-center py-12">Nada coincide</p>}
    </div>
  );
}
