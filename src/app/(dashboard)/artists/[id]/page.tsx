'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, AlertCircle, Loader2, Mail, Phone, MessageCircle, Edit3, Globe, Copy, HardDrive, Headphones,
  FolderPlus, UploadCloud, MoreHorizontal, Files, FolderKanban, Target, Table2, LayoutTemplate, ChevronRight,
} from 'lucide-react';
import type { Artist, Campaign } from '@/types';
import { useProjects } from '@/lib/hooks/useProjects';
import { FileExplorer } from '@/components/explorer/FileExplorer';
import { ArtistPortalTab } from '@/components/artists/ArtistPortalTab';
import { ArtistProjectsTab } from '@/components/artists/ArtistProjectsTab';
import { ArtistMatricesTab } from '@/components/artists/ArtistMatricesTab';
import { ArtistCampaignsTab } from '@/components/artists/ArtistCampaignsTab';
import { NewProjectModal } from '@/components/projects/NewProjectModal';
import { EditArtistModal } from '@/components/artists/EditArtistModal';
import { ArtistAvatar } from '@/components/ui/ArtistAvatar';
import { useContextMenu } from '@/lib/contexts/ContextMenuContext';
import { useDropContext, useGlobalDragDrop } from '@/lib/contexts/GlobalDragDropContext';
import { useIndex, loadIndex } from '@/components/explorer/driveStore';
import { formatBytes } from '@/components/explorer/fileKinds';
import { copyText } from '@/components/explorer/explorerUtils';
import { matrixProgress } from '@/lib/matrixStats';
import { cn, getWhatsAppUrl } from '@/lib/utils';

const TABS = [
  { key: 'files', label: 'Archivos', icon: Files },
  { key: 'projects', label: 'Proyectos', icon: FolderKanban },
  { key: 'campaigns', label: 'Campañas', icon: Target },
  { key: 'matrices', label: 'Matrices', icon: Table2 },
  { key: 'portal', label: 'Portal', icon: LayoutTemplate },
] as const;

type TabKey = typeof TABS[number]['key'];

