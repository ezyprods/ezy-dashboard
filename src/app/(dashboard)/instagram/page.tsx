'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  Zap, CalendarClock, Smartphone, Image as ImageIcon, Film, GalleryHorizontalEnd, Loader2, ExternalLink, Pencil,
  Copy, XCircle, RotateCcw, Trash2, MoreHorizontal, AlertTriangle, CheckCircle2, Clock, Link2, Users, LogOut, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useArtists } from '@/lib/hooks/useArtists';
import { ArtistAvatar } from '@/components/ui/ArtistAvatar';
import { customConfirm } from '@/lib/dialog';
import { FORMAT_LABEL } from '@/lib/instagram/limits';
import type { IgAccountInfo, IgFormat, IgPostView, IgStatus } from '@/types/instagram';
import { InstagramIcon } from '@/components/instagram/InstagramIcon';
import {
  CHANGED_EVENT, disconnect, getBootstrap, listPosts, openComposer, processNow, removePost, updatePost,
} from '@/components/instagram/igClient';

type Tab = 'upcoming' | 'published' | 'problems' | 'cancelled';

const TABS: { id: Tab; label: string; statuses: IgStatus[] }[] = [
  { id: 'upcoming', label: 'Próximas', statuses: ['PENDING', 'PROCESSING'] },
  { id: 'published', label: 'Publicadas', statuses: ['PUBLISHED'] },
  { id: 'problems', label: 'Con problemas', statuses: ['FAILED'] },
  { id: 'cancelled', label: 'Canceladas', statuses: ['CANCELLED'] },
];

const FORMAT_STYLE: Record<IgFormat, { Icon: typeof Smartphone; cls: string }> = {
  STORY: { Icon: Smartphone, cls: 'text-amber-400 bg-amber-400/10' },
  POST: { Icon: ImageIcon, cls: 'text-sky-400 bg-sky-400/10' },
  REEL: { Icon: Film, cls: 'text-pink-400 bg-pink-400/10' },
  CAROUSEL: { Icon: GalleryHorizontalEnd, cls: 'text-violet-400 bg-violet-400/10' },
};

const STATUS_STYLE: Record<IgStatus, { label: string; cls: string }> = {
  PENDING: { label: 'Programada', cls: 'text-accent-light bg-accent/10' },
  PROCESSING: { label: 'Publicando…', cls: 'text-warning bg-warning/10' },
  PUBLISHED: { label: 'Publicada', cls: 'text-success bg-success/10' },
  FAILED: { label: 'Error', cls: 'text-error bg-error/10' },
  CANCELLED: { label: 'Cancelada', cls: 'text-text-secondary bg-surface-elevated' },
};

const ERRORS: Record<string, string> = {
  cancelled: 'Has cancelado la conexión con Instagram.',
  state: 'La conexión caducó. Vuelve a intentarlo.',
  code: 'Meta no devolvió el código de acceso.',
  no_accounts: 'No se compartió ninguna cuenta de Instagram. Al conectar, marca @ezyprods.',
  exchange: 'No se pudo completar la conexión con Instagram.',
  config: 'Faltan las claves de la app de Meta en el servidor.',
};

const dayFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
const timeFmt = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000);
  const txt = dayFmt.format(d);
  const prefix = diff === 0 ? 'Hoy' : diff === 1 ? 'Mañana' : diff === -1 ? 'Ayer' : '';
  return prefix ? `${prefix} · ${txt}` : txt.charAt(0).toUpperCase() + txt.slice(1);
}

function postWhen(p: IgPostView) {
  return p.status === 'PUBLISHED' && p.publishedAt ? p.publishedAt : p.scheduledFor;
}

function postTitle(p: IgPostView) {
  if (p.title) return p.title;
  const first = p.caption?.split('\n').find(l => l.trim());
  if (first) return first;
  return p.media[0]?.name?.replace(/\.[a-z0-9]{2,4}$/i, '') || FORMAT_LABEL[p.format];
}

// ─────────────────────────────────────────────────────────────────────────────

