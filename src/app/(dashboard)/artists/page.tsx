'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Plus, Search, LayoutGrid, List as ListIcon, UploadCloud, MoreVertical, X, Files, Globe, Users, Archive, Mail, Phone,
} from 'lucide-react';
import { useArtists } from '@/lib/hooks/useArtists';
import { NewArtistModal } from '@/components/artists/NewArtistModal';
import { EditArtistModal } from '@/components/artists/EditArtistModal';
import { ArtistAvatar } from '@/components/ui/ArtistAvatar';
import { useContextMenu, type MenuItem } from '@/lib/contexts/ContextMenuContext';
import { isFileDrag, useGlobalDragDrop } from '@/lib/contexts/GlobalDragDropContext';
import { customConfirm } from '@/lib/dialog';
import { copyText, usePreference } from '@/components/explorer/explorerUtils';
import { normalizeForSearch } from '@/components/explorer/fileKinds';
import { cn, sortArtistsByRecent } from '@/lib/utils';
import type { Artist } from '@/types';

type SortKey = 'recent' | 'name-asc' | 'name-desc';

export default function ArtistsPage() {
  const router = useRouter();
  const { activeArtists, archivedArtists, isLoading, error, deleteArtistFromState, updateArtist, fetchArtists } = useArtists();
  const { showMenu } = useContextMenu();
  const { isDraggingFiles, openSmartUpload } = useGlobalDragDrop();

  const [isNewOpen, setIsNewOpen] = useState(false);
  const [editing, setEditing] = useState<Artist | null>(null);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [sort, setSort] = usePreference<SortKey>('artistsSort', 'recent');
  const [viewMode, setViewMode] = usePreference<'grid' | 'list'>('artistsView', 'grid');
  const [dropId, setDropId] = useState<string | null>(null);

  const source = tab === 'active' ? activeArtists : archivedArtists;
  const artists = useMemo(() => {
    const q = normalizeForSearch(query.trim());
    const filtered = source.filter(a => !q || normalizeForSearch(`${a.name} ${(a.genre || []).join(' ')} ${a.email || ''} ${a.activeProject || ''}`).includes(q));
    if (sort === 'recent') return sortArtistsByRecent(filtered);
    return [...filtered].sort((a, b) => (sort === 'name-asc' ? 1 : -1) * a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  }, [source, query, sort]);

  const open = (artist: Artist, tabKey?: string) => {
    try { localStorage.setItem(`accessed_${artist.id}`, Date.now().toString()); } catch {}
    router.push(`/artists/${artist.id}${tabKey ? `?tab=${tabKey}` : ''}`);
  };

  const setArchived = async (artist: Artist, archived: boolean) => {
    const res = await updateArtist(artist.id, { status: archived ? 'archived' : 'active' } as any);
    if (res.success) toast.success(archived ? `${artist.name} archivado` : `${artist.name} restaurado`, archived ? { action: { label: 'Deshacer', onClick: () => setArchived(artist, false) } } : undefined);
    else toast.error('No se pudo actualizar el artista');
  };

  const remove = async (artist: Artist) => {
    if (!await customConfirm(`La carpeta de ${artist.name} (con todos sus proyectos y archivos) se moverá a la papelera de Google Drive. Podrás recuperarla desde Drive durante 30 días.`, 'Eliminar artista')) return;
    const t = toast.loading('Eliminando…');
    try {
      const res = await fetch(`/api/artists/${artist.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No se pudo eliminar el artista');
      deleteArtistFromState?.(artist.id);
      toast.success(`${artist.name} eliminado`, { id: t });
    } catch (err: any) {
      toast.error(err.message, { id: t });
    }
  };

  const menuFor = (artist: Artist): MenuItem[] => {
    const portalUrl = `${window.location.origin}/portal/${artist.id}`;
    return [
      { heading: artist.name },
      { label: 'Abrir perfil', icon: 'User', action: () => open(artist) },
      { label: 'Archivos', icon: 'HardDrive', action: () => open(artist, 'files') },
      { label: 'Proyectos', icon: 'FolderOpen', action: () => open(artist, 'projects') },
      { label: 'Subir archivos', icon: 'UploadCloud', action: () => openSmartUpload({ files: [], targetType: 'artist', artistId: artist.id }) },
      { label: 'Nuevo proyecto', icon: 'FolderPlus', action: () => router.push(`/artists/${artist.id}?tab=projects&newProject=true`) },
      { separator: true },
      { label: 'Editar perfil', icon: 'Edit3', action: () => setEditing(artist) },
      { label: 'Abrir portal', icon: 'ExternalLink', action: () => window.open(`/portal/${artist.id}`, '_blank', 'noopener') },
      { label: 'Copiar enlace del portal', icon: 'Copy', action: () => copyText(portalUrl, 'Enlace del portal copiado') },
      { separator: true },
      artist.status === 'archived'
        ? { label: 'Restaurar', icon: 'RotateCcw', action: () => setArchived(artist, false) }
        : { label: 'Archivar', icon: 'Paperclip', action: () => setArchived(artist, true) },
      { label: 'Eliminar', icon: 'Trash2', variant: 'danger', action: () => remove(artist) },
    ];
  };

  const dropProps = (artist: Artist) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      if (dropId !== artist.id) setDropId(artist.id);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropId(prev => (prev === artist.id ? null : prev));
    },
    onDrop: (e: React.DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      setDropId(null);
      openSmartUpload({ files: Array.from(e.dataTransfer.files), targetType: 'artist', artistId: artist.id });
    },
  });

  const actionBtn = 'w-9 h-9 items-center justify-center rounded-lg text-text-secondary hover:text-accent hover:bg-surface transition-colors';

  return (
    <div className="space-y-5 animate-fade-in pb-6">
      <NewArtistModal isOpen={isNewOpen} onClose={() => setIsNewOpen(false)} />
      {editing && <EditArtistModal isOpen artist={editing} onClose={() => setEditing(null)} />}

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-black text-text-primary tracking-tight">Artistas</h1>
          <p className="text-sm text-text-secondary mt-1">
            {isLoading ? 'Cargando…' : `${activeArtists.length} activo${activeArtists.length === 1 ? '' : 's'}${archivedArtists.length ? ` · ${archivedArtists.length} archivado${archivedArtists.length === 1 ? '' : 's'}` : ''}`}
            <span className="hidden sm:inline"> · Arrastra archivos sobre un artista para subirlos</span>
          </p>
        </div>
        <button type="button" onClick={() => setIsNewOpen(true)} className="h-10 px-4 rounded-xl bg-accent text-white text-sm font-semibold inline-flex items-center gap-2 hover:bg-accent/90 shrink-0 shadow-sm shadow-accent/20">
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Nuevo artista</span><span className="sm:hidden">Nuevo</span>
        </button>
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-text-secondary absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nombre, género, email o proyecto…" className="w-full h-11 md:h-10 bg-surface-elevated border border-border rounded-xl pl-9 pr-9 text-sm focus:outline-none focus:border-accent" />
          {query && <button type="button" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-text-secondary" aria-label="Borrar búsqueda"><X className="w-4 h-4" /></button>}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex p-0.5 rounded-xl bg-surface-elevated border border-border h-10">
            {(['active', 'archived'] as const).map(t => (
              <button key={t} type="button" onClick={() => setTab(t)} className={cn('px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5', tab === t ? 'bg-surface text-text-primary shadow-sm' : 'text-text-secondary')}>
                {t === 'active' ? <Users className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                {t === 'active' ? 'Activos' : 'Archivados'}
              </button>
            ))}
          </div>
          <select value={sort} onChange={e => setSort(e.target.value as SortKey)} className="h-10 bg-surface-elevated border border-border rounded-xl px-2 text-xs font-semibold text-text-primary focus:outline-none flex-1 md:flex-none" aria-label="Ordenar">
            <option value="recent">Recientes</option>
            <option value="name-asc">Nombre A-Z</option>
            <option value="name-desc">Nombre Z-A</option>
          </select>
          <div className="flex items-center bg-surface-elevated border border-border rounded-xl p-0.5 h-10 shrink-0">
            <button type="button" onClick={() => setViewMode('grid')} className={cn('w-9 h-full flex items-center justify-center rounded-lg', viewMode === 'grid' ? 'bg-surface text-text-primary shadow-sm' : 'text-text-secondary')} aria-label="Cuadrícula"><LayoutGrid className="w-4 h-4" /></button>
            <button type="button" onClick={() => setViewMode('list')} className={cn('w-9 h-full flex items-center justify-center rounded-lg', viewMode === 'list' ? 'bg-surface text-text-primary shadow-sm' : 'text-text-secondary')} aria-label="Lista"><ListIcon className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      {isLoading && artists.length === 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => <div key={i} className="h-44 rounded-2xl bg-surface-elevated border border-border animate-pulse" />)}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-error/20 bg-surface-elevated p-8 text-center">
          <p className="text-error font-semibold">No se pudieron cargar los artistas</p>
          <p className="text-sm text-text-secondary mt-1">{error}</p>
          <button type="button" onClick={() => fetchArtists(true)} className="mt-4 h-10 px-4 rounded-xl border border-border text-sm hover:bg-surface">Reintentar</button>
        </div>
      ) : artists.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface-elevated/50 py-16 px-6 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-accent/10 text-accent flex items-center justify-center mb-3">{tab === 'archived' ? <Archive className="w-7 h-7" /> : <Users className="w-7 h-7" />}</div>
          <p className="text-sm font-semibold text-text-primary">{query ? 'Ningún artista coincide' : tab === 'archived' ? 'No hay artistas archivados' : 'Aún no tienes artistas'}</p>
          {!query && tab === 'active' && (
            <button type="button" onClick={() => setIsNewOpen(true)} className="mt-4 h-10 px-4 rounded-xl bg-accent text-white text-sm font-semibold inline-flex items-center gap-2"><Plus className="w-4 h-4" /> Añadir artista</button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3">
          {artists.map(artist => {
            const isDrop = dropId === artist.id;
            return (
              <div
                key={artist.id}
                {...dropProps(artist)}
                onClick={() => open(artist)}
                onContextMenu={e => { e.preventDefault(); showMenu(e.clientX, e.clientY, menuFor(artist)); }}
                data-context="ignore"
                className={cn(
                  'group relative rounded-2xl border bg-surface-elevated p-4 pt-5 flex flex-col items-center text-center cursor-pointer transition-all hover:border-accent/40 hover:shadow-lg hover:shadow-accent/5',
                  isDrop ? 'border-accent ring-2 ring-accent/40 scale-[1.02] bg-accent/5' : isDraggingFiles ? 'border-dashed border-accent/50' : 'border-border',
                )}
              >
                <ArtistAvatar name={artist.name} photoUrl={artist.photoUrl} size="lg" className="w-16 h-16 md:w-[72px] md:h-[72px]" />
                <h3 className="mt-3 text-sm md:text-base font-bold text-text-primary truncate max-w-full group-hover:text-accent transition-colors">{artist.name}</h3>
                <p className="text-[11px] text-text-secondary truncate max-w-full mt-0.5">
                  {artist.genre?.length ? artist.genre.slice(0, 2).join(' · ') : (artist.activeProject && artist.activeProject !== 'Sin proyectos' ? artist.activeProject : 'Sin proyectos')}
                </p>
                <div className="mt-3 flex items-center justify-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity">
                  <Link href={`/artists/${artist.id}?tab=files`} onClick={e => e.stopPropagation()} className={cn(actionBtn, 'flex')} title="Archivos" aria-label="Archivos"><Files className="w-4 h-4" /></Link>
                  <button type="button" onClick={e => { e.stopPropagation(); openSmartUpload({ files: [], targetType: 'artist', artistId: artist.id }); }} className={cn(actionBtn, 'flex')} title="Subir archivos" aria-label="Subir archivos"><UploadCloud className="w-4 h-4" /></button>
                  <button type="button" onClick={e => { e.stopPropagation(); copyText(`${window.location.origin}/portal/${artist.id}`, 'Enlace del portal copiado'); }} className={cn(actionBtn, 'flex')} title="Copiar enlace del portal" aria-label="Copiar enlace del portal"><Globe className="w-4 h-4" /></button>
                  <button type="button" onClick={e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); showMenu(r.right - 220, r.bottom + 4, menuFor(artist)); }} className={cn(actionBtn, 'flex')} aria-label="Más acciones"><MoreVertical className="w-4 h-4" /></button>
                </div>
                {isDrop && (
                  <div className="pointer-events-none absolute inset-0 rounded-2xl flex items-center justify-center bg-accent/10 backdrop-blur-[1px]">
                    <span className="px-3 py-1.5 rounded-full bg-accent text-white text-xs font-bold shadow-lg inline-flex items-center gap-1.5 max-w-[90%]"><UploadCloud className="w-3.5 h-3.5 shrink-0" /><span className="truncate">Subir a {artist.name}</span></span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-surface-elevated divide-y divide-border/50 overflow-hidden">
          {artists.map(artist => {
            const isDrop = dropId === artist.id;
            return (
              <div
                key={artist.id}
                {...dropProps(artist)}
                onClick={() => open(artist)}
                onContextMenu={e => { e.preventDefault(); showMenu(e.clientX, e.clientY, menuFor(artist)); }}
                data-context="ignore"
                className={cn('group flex items-center gap-3 px-3 md:px-4 py-3 cursor-pointer transition-colors', isDrop ? 'bg-accent/15 ring-2 ring-inset ring-accent' : 'hover:bg-surface/70')}
              >
                <ArtistAvatar name={artist.name} photoUrl={artist.photoUrl} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-primary truncate">{artist.name}</p>
                  <p className="text-[11px] text-text-secondary truncate">
                    {[artist.genre?.slice(0, 2).join(' · '), artist.activeProject && artist.activeProject !== 'Sin proyectos' ? artist.activeProject : null].filter(Boolean).join(' — ') || 'Sin proyectos'}
                  </p>
                </div>
                <div className="hidden lg:flex items-center gap-4 text-xs text-text-secondary min-w-0 max-w-[40%]">
                  {artist.email && <span className="inline-flex items-center gap-1 truncate"><Mail className="w-3.5 h-3.5 shrink-0" />{artist.email}</span>}
                  {artist.phone && <span className="inline-flex items-center gap-1 whitespace-nowrap"><Phone className="w-3.5 h-3.5" />{artist.phone}</span>}
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <Link href={`/artists/${artist.id}?tab=files`} onClick={e => e.stopPropagation()} className={cn(actionBtn, 'hidden sm:flex')} title="Archivos" aria-label="Archivos"><Files className="w-4 h-4" /></Link>
                  <button type="button" onClick={e => { e.stopPropagation(); openSmartUpload({ files: [], targetType: 'artist', artistId: artist.id }); }} className={cn(actionBtn, 'hidden sm:flex')} title="Subir archivos" aria-label="Subir archivos"><UploadCloud className="w-4 h-4" /></button>
                  <button type="button" onClick={e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); showMenu(r.right - 220, r.bottom + 4, menuFor(artist)); }} className={cn(actionBtn, 'flex')} aria-label="Más acciones"><MoreVertical className="w-4 h-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
