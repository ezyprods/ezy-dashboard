'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useArtists } from '@/lib/hooks/useArtists';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { useAudio } from '@/lib/contexts/AudioContext';
import {
  Search, User, Calendar, Settings, Moon, Sun,
  Plus, Music, File as FileIcon, Loader2,
  ChevronRight, Play, ExternalLink, LayoutDashboard, Grid, MessageSquare,
} from 'lucide-react';

interface SearchResult {
  artists: { id: string; name: string }[];
  audioFiles: { id: string; name: string; mimeType: string; modifiedTime?: string; bpm?: string | null; key?: string | null; isAudio: boolean }[];
  otherFiles: { id: string; name: string; mimeType: string; modifiedTime?: string; webViewLink?: string; isAudio: boolean }[];
}

function getBpmColor(bpm: number): string {
  if (bpm < 80) return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
  if (bpm < 110) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
  if (bpm < 140) return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
  return 'text-red-400 bg-red-500/10 border-red-500/20';
}

export function CommandMenu() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<SearchResult | null>(null);
  const [isSearching, setIsSearching] = React.useState(false);
  const searchTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const { activeArtists } = useArtists();
  const { theme, setTheme } = useTheme();
  const { playTrack } = useAudio();

  const [isMac, setIsMac] = React.useState(true);

  React.useEffect(() => {
    setIsMac(typeof window !== 'undefined' && navigator.userAgent.toUpperCase().indexOf('MAC') >= 0);
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  // Debounced search
  React.useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!query || query.trim().length < 2) {
      setResults(null);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data);
        }
      } catch (e) {
        console.error('Search error:', e);
      } finally {
        setIsSearching(false);
      }
    }, 350);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [query]);

  const runCommand = React.useCallback((command: () => void) => {
    setOpen(false);
    setQuery('');
    setResults(null);
    command();
  }, []);

  const handleClose = () => {
    setOpen(false);
    setQuery('');
    setResults(null);
  };

  const hasResults = results && (
    results.artists.length > 0 || results.audioFiles.length > 0 || results.otherFiles.length > 0
  );

  const isQueryActive = query.trim().length >= 2;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center justify-between flex-1 md:max-w-md px-3 py-2 text-sm text-text-secondary bg-surface border border-border rounded-xl hover:border-accent/50 hover:bg-surface-elevated transition-all mx-2 md:mx-4 group"
      >
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 group-hover:text-accent transition-colors" />
          <span className="hidden xs:inline text-text-secondary/70">Buscar artistas, proyectos, archivos...</span>
          <span className="xs:hidden text-text-secondary/70">Buscar...</span>
        </div>
        <kbd className="hidden lg:inline-flex items-center font-sans text-[10px] font-medium text-text-secondary bg-surface-elevated border border-border rounded px-1.5 shadow-sm">
          {isMac ? '⌘K' : 'Ctrl K'}
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center md:pt-[10vh] md:px-4 bg-background/60 backdrop-blur-sm animate-fade-in"
          onClick={handleClose}
        >
          <div
            className="w-full h-full md:h-auto max-w-2xl bg-surface/95 backdrop-blur-xl md:border border-border/60 md:rounded-2xl shadow-2xl overflow-hidden ring-1 ring-black/10 flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Search Input */}
            <div className="flex items-center gap-3 border-b border-border/50 px-4 py-3">
              {isSearching ? (
                <Loader2 className="w-5 h-5 text-accent shrink-0 animate-spin" />
              ) : (
                <Search className="w-5 h-5 text-accent shrink-0" />
              )}
              <input
                autoFocus
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar artistas, archivos, proyectos..."
                className="flex-1 bg-transparent border-0 outline-none text-text-primary placeholder:text-text-secondary/50 text-base font-medium"
              />
              <div className="flex items-center gap-2 shrink-0">
                {query && (
                  <button onClick={() => setQuery('')} className="text-text-secondary hover:text-text-primary transition-colors p-1 rounded">
                    <span className="text-xs">✕</span>
                  </button>
                )}
                <kbd className="hidden sm:inline-flex items-center font-sans text-[10px] font-medium text-text-secondary bg-surface-elevated border border-border rounded px-1.5 h-5 shadow-sm">
                  ESC
                </kbd>
              </div>
            </div>

            {/* Results / Default Content */}
            <div className="max-h-[65vh] overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-border">

              {/* ── Dynamic Search Results ── */}
              {isQueryActive && (
                <>
                  {isSearching && !results && (
                    <div className="py-12 text-center text-text-secondary flex flex-col items-center gap-3">
                      <Loader2 className="w-6 h-6 animate-spin text-accent" />
                      <p className="text-sm">Buscando en toda la plataforma...</p>
                    </div>
                  )}

                  {!isSearching && !hasResults && results && (
                    <div className="py-12 text-center flex flex-col items-center gap-3 text-text-secondary">
                      <Search className="w-8 h-8 opacity-30" />
                      <p className="text-sm">Sin resultados para <strong className="text-text-primary">"{query}"</strong></p>
                      <p className="text-xs opacity-60">Prueba con otro término de búsqueda</p>
                    </div>
                  )}

                  {results?.artists && results.artists.length > 0 && (
                    <div className="mb-1">
                      <p className="text-[10px] font-bold text-text-secondary/60 uppercase tracking-widest px-3 py-2">Artistas</p>
                      {results.artists.map(artist => (
                        <button
                          key={artist.id}
                          onClick={() => runCommand(() => router.push(`/artists/${artist.id}`))}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-accent/5 hover:text-accent transition-all group text-left"
                        >
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent/30 to-accent/10 border border-accent/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                            <User className="w-4 h-4 text-accent" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-text-primary truncate">{artist.name}</p>
                            <p className="text-[10px] text-text-secondary">Ver perfil del artista</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}

                  {results?.audioFiles && results.audioFiles.length > 0 && (
                    <div className="mb-1">
                      <p className="text-[10px] font-bold text-text-secondary/60 uppercase tracking-widest px-3 py-2">Archivos de Audio</p>
                      {results.audioFiles.map(file => {
                        const bpmNum = file.bpm ? parseInt(String(file.bpm)) : null;
                        return (
                          <button
                            key={file.id}
                            onClick={() => runCommand(() => {
                              playTrack({ id: file.id, name: file.name, url: `/api/audio/${file.id}`, artistName: '' });
                            })}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-elevated transition-all group text-left"
                          >
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500/20 to-purple-500/5 border border-purple-500/20 flex items-center justify-center shrink-0">
                              <Music className="w-4 h-4 text-purple-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-text-primary truncate">{file.name.replace(/\.[^/.]+$/, '')}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {bpmNum && (
                                  <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded border ${getBpmColor(bpmNum)}`}>
                                    {bpmNum} BPM
                                  </span>
                                )}
                                {file.key && (
                                  <span className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded border text-blue-400 bg-blue-500/10 border-blue-500/20">
                                    {file.key}
                                  </span>
                                )}
                                {!bpmNum && !file.key && (
                                  <span className="text-[10px] text-text-secondary/60">Reproducir audio</span>
                                )}
                              </div>
                            </div>
                            <Play className="w-4 h-4 text-accent opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {results?.otherFiles && results.otherFiles.length > 0 && (
                    <div className="mb-1">
                      <p className="text-[10px] font-bold text-text-secondary/60 uppercase tracking-widest px-3 py-2">Otros Archivos</p>
                      {results.otherFiles.map(file => (
                        <button
                          key={file.id}
                          onClick={() => file.webViewLink ? window.open(file.webViewLink, '_blank') : null}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-elevated transition-all group text-left"
                        >
                          <div className="w-8 h-8 rounded-lg bg-surface-elevated border border-border/50 flex items-center justify-center shrink-0">
                            <FileIcon className="w-4 h-4 text-text-secondary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-text-primary truncate">{file.name}</p>
                            <p className="text-[10px] text-text-secondary">Abrir en Drive</p>
                          </div>
                          <ExternalLink className="w-4 h-4 text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* ── Default (no query): Navigation + Actions + Artists ── */}
              {!isQueryActive && (
                <>
                  {/* Quick navigation */}
                  <div className="mb-1">
                    <p className="text-[10px] font-bold text-text-secondary/60 uppercase tracking-widest px-3 py-2">Navegación</p>
                    {[
                      { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', desc: 'Centro de Comando' },
                      { label: 'Artistas', icon: User, path: '/artists', desc: 'Todos los artistas' },
                      { label: 'Matrices', icon: Grid, path: '/matrices', desc: 'Producción Global' },
                      { label: 'Calendario', icon: Calendar, path: '/calendar', desc: 'Agenda inteligente' },
                      { label: 'Comunicaciones', icon: MessageSquare, path: '/communications', desc: 'Mensajes' },
                      { label: 'Configuración', icon: Settings, path: '/settings', desc: 'Ajustes del estudio' },
                    ].map(item => (
                      <button
                        key={item.path}
                        onClick={() => runCommand(() => router.push(item.path))}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-surface-elevated transition-all group text-left"
                      >
                        <div className="w-7 h-7 rounded-lg bg-surface-elevated border border-border/50 flex items-center justify-center shrink-0 group-hover:border-accent/30 group-hover:bg-accent/5 transition-all">
                          <item.icon className="w-3.5 h-3.5 text-text-secondary group-hover:text-accent transition-colors" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text-primary">{item.label}</p>
                        </div>
                        <kbd className="text-[10px] text-text-secondary/50 opacity-0 group-hover:opacity-100 transition-opacity">↵</kbd>
                      </button>
                    ))}
                  </div>

                  <div className="h-px bg-border/50 my-2 mx-3" />

                  {/* Global Actions */}
                  <div className="mb-1">
                    <p className="text-[10px] font-bold text-text-secondary/60 uppercase tracking-widest px-3 py-2">Acciones Rápidas</p>
                    <button
                      onClick={() => runCommand(() => router.push('/artists'))}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-surface-elevated transition-all group text-left"
                    >
                      <div className="w-7 h-7 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
                        <Plus className="w-3.5 h-3.5 text-accent" />
                      </div>
                      <p className="text-sm font-medium text-text-primary">Crear Nuevo Artista</p>
                    </button>
                    <button
                      onClick={() => runCommand(() => { if (theme !== 'dark') setTheme('dark'); else setTheme('light'); })}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-surface-elevated transition-all group text-left"
                    >
                      <div className="w-7 h-7 rounded-lg bg-surface-elevated border border-border/50 flex items-center justify-center shrink-0">
                        {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-indigo-400" />}
                      </div>
                      <p className="text-sm font-medium text-text-primary">
                        {theme === 'dark' ? 'Cambiar a Tema Claro' : 'Cambiar a Tema Oscuro'}
                      </p>
                    </button>
                  </div>

                  {/* Artists quick access */}
                  {activeArtists && activeArtists.length > 0 && (
                    <>
                      <div className="h-px bg-border/50 my-2 mx-3" />
                      <div>
                        <p className="text-[10px] font-bold text-text-secondary/60 uppercase tracking-widest px-3 py-2">Ir a Artista</p>
                        {activeArtists.slice(0, 6).map(artist => (
                          <button
                            key={artist.id}
                            onClick={() => runCommand(() => router.push(`/artists/${artist.id}`))}
                            className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl hover:bg-accent/5 hover:text-accent transition-all group text-left"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center border border-accent/30 group-hover:bg-accent group-hover:border-accent transition-colors">
                                <User className="w-3 h-3 text-accent group-hover:text-white" />
                              </div>
                              <span className="text-sm font-medium text-text-primary group-hover:text-accent transition-colors">{artist.name}</span>
                            </div>
                            <span className="text-[10px] text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity">↵</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Footer hint */}
                  <div className="mt-3 mx-3 px-3 py-2 bg-surface-elevated/50 rounded-lg border border-border/30">
                    <p className="text-[10px] text-text-secondary/60 flex items-center gap-2">
                      <Search className="w-3 h-3" />
                      Escribe para buscar artistas, archivos de audio, proyectos y más...
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-border/40 px-4 py-2 bg-surface/50 flex items-center justify-between">
              <p className="text-[10px] text-text-secondary/50">
                {isQueryActive ? (
                  isSearching ? 'Buscando...' : `${(results?.artists.length || 0) + (results?.audioFiles.length || 0) + (results?.otherFiles.length || 0)} resultados`
                ) : 'Comandos disponibles'}
              </p>
              <div className="flex items-center gap-3 text-[10px] text-text-secondary/50">
                <span><kbd className="font-sans bg-surface-elevated border border-border/50 rounded px-1">↵</kbd> Abrir</span>
                <span><kbd className="font-sans bg-surface-elevated border border-border/50 rounded px-1">↑↓</kbd> Navegar</span>
                <span><kbd className="font-sans bg-surface-elevated border border-border/50 rounded px-1">ESC</kbd> Cerrar</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
