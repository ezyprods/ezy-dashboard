'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import { useArtists } from '@/lib/hooks/useArtists';
import { Search, User, FolderPlus, DollarSign, Calendar, Settings } from 'lucide-react';
import './command.css'; // Añadiremos estilos específicos para cmdk aquí o usaremos Tailwind

export function CommandMenu() {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const { activeArtists } = useArtists();

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
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[5vh] md:pt-[15vh] bg-background/80 backdrop-blur-sm animate-fade-in p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-2xl bg-surface border border-border rounded-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <Command className="flex flex-col h-full w-full bg-transparent">
              <div className="flex items-center border-b border-border px-4" cmdk-input-wrapper="">
                <Search className="w-5 h-5 text-text-secondary shrink-0" />
                <Command.Input 
                  autoFocus 
                  placeholder="Buscar artistas, secciones..." 
                  className="w-full bg-transparent border-0 h-14 outline-none px-3 text-text-primary placeholder:text-text-secondary/50 text-lg"
                />
              </div>

              <Command.List className="max-h-[300px] overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-border">
                <Command.Empty className="py-6 text-center text-text-secondary">No se encontraron resultados.</Command.Empty>
                
                <Command.Group heading="Navegación Rápida" className="text-xs font-medium text-text-secondary px-2 py-2">
                  <Command.Item 
                    onSelect={() => runCommand(() => router.push('/dashboard'))}
                    className="flex items-center gap-3 px-3 py-2 text-sm text-text-primary rounded-md cursor-pointer hover:bg-surface-elevated aria-selected:bg-surface-elevated aria-selected:text-accent"
                  >
                    <Calendar className="w-4 h-4" /> Dashboard
                  </Command.Item>
                  <Command.Item 
                    onSelect={() => runCommand(() => router.push('/artists'))}
                    className="flex items-center gap-3 px-3 py-2 text-sm text-text-primary rounded-md cursor-pointer hover:bg-surface-elevated aria-selected:bg-surface-elevated aria-selected:text-accent"
                  >
                    <User className="w-4 h-4" /> Todos los Artistas
                  </Command.Item>
                  <Command.Item 
                    onSelect={() => runCommand(() => router.push('/payments'))}
                    className="flex items-center gap-3 px-3 py-2 text-sm text-text-primary rounded-md cursor-pointer hover:bg-surface-elevated aria-selected:bg-surface-elevated aria-selected:text-accent"
                  >
                    <DollarSign className="w-4 h-4" /> Pagos
                  </Command.Item>
                </Command.Group>

                {activeArtists && activeArtists.length > 0 && (
                  <Command.Group heading="Tus Artistas" className="text-xs font-medium text-text-secondary px-2 py-2 mt-2">
                    {activeArtists.map((artist) => (
                      <Command.Item
                        key={artist.id}
                        onSelect={() => runCommand(() => router.push(`/artists/${artist.id}`))}
                        className="flex items-center gap-3 px-3 py-2 text-sm text-text-primary rounded-md cursor-pointer hover:bg-surface-elevated aria-selected:bg-surface-elevated aria-selected:text-accent"
                      >
                        <User className="w-4 h-4 text-accent/70" />
                        {artist.name}
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
