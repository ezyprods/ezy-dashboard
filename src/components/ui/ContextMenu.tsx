'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  Plus,
  LayoutDashboard,
  Users,
  Calendar,
  User,
  FolderPlus,
  Share2,
  Play,
  Download,
  Link,
  Copy,
  Settings2,
  ExternalLink,
  Eye,
  UploadCloud,
  CalendarDays,
  ArrowRightLeft,
  Trash2,
  Edit3,
  type LucideIcon,
} from 'lucide-react';
import { useContextMenu, type MenuItem } from '@/lib/contexts/ContextMenuContext';
import { cn } from '@/lib/utils';

// Map of icon name strings → Lucide icon components
const ICON_MAP: Record<string, LucideIcon> = {
  Plus,
  LayoutDashboard,
  Users,
  Calendar,
  User,
  FolderPlus,
  Share2,
  Play,
  Download,
  Link,
  Copy,
  Settings2,
  ExternalLink,
  Eye,
  UploadCloud,
  CalendarDays,
  ArrowRightLeft,
  Trash2,
  Edit3,
};

function MenuIcon({ name }: { name?: string }) {
  if (!name) return null;
  const Icon = ICON_MAP[name];
  if (!Icon) return null;
  return <Icon className="w-3.5 h-3.5 shrink-0" />;
}

export function GlobalContextMenu() {
  const { menuState, hideMenu, showMenu } = useContextMenu();
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);

  // Build default actions
  const getDefaultItems = useCallback((): MenuItem[] => [
    {
      label: 'Nuevo Artista',
      icon: 'Plus',
      action: () => {
        window.dispatchEvent(new CustomEvent('ezy:new-artist'));
      },
    },
    {
      label: 'Subida Rápida',
      icon: 'UploadCloud',
      action: () => window.dispatchEvent(new CustomEvent('ezy:quick-upload')),
    },
    { separator: true },
    { label: 'Ir al Dashboard', icon: 'LayoutDashboard', action: () => router.push('/dashboard') },
    { label: 'Directorio Artistas', icon: 'Users', action: () => router.push('/artists') },
    { label: 'Abrir Calendario', icon: 'Calendar', action: () => router.push('/calendar') },
  ], [router]);

  const getArtistItems = useCallback((artistId: string): MenuItem[] => [
    { label: 'Ver Artista', icon: 'User', action: () => router.push(`/artists/${artistId}`) },
    {
      label: 'Nuevo Proyecto',
      icon: 'FolderPlus',
      action: () => router.push(`/artists/${artistId}?newProject=true`),
    },
    {
      label: 'Compartir Portal',
      icon: 'Share2',
      action: () => {
        const url = `${window.location.origin}/portal/${artistId}`;
        navigator.clipboard.writeText(url).catch(() => {});
      },
    },
  ], [router]);

  const getAudioItems = useCallback((fileId: string): MenuItem[] => [
    {
      label: 'Reproducir',
      icon: 'Play',
      action: () => window.dispatchEvent(new CustomEvent('ezy:play-file', { detail: { fileId } })),
    },
    {
      label: 'Descargar',
      icon: 'Download',
      action: () => {
        const a = document.createElement('a');
        a.href = `https://drive.google.com/uc?export=download&id=${fileId}`;
        a.click();
      },
    },
    {
      label: 'Copiar enlace',
      icon: 'Link',
      action: () => {
        const url = `https://drive.google.com/file/d/${fileId}/view`;
        navigator.clipboard.writeText(url).catch(() => {});
      },
    },
  ], []);

  // Global contextmenu listener
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const contextEl = target.closest('[data-context]') as HTMLElement | null;
      const context = contextEl?.dataset.context;
      
      // If a local component wants to handle its own context menu, it should use data-context="ignore"
      if (context === 'ignore' || context?.startsWith('calendar-')) {
        return;
      }

      e.preventDefault();
      
      const artistId = contextEl?.dataset.artistId;
      const fileId = contextEl?.dataset.fileId;

      let items: MenuItem[];

      if (context === 'artist' && artistId) {
        items = getArtistItems(artistId);
      } else if (context === 'audio' && fileId) {
        items = getAudioItems(fileId);
      } else {
        items = getDefaultItems();
      }

      // Determine viewport-safe position
      const menuW = 200;
      const menuH = items.length * 40 + 16;
      const x = e.clientX + menuW > window.innerWidth ? e.clientX - menuW : e.clientX;
      const y = e.clientY + menuH > window.innerHeight ? e.clientY - menuH : e.clientY;

      showMenu(x, y, items);
    };

    document.addEventListener('contextmenu', handleContextMenu);
    return () => document.removeEventListener('contextmenu', handleContextMenu);
  }, [getDefaultItems, getArtistItems, getAudioItems, showMenu]);

  const [position, setPosition] = React.useState({ x: 0, y: 0 });

  useEffect(() => {
    if (menuState.visible && typeof window !== 'undefined') {
      let x = menuState.x;
      let y = menuState.y;

      // Ensure menu fits in viewport
      if (menuRef.current) {
        const rect = menuRef.current.getBoundingClientRect();
        if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 8;
        if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 8;
      } else {
        // Fallback approximate bounds if ref is not measured yet
        const approxW = 200;
        const approxH = menuState.items.length * 40 + 16;
        if (x + approxW > window.innerWidth) x = window.innerWidth - approxW - 8;
        if (y + approxH > window.innerHeight) y = window.innerHeight - approxH - 8;
      }
      setPosition({ x: Math.max(8, x), y: Math.max(8, y) });
    }
  }, [menuState]);

  // Close on outside click, scroll, escape
  useEffect(() => {
    if (!menuState.visible) return;

    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        hideMenu();
      }
    };
    const handleScroll = () => hideMenu();
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') hideMenu(); };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('scroll', handleScroll, { capture: true });
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('scroll', handleScroll, { capture: true });
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuState.visible, hideMenu]);

  if (!menuState.visible || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[9999] min-w-[200px] py-1.5 rounded-xl border border-border/60 bg-surface-elevated/90 backdrop-blur-xl shadow-2xl shadow-black/40 animate-menu-in"
      style={{ top: position.y, left: position.x }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menuState.items.map((item, i) => {
        if (item.separator) {
          return <div key={`sep-${i}`} className="my-1 border-t border-border/40" />;
        }
        return (
          <button
            key={i}
            onClick={() => {
              if (item.action) item.action();
              hideMenu();
            }}
            className={cn(
              'w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors duration-100 text-left',
              item.variant === 'danger'
                ? 'text-error hover:bg-error/10'
                : 'text-text-primary hover:bg-accent/10 hover:text-accent-light'
            )}
          >
            <MenuIcon name={item.icon} />
            {item.label}
          </button>
        );
      })}
    </div>,
    document.body
  );
}
