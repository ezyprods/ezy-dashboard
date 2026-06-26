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
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const [isMac, setIsMac] = React.useState(true);

  React.useEffect(() => {
    setIsMac(typeof window !== 'undefined' && navigator.userAgent.toUpperCase().indexOf('MAC') >= 0);
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => {
          if (!open) {
            setTimeout(() => inputRef.current?.focus(), 10);
            return true;
          }
          return false;
        });
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [open]);

  // Handle click outside to close
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

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

  const hasResults = results && (
    results.artists.length > 0 || results.audioFiles.length > 0 || results.otherFiles.length > 0
  );

  const isQueryActive = query.trim().length >= 2;

  return (
    <div ref={containerRef} className="relative flex-1 md:max-w-md mx-2 md:mx-4 group">
      {/* Inline Search Input */}
      <div 
        className={`flex items-center gap-2 px-3 py-2 text-sm text-text-secondary bg-surface border rounded-xl transition-all w-full
          ${open ? 'border-accent ring-2 ring-accent/20 bg-surface-elevated' : 'border-border hover:border-accent/50 hover:bg-surface-elevated'}`}
      >
        {isSearching ? (
          <Loader2 className="w-4 h-4 text-accent shrink-0 animate-spin" />
        ) : (
          <Search className={`w-4 h-4 shrink-0 transition-colors ${open ? 'text-accent' : 'group-hover:text-accent'}`} />
        )}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar artistas, archivos..."
          className="flex-1 bg-transparent border-0 outline-none text-text-primary placeholder:text-text-secondary/70 text-sm"
        />
        <div className="flex items-center gap-2 shrink-0">
          {query && (
            <button 
              onClick={(e) => { e.stopPropagation(); setQuery(''); inputRef.current?.focus(); }} 
              className="text-text-secondary hover:text-text-primary transition-colors p-1 rounded"
            >
              <span className="text-xs">✕</span>
            </button>
          )}
          {!open && (
            <kbd className="hidden lg:inline-flex items-center font-sans text-[10px] font-medium text-text-secondary bg-surface-elevated border border-border rounded px-1.5 shadow-sm">
              {isMac ? '⌘K' : 'Ctrl K'}
            </kbd>
          )}
        </div>
      </div>

      {open && (
        <div className="absolute top-full mt-2 left-0 w-full z-50 bg-surface-elevated border border-border/80 rounded-xl shadow-2xl overflow-hidden ring-1 ring-black/20 flex flex-col animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="max-h-[60vh] overflow-y-auto p-2 custom-scrollbar">

            {/* ── Dynamic Search Results ── */}
            {isQueryActive && (
              <>
                {isSearching && !results && (
                  <div className="py-12 text-center text-text-secondary flex flex-col items-center gap-3">
                    <Loader2 className="w-6 h-6 animate-spin text-accent" />
                    <p className="text-sm">Buscando en la plataforma...</p>
                  </div>
                )}

                {!isSearching && !hasResults && results && (
                  <div className="py-12 text-center flex flex-col items-center gap-3 text-text-secondary">
                    <Search className="w-8 h-8 opacity-30" />
                    <p className="text-sm">Sin resultados para <strong className="text-text-primary">"{query}"</strong></p>
                    <p className="text-xs opacity-60">Prueba con otro término</p>
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
                          <p className="text-[10px] text-text-secondary">Ver perfil</p>
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
                                <span className="text-[10px] text-text-secondary/60">Reproducir</span>
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
                    { label: 'Configuración', icon: Settings, path: '/settings', desc: 'Ajustes' },
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
                  <p className="text-[10px] font-bold text-text-secondary/60 uppercase tracking-widest px-3 py-2">Acciones</p>
                  <button
                    onClick={() => runCommand(() => router.push('/artists'))}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-surface-elevated transition-all group text-left"
                  >
                    <div className="w-7 h-7 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center shrink-0">
                      <Plus className="w-3.5 h-3.5 text-accent" />
                    </div>
                    <p className="text-sm font-medium text-text-primary">Crear Artista</p>
                  </button>
                  <button
                    onClick={() => runCommand(() => { if (theme !== 'dark') setTheme('dark'); else setTheme('light'); })}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-surface-elevated transition-all group text-left"
                  >
                    <div className="w-7 h-7 rounded-lg bg-surface-elevated border border-border/50 flex items-center justify-center shrink-0">
                      {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-indigo-400" />}
                    </div>
                    <p className="text-sm font-medium text-text-primary">
                      {theme === 'dark' ? 'Tema Claro' : 'Tema Oscuro'}
                    </p>
                  </button>
                </div>

                {/* Artists quick access */}
                {activeArtists && activeArtists.length > 0 && (
                  <>
                    <div className="h-px bg-border/50 my-2 mx-3" />
                    <div>
                      <p className="text-[10px] font-bold text-text-secondary/60 uppercase tracking-widest px-3 py-2">Ir a Artista</p>
                      {activeArtists.map(artist => (
                        <button
                          key={artist.id}
                          onClick={() => runCommand(() => router.push(`/artists/${artist.id}`))}
                          className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl hover:bg-accent/5 hover:text-accent transition-all group text-left"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center border border-accent/30 group-hover:bg-accent group-hover:border-accent transition-colors">
                              <User className="w-3 h-3 text-accent group-hover:text-white" />
                            </div>
                            <span className="text-sm font-medium text-text-primary group-hover:text-accent transition-colors truncate max-w-[150px]">{artist.name}</span>
                          </div>
                          <span className="text-[10px] text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity">↵</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
          
          {/* Footer inside Dropdown */}
          <div className="border-t border-border/40 px-3 py-2 bg-surface/80 flex items-center justify-between">
            <p className="text-[10px] text-text-secondary/50">
              {isQueryActive ? (
                isSearching ? 'Buscando...' : `${(results?.artists.length || 0) + (results?.audioFiles.length || 0) + (results?.otherFiles.length || 0)} resultados`
              ) : 'Comandos rápidos'}
            </p>
            <div className="hidden xs:flex items-center gap-2 text-[10px] text-text-secondary/50">
              <span><kbd className="font-sans bg-surface-elevated border border-border/50 rounded px-1">↵</kbd></span>
              <span><kbd className="font-sans bg-surface-elevated border border-border/50 rounded px-1">↑↓</kbd></span>
              <span><kbd className="font-sans bg-surface-elevated border border-border/50 rounded px-1">ESC</kbd></span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
