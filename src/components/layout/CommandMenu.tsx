'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import { useArtists } from '@/lib/hooks/useArtists';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { Search, User, FolderPlus, DollarSign, Calendar, Settings, Moon, Sun, HardDrive, Database, Monitor, Disc, Plus } from 'lucide-react';
import './command.css';

export function CommandMenu() {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const { activeArtists } = useArtists();
  const { theme, setTheme } = useTheme();

  const [isMac, setIsMac] = React.useState(true);

  React.useEffect(() => {
    // Detect OS after mount to avoid hydration mismatch
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

  const runCommand = React.useCallback((command: () => void) => {
    setOpen(false);
    command();
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center justify-between flex-1 md:max-w-md px-3 py-1.5 text-sm text-text-secondary bg-surface border border-border rounded-lg hover:border-accent/50 hover:bg-surface-elevated transition-colors mx-2 md:mx-4"
      >
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4" />
          <span className="hidden xs:inline">Buscar artista, proyecto...</span>
          <span className="xs:hidden">Buscar...</span>
        </div>
        <kbd className="hidden lg:inline-flex items-center font-sans text-[10px] font-medium text-text-secondary bg-surface-elevated border border-border rounded px-1.5 shadow-sm">
          {isMac ? '⌘K' : 'Ctrl K'}
        </kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] bg-background/60 backdrop-blur-md animate-in fade-in duration-200 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-2xl bg-surface/90 backdrop-blur-xl border border-border/60 rounded-2xl shadow-2xl overflow-hidden ring-1 ring-black/5" onClick={e => e.stopPropagation()}>
            <Command className="flex flex-col h-full w-full bg-transparent">
              <div className="flex items-center border-b border-border/50 px-4" cmdk-input-wrapper="">
                <Search className="w-5 h-5 text-accent shrink-0" />
                <Command.Input 
                  autoFocus 
                  placeholder="Busca artistas, ejecuta acciones o navega..." 
                  className="w-full bg-transparent border-0 h-16 outline-none px-4 text-text-primary placeholder:text-text-secondary/50 text-lg font-medium"
                />
                <kbd className="hidden sm:inline-flex items-center font-sans text-[10px] font-medium text-text-secondary bg-surface-elevated border border-border rounded px-1.5 h-5 shadow-sm ml-2">
                  ESC
                </kbd>
              </div>

              <Command.List className="max-h-[60vh] md:max-h-[400px] overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-border">
                <Command.Empty className="py-10 text-center text-text-secondary flex flex-col items-center justify-center gap-2">
                  <Search className="w-8 h-8 text-border mb-2" />
                  <p>No se encontraron resultados.</p>
                </Command.Empty>
                
                <Command.Group heading="Navegación Rápida" className="text-xs font-semibold text-text-secondary/70 px-2 py-2 uppercase tracking-wider">
                  <Command.Item 
                    onSelect={() => runCommand(() => router.push('/dashboard'))}
                    className="flex items-center gap-3 px-3 py-3 mt-1 text-sm font-medium text-text-primary rounded-xl cursor-pointer hover:bg-surface-elevated aria-selected:bg-accent/10 aria-selected:text-accent transition-colors"
                  >
                    <Calendar className="w-4 h-4" /> Dashboard
                  </Command.Item>
                  <Command.Item 
                    onSelect={() => runCommand(() => router.push('/artists'))}
                    className="flex items-center gap-3 px-3 py-3 mt-1 text-sm font-medium text-text-primary rounded-xl cursor-pointer hover:bg-surface-elevated aria-selected:bg-accent/10 aria-selected:text-accent transition-colors"
                  >
                    <User className="w-4 h-4" /> Todos los Artistas
                  </Command.Item>
                  <Command.Item 
                    onSelect={() => runCommand(() => router.push('/payments'))}
                    className="flex items-center gap-3 px-3 py-3 mt-1 text-sm font-medium text-text-primary rounded-xl cursor-pointer hover:bg-surface-elevated aria-selected:bg-accent/10 aria-selected:text-accent transition-colors"
                  >
                    <DollarSign className="w-4 h-4" /> Pagos y Finanzas
                  </Command.Item>
                  <Command.Item 
                    onSelect={() => runCommand(() => router.push('/settings'))}
                    className="flex items-center gap-3 px-3 py-3 mt-1 text-sm font-medium text-text-primary rounded-xl cursor-pointer hover:bg-surface-elevated aria-selected:bg-accent/10 aria-selected:text-accent transition-colors"
                  >
                    <Settings className="w-4 h-4" /> Configuración del Estudio
                  </Command.Item>
                </Command.Group>

                <Command.Group heading="Acciones Globales" className="text-xs font-semibold text-text-secondary/70 px-2 py-2 mt-2 uppercase tracking-wider">
                  {theme !== 'dark' && (
                    <Command.Item 
                      onSelect={() => runCommand(() => setTheme('dark'))}
                      className="flex items-center gap-3 px-3 py-3 mt-1 text-sm font-medium text-text-primary rounded-xl cursor-pointer hover:bg-surface-elevated aria-selected:bg-accent/10 aria-selected:text-accent transition-colors"
                    >
                      <Moon className="w-4 h-4" /> Cambiar a Tema Oscuro
                    </Command.Item>
                  )}
                  {theme !== 'light' && (
                    <Command.Item 
                      onSelect={() => runCommand(() => setTheme('light'))}
                      className="flex items-center gap-3 px-3 py-3 mt-1 text-sm font-medium text-text-primary rounded-xl cursor-pointer hover:bg-surface-elevated aria-selected:bg-accent/10 aria-selected:text-accent transition-colors"
                    >
                      <Sun className="w-4 h-4" /> Cambiar a Tema Claro
                    </Command.Item>
                  )}
                  <Command.Item 
                    onSelect={() => runCommand(() => router.push('/artists'))}
                    className="flex items-center gap-3 px-3 py-3 mt-1 text-sm font-medium text-text-primary rounded-xl cursor-pointer hover:bg-surface-elevated aria-selected:bg-accent/10 aria-selected:text-accent transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Crear Nuevo Artista
                  </Command.Item>
                  <Command.Item 
                    onSelect={() => runCommand(() => router.push('/settings'))}
                    className="flex items-center gap-3 px-3 py-3 mt-1 text-sm font-medium text-text-primary rounded-xl cursor-pointer hover:bg-surface-elevated aria-selected:bg-accent/10 aria-selected:text-accent transition-colors"
                  >
                    <HardDrive className="w-4 h-4" /> Limpiar Caché o Datos
                  </Command.Item>
                </Command.Group>

                {activeArtists && activeArtists.length > 0 && (
                  <Command.Group heading="Navegar a Artistas" className="text-xs font-semibold text-text-secondary/70 px-2 py-2 mt-2 uppercase tracking-wider">
                    {activeArtists.map((artist) => (
                      <Command.Item
                        key={artist.id}
                        onSelect={() => runCommand(() => router.push(`/artists/${artist.id}`))}
                        className="flex items-center justify-between gap-3 px-3 py-3 mt-1 text-sm font-medium text-text-primary rounded-xl cursor-pointer hover:bg-surface-elevated aria-selected:bg-accent/10 aria-selected:text-accent transition-colors group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center border border-accent/30 group-aria-selected:bg-accent group-aria-selected:text-white transition-colors">
                            <User className="w-3.5 h-3.5 text-accent group-aria-selected:text-white" />
                          </div>
                          {artist.name}
                        </div>
                        <span className="text-[10px] text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity">Ir al perfil ↵</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
              </Command.List>
            </Command>
          </div>
        </div>
      )}
    </>
  );
}