export default function ArtistDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const artistId = params.id as string;
  const { showMenu } = useContextMenu();
  const { openSmartUpload } = useGlobalDragDrop();

  const [artist, setArtist] = useState<Artist | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [matrices, setMatrices] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  const tabParam = searchParams.get('tab') as TabKey | null;
  const activeTab: TabKey = TABS.some(t => t.key === tabParam) ? (tabParam as TabKey) : 'files';

  const { projects, isLoading: projectsLoading, fetchProjects } = useProjects(artistId);
  const index = useIndex(artistId);

  // ─── Data ────────────────────────────────────────────────────────────────
  const fetchArtist = useCallback(async () => {
    try {
      const res = await fetch(`/api/artists/${artistId}`);
      if (!res.ok) throw new Error('No se pudo cargar el artista');
      const data = await res.json();
      setArtist(data.artist);
      setError(null);
      try { localStorage.setItem(`accessed_${artistId}`, Date.now().toString()); } catch {}
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [artistId]);

  const fetchMatrices = useCallback(async () => {
    try {
      const res = await fetch(`/api/artists/${artistId}/matrices`);
      if (res.ok) setMatrices((await res.json()).matrices || []);
    } catch {}
  }, [artistId]);

  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await fetch(`/api/artists/${artistId}/campaigns`);
      if (res.ok) setCampaigns((await res.json()).campaigns || []);
    } catch {}
  }, [artistId]);

  useEffect(() => {
    setIsLoading(true);
    setArtist(null);
    fetchArtist();
    fetchMatrices();
    fetchCampaigns();
  }, [fetchArtist, fetchMatrices, fetchCampaigns]);

  // Deep link from the global right-click menu: /artists/[id]?newProject=true
  useEffect(() => {
    if (searchParams.get('newProject') !== 'true') return;
    setIsNewProjectOpen(true);
    const url = new URL(window.location.href);
    url.searchParams.delete('newProject');
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
  }, [searchParams]);

  const setTab = (key: TabKey) => {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', key);
    if (key !== 'files') ['folderId', 'view', 'fileId', 'highlight'].forEach(p => url.searchParams.delete(p));
    if (key !== 'matrices') url.searchParams.delete('matrixId');
    window.history.replaceState(null, '', `${url.pathname}?${url.searchParams.toString()}`);
    if (key === 'projects') fetchProjects();
    if (key === 'matrices' || key === 'projects') fetchMatrices();
    if (key === 'campaigns' || key === 'projects') fetchCampaigns();
  };

  // ─── Sticky tab bar height (the file explorer sticks right below it) ────
  const tabsRef = useRef<HTMLDivElement>(null);
  const [tabsHeight, setTabsHeight] = useState(0);
  useLayoutEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    const update = () => setTabsHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [artist]);

  // ─── Drag & drop anywhere on the page uploads to this artist ────────────
  const currentFolderId = activeTab === 'files' ? searchParams.get('folderId') : null;
  useDropContext(artist ? {
    mode: 'artist',
    artistId,
    label: `Subir a ${artist.name}`,
    hint: activeTab === 'files'
      ? 'Suéltalo sobre una carpeta para elegir el destino exacto'
      : activeTab === 'projects'
        ? 'Suéltalo sobre un proyecto, o en cualquier parte para organizarlo automáticamente'
        : 'Se detectará el proyecto y el tipo de cada archivo',
    folderId: currentFolderId || undefined,
    onFinished: () => { loadIndex(artistId, { force: true }); fetchProjects(); },
  } : null);

  const stats = useMemo(() => {
    const files = index.items.filter(i => !i.isFolder);
    return {
      ready: index.items.length > 0 || index.status === 'ready',
      files: files.length,
      audio: files.filter(f => f.kind === 'audio').length,
      bytes: files.reduce((s, f) => s + (f.size || 0), 0),
    };
  }, [index.items, index.status]);

  const activeProjects = projects.filter(p => (p.status || 'active') === 'active').length;
  const activeMatrices = matrices.filter(m => !matrixProgress(m).completed).length;

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="h-8 w-40 rounded-lg bg-surface-elevated animate-pulse" />
        <div className="h-40 rounded-2xl bg-surface-elevated border border-border animate-pulse" />
        <div className="h-[420px] rounded-2xl bg-surface-elevated border border-border animate-pulse" />
      </div>
    );
  }

  if (error || !artist) {
    return (
      <div className="rounded-2xl border border-error/20 bg-surface-elevated p-10 text-center max-w-lg mx-auto mt-10">
        <AlertCircle className="w-12 h-12 text-error mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">No se pudo abrir el artista</h2>
        <p className="text-text-secondary text-sm mb-6">{error || 'Artista no encontrado'}</p>
        <div className="flex justify-center gap-2">
          <button type="button" onClick={() => { setIsLoading(true); fetchArtist(); }} className="h-10 px-4 rounded-xl border border-border text-sm font-medium hover:bg-surface">Reintentar</button>
          <button type="button" onClick={() => router.push('/artists')} className="h-10 px-4 rounded-xl bg-accent text-white text-sm font-semibold">Volver a Artistas</button>
        </div>
      </div>
    );
  }

  const portalUrl = typeof window !== 'undefined' ? `${window.location.origin}/portal/${artistId}` : `/portal/${artistId}`;
  const driveFolderId = artist.driveFolderId || artistId;

  const moreMenu = (x: number, y: number) => showMenu(x, y, [
    { heading: artist.name },
    { label: 'Editar perfil', icon: 'Edit3', action: () => setIsEditOpen(true) },
    { label: 'Nuevo proyecto', icon: 'FolderPlus', action: () => setIsNewProjectOpen(true) },
    { label: 'Subir archivos', icon: 'UploadCloud', action: () => openSmartUpload({ files: [], targetType: 'artist', artistId }) },
    { separator: true },
    { label: 'Abrir portal del artista', icon: 'ExternalLink', action: () => window.open(`/portal/${artistId}`, '_blank', 'noopener') },
    { label: 'Copiar enlace del portal', icon: 'Copy', action: () => copyText(portalUrl, 'Enlace del portal copiado') },
    { label: 'Gestor de previews', icon: 'Music', action: () => router.push(`/artists/${artistId}/previews`) },
    { label: 'Abrir carpeta en Google Drive', icon: 'HardDrive', action: () => window.open(`https://drive.google.com/drive/folders/${driveFolderId}`, '_blank', 'noopener') },
  ]);

  return (
    <div className="space-y-5 md:space-y-6 animate-fade-in">
      <NewProjectModal isOpen={isNewProjectOpen} onClose={() => { setIsNewProjectOpen(false); fetchProjects(); loadIndex(artistId, { force: true }); }} artistId={artistId} />
      <EditArtistModal
        isOpen={isEditOpen}
        artist={artist}
        onClose={(saved, optimistic) => {
          setIsEditOpen(false);
          if (saved && optimistic) setArtist(prev => (prev ? { ...prev, ...optimistic } : prev));
        }}
      />

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm -mb-1">
        <Link href="/artists" className="inline-flex items-center gap-1.5 h-9 pr-2 text-text-secondary hover:text-text-primary">
          <ArrowLeft className="w-4 h-4" /> Artistas
        </Link>
        <ChevronRight className="w-4 h-4 text-text-secondary/50" />
        <span className="font-semibold text-text-primary truncate">{artist.name}</span>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-surface-elevated p-4 md:p-6">
        <div className="absolute -top-24 -right-16 w-72 h-72 rounded-full bg-accent/10 blur-[80px] pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center gap-5">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <ArtistAvatar name={artist.name} photoUrl={artist.photoUrl} size="xl" className="w-16 h-16 md:w-20 md:h-20 text-xl" />
            <div className="min-w-0 space-y-1.5">
              <h1 className="text-2xl md:text-3xl font-black text-text-primary tracking-tight truncate">{artist.name}</h1>
              {artist.genre?.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {artist.genre.slice(0, 4).map(g => <span key={g} className="h-6 px-2 rounded-full bg-surface border border-border text-[11px] font-medium text-text-secondary inline-flex items-center">{g}</span>)}
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
                {artist.email && <a href={`mailto:${artist.email}`} className="inline-flex items-center gap-1.5 hover:text-accent min-w-0"><Mail className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{artist.email}</span></a>}
                {artist.phone && <a href={`tel:${artist.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1.5 hover:text-accent"><Phone className="w-3.5 h-3.5" />{artist.phone}</a>}
                {artist.phone && <a href={getWhatsAppUrl(artist.phone, `Hola ${artist.name}!`)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-[#25D366]"><MessageCircle className="w-3.5 h-3.5" />WhatsApp</a>}
                {!artist.email && !artist.phone && <button type="button" onClick={() => setIsEditOpen(true)} className="text-accent font-medium">Añadir email o teléfono</button>}
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 lg:w-[340px] shrink-0">
            <button type="button" onClick={() => setTab('projects')} className="rounded-xl bg-surface border border-border px-3 py-2.5 text-left hover:border-accent/40 transition-colors">
              <p className="text-lg font-black text-text-primary leading-none">{projectsLoading && projects.length === 0 ? '…' : activeProjects}</p>
              <p className="text-[10px] uppercase tracking-widest font-bold text-text-secondary mt-1">Proyectos</p>
            </button>
            <button type="button" onClick={() => setTab('files')} className="rounded-xl bg-surface border border-border px-3 py-2.5 text-left hover:border-accent/40 transition-colors">
              <p className="text-lg font-black text-text-primary leading-none">{stats.ready ? stats.files : '…'}</p>
              <p className="text-[10px] uppercase tracking-widest font-bold text-text-secondary mt-1 truncate">{stats.ready ? formatBytes(stats.bytes) : 'Archivos'}</p>
            </button>
            <button type="button" onClick={() => setTab('matrices')} className="rounded-xl bg-surface border border-border px-3 py-2.5 text-left hover:border-accent/40 transition-colors">
              <p className="text-lg font-black text-text-primary leading-none">{activeMatrices}</p>
              <p className="text-[10px] uppercase tracking-widest font-bold text-text-secondary mt-1">Matrices</p>
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="relative flex items-center gap-2 mt-5 overflow-x-auto scrollbar-hide -mx-1 px-1" data-no-swipe>
          <button type="button" onClick={() => openSmartUpload({ files: [], targetType: 'artist', artistId })} className="h-10 px-4 rounded-xl bg-accent text-white text-sm font-semibold inline-flex items-center gap-2 shrink-0 hover:bg-accent/90 shadow-sm shadow-accent/20">
            <UploadCloud className="w-4 h-4" /> Subir
          </button>
          <button type="button" onClick={() => setIsNewProjectOpen(true)} className="h-10 px-3.5 rounded-xl border border-border text-sm font-medium inline-flex items-center gap-2 shrink-0 hover:bg-surface">
            <FolderPlus className="w-4 h-4" /> Nuevo proyecto
          </button>
          <div className="flex items-center h-10 rounded-xl border border-border overflow-hidden shrink-0">
            <a href={`/portal/${artistId}`} target="_blank" rel="noopener noreferrer" className="h-full px-3.5 inline-flex items-center gap-2 text-sm font-medium hover:bg-surface">
              <Globe className="w-4 h-4 text-accent" /> Portal
            </a>
            <button type="button" onClick={() => copyText(portalUrl, 'Enlace del portal copiado')} className="h-full px-3 border-l border-border hover:bg-surface" aria-label="Copiar enlace del portal" title="Copiar enlace del portal">
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <Link href={`/artists/${artistId}/previews`} className="hidden sm:inline-flex h-10 px-3.5 rounded-xl border border-border text-sm font-medium items-center gap-2 shrink-0 hover:bg-surface">
            <Headphones className="w-4 h-4" /> Previews
          </Link>
          <a href={`https://drive.google.com/drive/folders/${driveFolderId}`} target="_blank" rel="noopener noreferrer" className="hidden md:inline-flex h-10 px-3.5 rounded-xl border border-border text-sm font-medium items-center gap-2 shrink-0 hover:bg-surface">
            <HardDrive className="w-4 h-4" /> Drive
          </a>
          <button type="button" onClick={() => setIsEditOpen(true)} className="hidden md:inline-flex h-10 px-3.5 rounded-xl border border-border text-sm font-medium items-center gap-2 shrink-0 hover:bg-surface">
            <Edit3 className="w-4 h-4" /> Editar
          </button>
          <button type="button" onClick={e => { const r = e.currentTarget.getBoundingClientRect(); moreMenu(r.right - 230, r.bottom + 6); }} className="h-10 w-10 rounded-xl border border-border inline-flex items-center justify-center shrink-0 hover:bg-surface ml-auto" aria-label="Más acciones">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Tabs (sticky) */}
      <div ref={tabsRef} className="sticky -top-4 md:-top-6 z-30 -mx-4 md:-mx-6 px-4 md:px-6 pt-4 md:pt-6 -mt-4 md:-mt-6 bg-background/90 backdrop-blur-xl border-b border-border/60">
        <div role="tablist" className="flex items-center gap-1 overflow-x-auto scrollbar-hide" data-no-swipe>
          {TABS.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            const badge = tab.key === 'projects' ? activeProjects : tab.key === 'campaigns' ? campaigns.length : tab.key === 'matrices' ? activeMatrices : 0;
            return (
              <button
                key={tab.key}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => setTab(tab.key)}
                className={cn(
                  'relative h-12 px-3 md:px-4 inline-flex items-center gap-2 text-sm font-medium whitespace-nowrap transition-colors shrink-0',
                  active ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary',
                )}
              >
                <Icon className={cn('w-4 h-4', active && 'text-accent')} />
                {tab.label}
                {badge > 0 && <span className={cn('text-[10px] font-bold px-1.5 rounded-full', active ? 'bg-accent text-white' : 'bg-surface-elevated text-text-secondary')}>{badge}</span>}
                {active && <span className="absolute left-2 right-2 bottom-0 h-0.5 rounded-full bg-accent" />}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'files' && (
        <FileExplorer
          rootId={driveFolderId}
          rootName={artist.name}
          scope={{ type: 'artist', artistId, artistEmail: artist.email || undefined }}
          stickyTop={tabsHeight}
        />
      )}

      {activeTab === 'projects' && (
        <ArtistProjectsTab
          artistId={artistId}
          artistName={artist.name}
          projects={projects}
          isLoading={projectsLoading}
          matrices={matrices}
          campaigns={campaigns}
          onRefresh={fetchProjects}
          onNewProject={() => setIsNewProjectOpen(true)}
          onMatricesChanged={fetchMatrices}
        />
      )}

      {activeTab === 'campaigns' && (
        <ArtistCampaignsTab
          artistId={artistId}
          projects={projects}
          matrices={matrices}
          onCampaignsChanged={setCampaigns}
          onMatricesChanged={fetchMatrices}
        />
      )}

      {activeTab === 'matrices' && (
        <ArtistMatricesTab artistId={artistId} artistName={artist.name} projects={projects} onMatricesChanged={setMatrices} />
      )}

      {activeTab === 'portal' && <ArtistPortalTab artistId={artistId} artistName={artist.name} projects={projects} />}

      {projectsLoading && activeTab === 'projects' && projects.length > 0 && (
        <p className="text-[11px] text-text-secondary flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Actualizando proyectos…</p>
      )}
    </div>
  );
}
