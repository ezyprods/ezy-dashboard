'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Users, 
  CreditCard, 
  MessageSquare, 
  Settings, 
  Calendar, 
  ExternalLink, 
  Grid, 
  Wrench, 
  Music,
  ChevronLeft,
  X,
  Camera
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAudio } from '@/lib/contexts/AudioContext';

const mainNavItems = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Artistas', href: '/artists', icon: Users },
  { name: 'Proyectos Personales', href: '/personal-projects', icon: Music },
  { name: 'Matrices', href: '/matrices', icon: Grid },
  { name: 'Instagram Studio', href: '/instagram', icon: Camera },
  { name: 'Calendario', href: '/calendar', icon: Calendar },
  { name: 'Pagos', href: '/payments', icon: CreditCard },
];

const secondaryNavItems = [
  { name: 'Herramientas', href: '/tools', icon: Wrench },
  { name: 'Comunicaciones', href: '/communications', icon: MessageSquare },
  { name: 'Configuración', href: '/settings', icon: Settings },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export function Sidebar({ isOpen, onClose, onCollapsedChange }: SidebarProps) {
  const { currentTrack } = useAudio();
  const pathname = usePathname();
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);

  // Restore pinned preference if desired (default to false: collapsed rail mode)
  useEffect(() => {
    try {
      const stored = localStorage.getItem('ezy_sidebar_pinned');
      if (stored === 'true') {
        setIsPinned(true);
      }
    } catch (e) {}
  }, []);

  const handleTogglePin = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsPinned((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('ezy_sidebar_pinned', String(next));
      } catch (e) {}
      return next;
    });
  };

  // Close mobile drawer and collapse temporary hover on route change
  useEffect(() => {
    if (isOpen && onClose) {
      onClose();
    }
    setIsHovered(false);
  }, [pathname]);

  // Click outside to collapse if temporarily hovered/opened
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setIsHovered(false);
      }
    };
    document.addEventListener('click', handleDocumentClick);
    return () => document.removeEventListener('click', handleDocumentClick);
  }, []);

  // In mobile drawer mode (isOpen = true), sidebar is never collapsed.
  // In tablet / desktop mode, sidebar is collapsed (68px rail) unless hovered or pinned.
  const isCollapsed = isOpen ? false : (!isHovered && !isPinned);

  useEffect(() => {
    onCollapsedChange?.(isCollapsed);
  }, [isCollapsed, onCollapsedChange]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const isSwipeLeft = touchStartX - touchEndX > 50;
    if (isSwipeLeft && onClose) {
      onClose();
    }
    setTouchStartX(null);
  };

  const renderNavItem = (item: { name: string; href: string; icon: any }) => {
    const isActive = pathname.startsWith(item.href);
    const isInsideSubRoute = pathname !== item.href && isActive;
    const Icon = item.icon;

    return (
      <Link
        key={item.name}
        href={item.href}
        onClick={() => {
          if (isOpen && onClose) onClose();
        }}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 group relative whitespace-nowrap text-left",
          isActive 
            ? "text-accent dark:text-accent-light bg-accent/10 font-bold" 
            : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
        )}
        title={isCollapsed ? item.name : (isInsideSubRoute ? `Volver a ${item.name}` : undefined)}
      >
        {isActive && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-accent rounded-r-full" />
        )}
        {/* Icon container: mathematically centered at x = 34px (nav px-3 [12px] + link px-3 [12px] + w-5/2 [10px] = 34px) */}
        <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
          <Icon className={cn(
            "w-[18px] h-[18px] transition-transform duration-150 group-hover:scale-110",
            isActive ? "text-accent dark:text-accent-light" : "text-text-secondary group-hover:text-text-primary"
          )} />
        </div>
        <span
          className={cn(
            "whitespace-nowrap transition-all duration-200 flex-1 min-w-0 truncate",
            isCollapsed ? "opacity-0 -translate-x-2 pointer-events-none" : "opacity-100 translate-x-0"
          )}
        >
          {item.name}
        </span>
      </Link>
    );
  };

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-background/60 backdrop-blur-sm z-45 md:hidden animate-fade-in"
          onClick={onClose}
        />
      )}

      <aside 
        ref={sidebarRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={cn(
          "bg-surface border-r border-border flex flex-col h-[100dvh] fixed md:sticky top-0 left-0 z-50 md:z-40 overflow-hidden shrink-0",
          "transition-[width,transform] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]",
          isOpen 
            ? "translate-x-0 w-64 max-w-[calc(100vw-3rem)] shadow-2xl" 
            : "-translate-x-full md:translate-x-0 md:shadow-none",
          isCollapsed ? "md:w-[68px]" : "md:w-64"
        )}
      >
        {/* Inner rigid container: fixed width w-64 ensures 0.00px horizontal jitter during width animation */}
        <div className="w-64 flex flex-col h-full shrink-0">
          {/* Header: Logo Only */}
          <div className="h-16 flex items-center justify-between px-3 border-b border-border shrink-0">
            <Link 
              href="/dashboard" 
              onClick={() => {
                if (isOpen && onClose) onClose();
              }}
              className="flex items-center rounded-xl p-1 group shrink-0 hover:bg-surface-elevated/60 transition-colors"
              title="EZY Dashboard"
            >
              {/* Logo Emblem */}
              <div className="w-9 h-9 flex-shrink-0 flex items-center justify-center relative">
                <Image
                  src="/logo-black-trimmed.png"
                  alt="EZY"
                  width={36}
                  height={36}
                  className="logo-light h-7 w-auto object-contain transition-transform duration-200 group-hover:scale-110"
                  priority
                />
                <Image
                  src="/logo-trimmed.png"
                  alt="EZY"
                  width={36}
                  height={36}
                  className="logo-dark h-7 w-auto object-contain transition-transform duration-200 group-hover:scale-110"
                  priority
                />
              </div>
            </Link>

            {/* Desktop/Tablet Pin Toggle Button */}
            <button
              type="button"
              onClick={handleTogglePin}
              className={cn(
                "hidden md:flex items-center justify-center p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-all duration-200 ml-auto shrink-0 cursor-pointer",
                isCollapsed
                  ? "opacity-0 pointer-events-none w-0 overflow-hidden p-0"
                  : "opacity-100"
              )}
              title={isPinned ? "Desanclar barra lateral (modo rail automático)" : "Fijar barra lateral abierta"}
              aria-label={isPinned ? "Desanclar barra lateral" : "Fijar barra lateral"}
            >
              <ChevronLeft className={cn("w-4 h-4 transition-transform duration-200", !isPinned && "rotate-180")} />
            </button>

            {/* Mobile Drawer Close Button */}
            {isOpen && (
              <button
                type="button"
                onClick={onClose}
                className="md:hidden p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer shrink-0 ml-auto"
                aria-label="Cerrar menú lateral"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Navigation Items */}
          <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-3 space-y-2 custom-scrollbar">
            <div className="space-y-1">
              {mainNavItems.map(renderNavItem)}
            </div>

            <div className="my-2 border-t border-border/60" />

            <div className="space-y-1">
              {secondaryNavItems.map(renderNavItem)}
            </div>
          </nav>

          {/* Footer: Google Drive Connection status & dynamic audio spacing */}
          <div className={cn(
            "p-3 border-t border-border mt-auto shrink-0 transition-[padding] duration-300",
            currentTrack ? "pb-24 md:pb-28" : "pb-3"
          )}>
            {isCollapsed ? (
              <div className="flex flex-col items-center justify-center w-11 h-11 mx-auto rounded-xl glass hover:bg-surface-elevated transition-colors group relative">
                <a 
                  href="https://drive.google.com/drive/folders/182uxxUjN7KJJDm1vAZ_AEyKvAwwcTPxY?usp=drive_link" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-full h-full flex items-center justify-center text-text-secondary hover:text-accent relative"
                  title="Google Drive (Sincronizado)"
                >
                  <ExternalLink className="w-4 h-4 transition-transform group-hover:scale-110" />
                  <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-success animate-pulse" />
                </a>
              </div>
            ) : (
              <div className="glass rounded-xl p-3 flex flex-col gap-2 transition-all duration-200">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-text-secondary truncate">Google Drive</p>
                  <a 
                    href="https://drive.google.com/drive/folders/182uxxUjN7KJJDm1vAZ_AEyKvAwwcTPxY?usp=drive_link" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-text-secondary hover:text-accent transition-colors p-1 rounded hover:bg-surface-elevated"
                    title="Abrir Google Drive"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
                <div className="flex items-center gap-2 text-xs text-success font-medium">
                  <div className="w-2 h-2 rounded-full bg-success animate-pulse shrink-0" />
                  <span className="truncate">Sincronizado</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