function AccountChip({ account, onChanged }: { account: IgAccountInfo | null; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  if (!account) return <div className="h-10 w-40 rounded-xl bg-surface animate-pulse" />;
  if (!account.connected) {
    return (
      <a href="/api/instagram/connect" className="h-10 px-4 rounded-xl border border-border bg-surface flex items-center gap-2 text-sm font-medium hover:border-accent">
        <span className="w-2 h-2 rounded-full bg-warning" />Conectar Instagram
      </a>
    );
  }
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)} className="h-10 pl-1.5 pr-3 rounded-xl border border-border bg-surface flex items-center gap-2 hover:border-text-secondary/40">
        {account.profilePictureUrl
          ? <img src={account.profilePictureUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
          : <span className="w-7 h-7 rounded-full bg-gradient-to-tr from-[#feda75] via-[#d62976] to-[#4f5bd5] flex items-center justify-center"><InstagramIcon className="w-4 h-4 text-white" /></span>}
        <span className="text-sm font-medium">@{account.username}</span>
        <span className={cn('w-2 h-2 rounded-full', account.error ? 'bg-error' : 'bg-success')} />
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-30 w-72 rounded-2xl border border-border bg-surface-elevated shadow-2xl p-3 space-y-3 animate-menu-in">
          <div className="text-xs text-text-secondary space-y-1">
            {account.error
              ? <p className="text-error flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{account.error}</p>
              : <p className="flex items-center gap-1.5 text-success"><CheckCircle2 className="w-3.5 h-3.5" />Conexión activa · el acceso no caduca</p>}
            {account.quotaTotal ? <p>Publicaciones por API en las últimas 24 h: <b className="text-text-primary">{account.quotaUsage}/{account.quotaTotal}</b></p> : null}
            {account.connectedAt && <p>Conectada el {new Date(account.connectedAt).toLocaleDateString('es-ES')}</p>}
          </div>
          <div className="flex flex-col gap-1">
            <a href={`https://instagram.com/${account.username}`} target="_blank" rel="noreferrer" className="h-9 px-2.5 rounded-lg text-sm flex items-center gap-2 hover:bg-surface"><ExternalLink className="w-4 h-4" />Abrir perfil</a>
            <a href="/api/instagram/connect" className="h-9 px-2.5 rounded-lg text-sm flex items-center gap-2 hover:bg-surface"><RefreshCw className="w-4 h-4" />Volver a conectar</a>
            <button type="button" onClick={async () => {
              setOpen(false);
              if (!(await customConfirm('Las publicaciones programadas esperarán hasta que vuelvas a conectar la cuenta.', '¿Desconectar Instagram?'))) return;
              await disconnect().catch(e => toast.error(e.message));
              onChanged();
            }} className="h-9 px-2.5 rounded-lg text-sm flex items-center gap-2 text-error hover:bg-error/10"><LogOut className="w-4 h-4" />Desconectar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function RowMenu({ items }: { items: { label: string; Icon: typeof Copy; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)} className="w-9 h-9 rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-elevated" aria-label="Más acciones">
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-20 min-w-48 rounded-xl border border-border bg-surface-elevated shadow-2xl p-1 animate-menu-in">
          {items.map(i => (
            <button key={i.label} type="button" onClick={() => { setOpen(false); i.onClick(); }}
              className={cn('w-full h-9 px-2.5 rounded-lg text-sm flex items-center gap-2 text-left', i.danger ? 'text-error hover:bg-error/10' : 'hover:bg-surface')}>
              <i.Icon className="w-4 h-4" />{i.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PostRow({ post, onAction }: { post: IgPostView; onAction: (p: IgPostView, a: string) => void }) {
  const { artists } = useArtists();
  const artist = post.links?.artistId ? artists.find(a => a.id === post.links.artistId) : undefined;
  const fmt = FORMAT_STYLE[post.format];
  const st = STATUS_STYLE[post.status];
  const canEdit = post.status === 'PENDING' || post.status === 'FAILED' || post.status === 'CANCELLED';
  const extra: Parameters<typeof RowMenu>[0]['items'] = [];
  if (canEdit) extra.push({ label: 'Editar', Icon: Pencil, onClick: () => onAction(post, 'edit') });
  extra.push({ label: 'Duplicar', Icon: Copy, onClick: () => onAction(post, 'duplicate') });
  if (post.status === 'PENDING') extra.push({ label: 'Cancelar', Icon: XCircle, onClick: () => onAction(post, 'cancel'), danger: true });
  if (post.status !== 'PROCESSING' && post.status !== 'PENDING') extra.push({ label: 'Quitar de la lista', Icon: Trash2, onClick: () => onAction(post, 'delete'), danger: true });

  return (
    <div className="group flex items-center gap-3 md:gap-4 p-3 md:p-3.5 rounded-2xl border border-border bg-surface hover:border-text-secondary/30 transition-colors"
      onDoubleClick={() => canEdit && onAction(post, 'edit')}>
      <div className={cn('relative shrink-0 rounded-xl overflow-hidden bg-surface-elevated border border-border/60',
        post.format === 'STORY' || post.format === 'REEL' ? 'w-11 h-[78px]' : 'w-16 h-20')}>
        {post.thumbUrl ? <img src={post.thumbUrl} alt="" loading="lazy" className="w-full h-full object-cover" /> : <fmt.Icon className="w-5 h-5 m-auto mt-6 text-text-secondary" />}
        {post.format === 'CAROUSEL' && <span className="absolute top-1 right-1 text-[9px] font-bold text-white bg-black/60 rounded px-1">{post.media.length}</span>}
      </div>

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base font-semibold tabular-nums text-text-primary">{timeFmt.format(new Date(postWhen(post)))}</span>
          <span className={cn('inline-flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-semibold', fmt.cls)}><fmt.Icon className="w-3 h-3" />{FORMAT_LABEL[post.format]}</span>
          <span className={cn('inline-flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-medium', st.cls)}>
            {post.status === 'PROCESSING' && <Loader2 className="w-3 h-3 animate-spin" />}{st.label}
          </span>
        </div>
        <p className="text-sm text-text-primary truncate">{postTitle(post)}</p>
        <div className="flex items-center gap-3 text-[11px] text-text-secondary min-w-0">
          {(artist || post.links?.artistName) && (
            <span className="flex items-center gap-1.5 min-w-0">
              <ArtistAvatar name={artist?.name || post.links.artistName || ''} photoUrl={artist?.photoUrl} size="sm" className="w-4 h-4 text-[8px]" />
              <span className="truncate">{artist?.name || post.links.artistName}</span>
            </span>
          )}
          {post.collaborators?.length > 0 && <span className="flex items-center gap-1 truncate"><Users className="w-3 h-3" />{post.collaborators.map(c => `@${c}`).join(' ')}</span>}
          {post.links?.files?.length ? <span className="flex items-center gap-1"><Link2 className="w-3 h-3" />{post.links.files.length}</span> : null}
        </div>
        {post.error && (
          <p className={cn('text-[11px] flex items-start gap-1', post.status === 'FAILED' ? 'text-error' : 'text-warning')}>
            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" /><span className="line-clamp-2">{post.error}</span>
          </p>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {post.status === 'PENDING' && (
          <button type="button" onClick={() => onAction(post, 'publishNow')} className="hidden sm:flex h-9 px-3 rounded-lg border border-border text-xs font-semibold items-center gap-1.5 hover:border-accent hover:text-accent-light">
            <Zap className="w-3.5 h-3.5" />Publicar ya
          </button>
        )}
        {post.status === 'FAILED' && (
          <button type="button" onClick={() => onAction(post, 'retry')} className="h-9 px-3 rounded-lg border border-border text-xs font-semibold flex items-center gap-1.5 hover:border-accent hover:text-accent-light">
            <RotateCcw className="w-3.5 h-3.5" />Reintentar
          </button>
        )}
        {post.status === 'CANCELLED' && (
          <button type="button" onClick={() => onAction(post, 'reactivate')} className="h-9 px-3 rounded-lg border border-border text-xs font-semibold flex items-center gap-1.5 hover:border-accent hover:text-accent-light">
            <RotateCcw className="w-3.5 h-3.5" />Reactivar
          </button>
        )}
        {post.status === 'PUBLISHED' && post.permalink && (
          <a href={post.permalink} target="_blank" rel="noreferrer" className="h-9 px-3 rounded-lg border border-border text-xs font-semibold flex items-center gap-1.5 hover:border-accent hover:text-accent-light">
            <ExternalLink className="w-3.5 h-3.5" /><span className="hidden sm:inline">Ver en Instagram</span>
          </a>
        )}
        {post.status === 'PENDING' && (
          <button type="button" onClick={() => onAction(post, 'edit')} className="hidden md:flex w-9 h-9 rounded-lg items-center justify-center text-text-secondary hover:text-text-primary hover:bg-surface-elevated" aria-label="Editar"><Pencil className="w-4 h-4" /></button>
        )}
        {post.status !== 'PROCESSING' && <RowMenu items={post.status === 'PENDING' ? [{ label: 'Publicar ya', Icon: Zap, onClick: () => onAction(post, 'publishNow') }, ...extra] : extra} />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function InstagramPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { activeArtists } = useArtists();
  const [account, setAccount] = useState<IgAccountInfo | null>(null);
  const [posts, setPosts] = useState<IgPostView[] | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('upcoming');
  const [artistFilter, setArtistFilter] = useState('');

  const loadAccount = useCallback(() => {
    getBootstrap(true).then(b => setAccount(b.account)).catch(e => setError(e.message));
  }, []);
  const loadPosts = useCallback(() => {
    listPosts().then(p => { setPosts(p); setError(''); }).catch(e => setError(e.message));
  }, []);

  useEffect(() => { loadAccount(); loadPosts(); }, [loadAccount, loadPosts]);

  useEffect(() => {
    const onChange = () => loadPosts();
    window.addEventListener(CHANGED_EVENT, onChange);
    return () => window.removeEventListener(CHANGED_EVENT, onChange);
  }, [loadPosts]);

  // Resultado de la conexión con Meta
  useEffect(() => {
    const connected = params.get('connected');
    const err = params.get('error');
    if (!connected && !err) return;
    if (connected) toast.success(`Instagram conectado${connected !== '1' ? `: @${connected}` : ''}`);
    if (err) toast.error(ERRORS[err] || 'No se pudo conectar Instagram', { description: params.get('msg') || undefined });
    router.replace('/instagram');
  }, [params, router]);

  // Mientras la página está abierta, empuja lo que ya toca o está en curso
  const pendingWork = useMemo(() => {
    const now = Date.now();
    return (posts || []).some(p => p.status === 'PROCESSING' || (p.status === 'PENDING' && new Date(p.scheduledFor).getTime() <= now));
  }, [posts]);
  useEffect(() => {
    if (!account?.connected) return;
    const every = pendingWork ? 12000 : 60000;
    const t = setInterval(async () => {
      if (document.hidden) return;
      if (pendingWork) await processNow().catch(() => null);
      loadPosts();
    }, every);
    return () => clearInterval(t);
  }, [pendingWork, account?.connected, loadPosts]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { upcoming: 0, published: 0, problems: 0, cancelled: 0 };
    for (const p of posts || []) for (const t of TABS) if (t.statuses.includes(p.status)) c[t.id]++;
    return c;
  }, [posts]);

  const visible = useMemo(() => {
    const statuses = TABS.find(t => t.id === tab)!.statuses;
    const list = (posts || []).filter(p => statuses.includes(p.status) && (!artistFilter || p.links?.artistId === artistFilter));
    list.sort((a, b) => (tab === 'upcoming' ? 1 : -1) * postWhen(a).localeCompare(postWhen(b)));
    const groups: { key: string; label: string; items: IgPostView[] }[] = [];
    for (const p of list) {
      const k = dayKey(postWhen(p));
      let g = groups[groups.length - 1];
      if (!g || g.key !== k) { g = { key: k, label: dayLabel(postWhen(p)), items: [] }; groups.push(g); }
      g.items.push(p);
    }
    return groups;
  }, [posts, tab, artistFilter]);

  const artistsWithPosts = useMemo(() => {
    const ids = new Set((posts || []).map(p => p.links?.artistId).filter(Boolean));
    return activeArtists.filter(a => ids.has(a.id));
  }, [posts, activeArtists]);

  const next = useMemo(() => (posts || []).filter(p => p.status === 'PENDING').sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))[0], [posts]);

  const onAction = async (post: IgPostView, action: string) => {
    try {
      if (action === 'edit') return openComposer({ post });
      if (action === 'duplicate') return openComposer({ duplicate: post });
      if (action === 'delete') {
        if (!(await customConfirm('Se quita de esta lista. No se borra de Instagram.', '¿Quitar la publicación?'))) return;
        await removePost(post.id);
        toast.success('Quitada de la lista');
      } else if (action === 'cancel') {
        await updatePost(post.id, { action: 'cancel' });
        toast.success('Publicación cancelada');
      } else if (action === 'publishNow' || action === 'retry' || action === 'reactivate') {
        const r = await updatePost(post.id, { action: action as 'publishNow' | 'retry' | 'reactivate' });
        toast.success(r.publishing ? 'Publicando en Instagram…' : 'Vuelve a estar programada');
      }
      loadPosts();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#feda75] via-[#d62976] to-[#4f5bd5] flex items-center justify-center shadow-lg shadow-[#d62976]/20">
            <InstagramIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-text-primary">Instagram</h1>
            <p className="text-text-secondary mt-0.5 text-sm">
              {next ? <>Próxima: <b className="text-text-primary font-medium">{dayLabel(next.scheduledFor).split(' · ')[0]} {timeFmt.format(new Date(next.scheduledFor))}</b> · {FORMAT_LABEL[next.format]}</> : 'Publica al momento o programa tu contenido.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <AccountChip account={account} onChanged={loadAccount} />
          <button type="button" onClick={() => openComposer({ mode: 'now' })}
            className="h-10 px-4 rounded-xl border border-border bg-surface text-sm font-semibold flex items-center gap-2 hover:border-accent hover:text-accent-light">
            <Zap className="w-4 h-4" />Publicar ahora
          </button>
          <button type="button" onClick={() => openComposer({ mode: 'schedule' })}
            className="h-10 px-4 rounded-xl bg-accent text-white text-sm font-semibold flex items-center gap-2 shadow-lg shadow-accent/25 hover:bg-accent/90">
            <CalendarClock className="w-4 h-4" />Programar
          </button>
        </div>
      </div>

      {account && !account.connected && !account.missingConfig && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl border border-accent/30 bg-accent/5">
          <InstagramIcon className="w-5 h-5 text-accent-light shrink-0" />
          <p className="text-sm text-text-primary flex-1">Conecta <b>@ezyprods</b> para empezar a publicar. Entrarás con Facebook y elegirás el portfolio Ezyprods: es un paso de un minuto y no caduca.</p>
          <a href="/api/instagram/connect" className="h-10 px-4 rounded-xl bg-accent text-white text-sm font-semibold flex items-center justify-center">Conectar</a>
        </div>
      )}
      {account?.missingConfig && (
        <div className="flex items-center gap-2 p-4 rounded-2xl border border-error/30 bg-error/5 text-sm"><AlertTriangle className="w-4 h-4 text-error" />Faltan las claves de Meta (META_APP_ID, META_APP_SECRET, META_LOGIN_CONFIG_ID) en el servidor.</div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex gap-1 p-1 rounded-xl bg-surface border border-border overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}
              className={cn('h-8 px-3 rounded-lg text-sm font-medium whitespace-nowrap flex items-center gap-1.5 transition-colors',
                tab === t.id ? 'bg-surface-elevated text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary')}>
              {t.label}
              {counts[t.id] > 0 && <span className={cn('text-[10px] font-bold px-1.5 rounded-full', t.id === 'problems' ? 'bg-error/15 text-error' : 'bg-border text-text-secondary')}>{counts[t.id]}</span>}
            </button>
          ))}
        </div>
        {artistsWithPosts.length > 0 && (
          <select value={artistFilter} onChange={e => setArtistFilter(e.target.value)}
            className="h-10 px-3 rounded-xl bg-surface border border-border text-sm focus:outline-none focus:border-accent">
            <option value="">Todos los artistas</option>
            {artistsWithPosts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
      </div>

      {error && <p className="text-sm text-error flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{error}</p>}

      {!posts ? (
        <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-24 rounded-2xl bg-surface animate-pulse" />)}</div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-surface mx-auto flex items-center justify-center">
            {tab === 'upcoming' ? <Clock className="w-5 h-5 text-text-secondary" /> : <CheckCircle2 className="w-5 h-5 text-text-secondary" />}
          </div>
          <p className="text-text-secondary text-sm">
            {tab === 'upcoming' ? 'No tienes nada programado.' : tab === 'published' ? 'Aún no se ha publicado nada desde aquí.' : tab === 'problems' ? 'Ninguna publicación ha fallado.' : 'No hay publicaciones canceladas.'}
          </p>
          {tab === 'upcoming' && (
            <button type="button" onClick={() => openComposer({ mode: 'schedule' })} className="h-10 px-4 rounded-xl bg-accent text-white text-sm font-semibold inline-flex items-center gap-2">
              <CalendarClock className="w-4 h-4" />Programar la primera
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {visible.map(g => (
            <section key={g.key} className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-text-secondary px-1">{g.label}</h2>
              <div className="space-y-2">{g.items.map(p => <PostRow key={p.id} post={p} onAction={onAction} />)}</div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export default function InstagramPage() {
  return (
    <Suspense fallback={null}>
      <InstagramPageInner />
    </Suspense>
  );
}
