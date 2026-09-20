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
  Circle,
  Clock,
  CheckCircle2,
  CheckSquare,
  AlignLeft,
  Paperclip,
  Table2,
  Pencil,
  RotateCcw,
  MoreVertical,
  Scissors,
  Undo,
  KanbanSquare,
  AlertCircle,
  FolderOpen,
  FolderInput,
  Music,
  CreditCard,
  MessageSquare,
  Settings,
  Star,
  StarOff,
  Info,
  Palette,
  HardDrive,
  CopyPlus,
  Send,
  Check,
  RefreshCw,
  ArrowUpDown,
  LayoutGrid,
  List,
  Timer,
  Keyboard,
  Mail,
  X,
  PanelRight,
  ListChecks,
  AudioWaveform,
  UserCheck,
  UserPlus,
  ChevronRight,
  ChevronLeft,
  type LucideIcon,
} from 'lucide-react';
import { useContextMenu, type MenuItem } from '@/lib/contexts/ContextMenuContext';
import { useAudio } from '@/lib/contexts/AudioContext';
import { cn } from '@/lib/utils';
import { copyTextAndEnsurePublic } from '@/components/explorer/explorerUtils';

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
  Circle,
  Clock,
  CheckCircle2,
  CheckSquare,
  AlignLeft,
  Paperclip,
  Table2,
  Pencil,
  RotateCcw,
  MoreVertical,
  Scissors,
  Undo,
  KanbanSquare,
  AlertCircle,
  FolderOpen,
  FolderInput,
  Music,
  CreditCard,
  MessageSquare,
  Settings,
  Star,
  StarOff,
  Info,
  Palette,
  HardDrive,
  CopyPlus,
  Send,
  Check,
  RefreshCw,
  ArrowUpDown,
  LayoutGrid,
  List,
  Timer,
  Keyboard,
  Mail,
  X,
  PanelRight,
  ListChecks,
  AudioWaveform,
  UserCheck,
  UserPlus,
  LinkIcon: Link,
};

const LONG_PRESS_MS = 480;
const LONG_PRESS_MOVE_TOLERANCE = 10;

/** Marks contextmenu events we synthesize from a long-press (see useIOSLongPressContextMenu). */
type SyntheticContextMenuEvent = MouseEvent & { __ezyLongPress?: boolean };

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]');
}

function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * iOS Safari never fires `contextmenu` on long-press (Android Chrome does), so every
 * right-click menu in the app was unreachable on iPhone. This turns a still ~0.5s press into a
 * `contextmenu` event on the pressed element, which the existing onContextMenu handlers pick up.
 * The click that iOS fires when the finger lifts is swallowed so the item isn't also opened.
 */
function useIOSLongPressContextMenu() {
  useEffect(() => {
    if (!isIOSDevice()) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let start: { x: number; y: number } | null = null;
    let suppressClickUntil = 0;

    const cancel = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      start = null;
    };

    const onTouchStart = (e: TouchEvent) => {
      cancel();
      if (e.touches.length !== 1 || isEditableTarget(e.target)) return;
      const touch = e.touches[0];
      const target = e.target as Element;
      start = { x: touch.clientX, y: touch.clientY };
      timer = setTimeout(() => {
        timer = null;
        if (!start) return;
        const evt = new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: start.x,
          clientY: start.y,
          screenX: touch.screenX,
          screenY: touch.screenY,
          button: 2,
        }) as SyntheticContextMenuEvent;
        evt.__ezyLongPress = true;
        target.dispatchEvent(evt);
        if (evt.defaultPrevented) {
          // A menu opened: drop the text selection iOS may have started and eat the upcoming tap
          window.getSelection()?.removeAllRanges();
          suppressClickUntil = Date.now() + 800;
        }
        start = null;
      }, LONG_PRESS_MS);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!start) return;
      const touch = e.touches[0];
      if (Math.abs(touch.clientX - start.x) > LONG_PRESS_MOVE_TOLERANCE || Math.abs(touch.clientY - start.y) > LONG_PRESS_MOVE_TOLERANCE) {
        cancel();
      }
    };

    const onClickCapture = (e: MouseEvent) => {
      if (Date.now() < suppressClickUntil) {
        e.preventDefault();
        e.stopPropagation();
        suppressClickUntil = 0;
      }
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', cancel, { passive: true });
    document.addEventListener('touchcancel', cancel, { passive: true });
    document.addEventListener('scroll', cancel, { passive: true, capture: true });
    document.addEventListener('click', onClickCapture, { capture: true });
    return () => {
      cancel();
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', cancel);
      document.removeEventListener('touchcancel', cancel);
      document.removeEventListener('scroll', cancel, { capture: true });
      document.removeEventListener('click', onClickCapture, { capture: true });
    };
  }, []);
}

function MenuIcon({ name, className, color }: { name?: string; className?: string; color?: string }) {
  if (!name) return null;
  const Icon = ICON_MAP[name];
  if (!Icon) return null;
  return <Icon className={cn("w-3.5 h-3.5 shrink-0", className)} style={color ? { color } : undefined} />;
}

export function GlobalContextMenu() {
  const { menuState, hideMenu, showMenu } = useContextMenu();
  const { playTrack } = useAudio();
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);

  useIOSLongPressContextMenu();

  // ─── Submenus (desktop flyout, phone sub-screen) ─────────────────────────
  const [openSubmenu, setOpenSubmenu] = React.useState<{ index: number; items: MenuItem[]; label?: string; anchor: DOMRect } | null>(null);
  const [submenuPos, setSubmenuPos] = React.useState({ x: 0, y: 0 });
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sheetStack, setSheetStack] = React.useState<{ items: MenuItem[]; label?: string }[]>([]);

  const cancelSubmenuClose = useCallback(() => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  }, []);
  const scheduleSubmenuClose = useCallback(() => {
    cancelSubmenuClose();
    closeTimer.current = setTimeout(() => setOpenSubmenu(null), 200);
  }, [cancelSubmenuClose]);
  const handleRowEnter = useCallback((index: number, item: MenuItem, anchor: DOMRect) => {
    cancelSubmenuClose();
    if (item.submenu) setOpenSubmenu(prev => (prev?.index === index ? prev : { index, items: item.submenu!, label: item.label, anchor }));
    else scheduleSubmenuClose();
  }, [cancelSubmenuClose, scheduleSubmenuClose]);

  // A freshly opened menu (new items array) always starts collapsed
  useEffect(() => {
    setOpenSubmenu(null);
    setSheetStack([]);
  }, [menuState.items]);

  // Position the flyout: to the right of its row, flipped to the left / clamped to the bottom if it wouldn't fit
  useEffect(() => {
    if (!openSubmenu) return;
    const measure = () => {
      const rect = submenuRef.current?.getBoundingClientRect();
      const w = rect?.width ?? 220;
      const h = rect?.height ?? openSubmenu.items.length * 34 + 16;
      let x = openSubmenu.anchor.right - 4;
      if (x + w > window.innerWidth) x = openSubmenu.anchor.left - w + 4;
      let y = openSubmenu.anchor.top - 6;
      if (y + h > window.innerHeight) y = window.innerHeight - h - 8;
      setSubmenuPos({ x: Math.max(8, x), y: Math.max(8, y) });
    };
    measure();
    // Re-measure once the panel has actually painted (its real height may differ from the estimate)
    const raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [openSubmenu]);

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
      action: () => playTrack({ id: fileId, name: 'Audio', url: `/api/audio/${fileId}` }),
    },
    {
      label: 'Descargar',
      icon: 'Download',
      action: () => {
        const a = document.createElement('a');
        a.href = `/api/files/${fileId}`;
        a.click();
      },
    },
    {
      label: 'Copiar enlace',
      icon: 'Link',
      action: () => {
        const url = `https://drive.google.com/file/d/${fileId}/view`;
        copyTextAndEnsurePublic(url, fileId, 'Enlace copiado', 'reader');
      },
    },
  ], [playTrack]);

  // Global contextmenu listener
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Keep the browser's own menu for text fields (paste) and when text is selected (copy)
      if (isEditableTarget(target) || window.getSelection()?.toString()) {
        return;
      }

      const contextEl = target.closest('[data-context]') as HTMLElement | null;
      const context = contextEl?.dataset.context;

      // If a local component wants to handle its own context menu, it should use data-context="ignore"
      if (context === 'ignore' || context?.startsWith('calendar-')) {
        return;
      }

      const artistId = contextEl?.dataset.artistId;
      const fileId = contextEl?.dataset.fileId;

      let items: MenuItem[];

      if (context === 'artist' && artistId) {
        items = getArtistItems(artistId);
      } else if (context === 'audio' && fileId) {
        items = getAudioItems(fileId);
      } else {
        // A component already opened its own menu for this element
        if (e.defaultPrevented) return;
        // A long-press on iPhone over an element without its own menu shouldn't pop the
        // generic "Nuevo Artista / Ir a..." sheet — that's a desktop right-click nicety.
        if ((e as SyntheticContextMenuEvent).__ezyLongPress) return;
        items = getDefaultItems();
      }

      e.preventDefault();

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
  const [isMobile, setIsMobile] = React.useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(typeof window !== 'undefined' && window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (menuState.visible && typeof window !== 'undefined') {
      let x = menuState.x;
      let y = menuState.y;

      if (menuRef.current) {
        const rect = menuRef.current.getBoundingClientRect();
        if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 8;
        if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 8;
      } else {
        const approxW = 200;
        const approxH = menuState.items.length * 40 + 16;
        if (x + approxW > window.innerWidth) x = window.innerWidth - approxW - 8;
        if (y + approxH > window.innerHeight) y = window.innerHeight - approxH - 8;
      }
      setPosition({ x: Math.max(8, x), y: Math.max(8, y) });
    }
  }, [menuState]);

  // Close on outside click, scroll, escape, touch
  useEffect(() => {
    if (!menuState.visible) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = 'touches' in e ? e.touches[0]?.target : e.target;
      if (!target) return;
      const insideMain = menuRef.current?.contains(target as Node);
      const insideSubmenu = submenuRef.current?.contains(target as Node);
      if (!insideMain && !insideSubmenu) hideMenu();
    };
    const handleScroll = (e: Event) => {
      if (e.target instanceof Node && (menuRef.current?.contains(e.target) || submenuRef.current?.contains(e.target))) return;
      if (!isMobile) hideMenu();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (openSubmenu) setOpenSubmenu(null);
      else if (sheetStack.length) setSheetStack(s => s.slice(0, -1));
      else hideMenu();
    };

    // On phones the sheet's own backdrop closes it on tap. Closing on touchstart instead would
    // remove the overlay before the tap ends, and the tap would then "fall through" and activate
    // whatever is underneath.
    if (!isMobile) {
      document.addEventListener('mousedown', handlePointerDown as any);
      document.addEventListener('touchstart', handlePointerDown as any);
    }
    document.addEventListener('scroll', handleScroll, { capture: true });
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown as any);
      document.removeEventListener('touchstart', handlePointerDown as any);
      document.removeEventListener('scroll', handleScroll, { capture: true });
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuState.visible, hideMenu, isMobile, openSubmenu, sheetStack.length]);

  if (!menuState.visible || typeof document === 'undefined') return null;

  if (isMobile) {
    const activeSheet = sheetStack[sheetStack.length - 1];
    const currentItems = activeSheet ? activeSheet.items : menuState.items;

    return createPortal(
      <div
        className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm flex flex-col justify-end animate-fade-in"
        onClick={hideMenu}
      >
        <div
          ref={menuRef}
          className="w-full max-h-[calc(100dvh-env(safe-area-inset-top,0px)-1rem)] flex flex-col bg-surface-elevated/95 backdrop-blur-2xl border-t border-border rounded-t-3xl px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] shadow-2xl animate-slide-up z-[9999]"
          onClick={(e) => e.stopPropagation()}
          role="menu"
        >
          {/* Drag Pill */}
          <div className="w-10 h-1.5 bg-border rounded-full mx-auto mb-3 shrink-0" />

          {activeSheet && (
            <button
              onClick={() => setSheetStack(s => s.slice(0, -1))}
              className="w-full min-h-[44px] flex items-center gap-2 px-2 pb-2 text-[13px] font-semibold text-text-secondary text-left shrink-0"
            >
              <ChevronLeft className="w-4 h-4" /> {activeSheet.label || 'Atrás'}
            </button>
          )}

          <div className="space-y-0.5 overflow-y-auto overscroll-contain min-h-0">
            {currentItems.map((item, i) => {
              if (item.separator) {
                return <div key={`sep-${i}`} className="my-2 border-t border-border/40" />;
              }
              if (item.heading) {
                return (
                  <div key={`head-${i}`} className="px-4 pt-1 pb-2 text-xs font-semibold text-text-secondary truncate">
                    {item.heading}
                  </div>
                );
              }
              return (
                <button
                  key={i}
                  disabled={item.disabled}
                  onClick={() => {
                    if (item.submenu) { setSheetStack(s => [...s, { items: item.submenu!, label: item.label }]); return; }
                    if (item.action) item.action();
                    hideMenu();
                  }}
                  role="menuitem"
                  aria-haspopup={item.submenu ? 'menu' : undefined}
                  className={cn(
                    'w-full min-h-[48px] flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] font-medium transition-colors duration-100 text-left active:bg-surface disabled:opacity-40 disabled:pointer-events-none',
                    item.variant === 'danger'
                      ? 'text-error hover:bg-error/10'
                      : 'text-text-primary hover:bg-accent/10 hover:text-accent-light',
                    item.className
                  )}
                >
                  <MenuIcon name={item.icon} className={cn('w-[18px] h-[18px]', item.iconClassName)} color={item.iconColor} />
                  <span className="truncate flex-1">{item.label}</span>
                  {item.checked && <Check className="w-4 h-4 text-accent shrink-0" />}
                  {item.submenu && <ChevronRight className="w-4 h-4 text-text-secondary/70 shrink-0" />}
                </button>
              );
            })}
          </div>

          <button
            onClick={hideMenu}
            className="w-full mt-3 min-h-[48px] shrink-0 text-center text-[15px] font-semibold text-text-primary bg-surface rounded-xl border border-border/60 active:bg-background"
          >
            Cancelar
          </button>
        </div>
      </div>,
      document.body
    );
  }

  const renderDesktopRow = (item: MenuItem, i: number, isSubLevel: boolean) => {
    if (item.separator) {
      return <div key={`sep-${i}`} className="my-1 border-t border-border/40" />;
    }
    if (item.heading) {
      return (
        <div key={`head-${i}`} className="px-3 pt-1 pb-1.5 text-[11px] font-semibold text-text-secondary truncate max-w-[280px]">
          {item.heading}
        </div>
      );
    }
    const active = isSubLevel ? false : openSubmenu?.index === i;
    return (
      <button
        key={i}
        disabled={item.disabled}
        onMouseEnter={(e) => { if (!isSubLevel) handleRowEnter(i, item, e.currentTarget.getBoundingClientRect()); }}
        onClick={(e) => {
          if (item.submenu) {
            const rect = e.currentTarget.getBoundingClientRect();
            setOpenSubmenu(prev => (prev?.index === i ? null : { index: i, items: item.submenu!, label: item.label, anchor: rect }));
            return;
          }
          if (item.action) item.action();
          hideMenu();
        }}
        aria-haspopup={item.submenu ? 'menu' : undefined}
        aria-expanded={item.submenu ? active : undefined}
        className={cn(
          'w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors duration-100 text-left disabled:opacity-40 disabled:pointer-events-none',
          item.variant === 'danger'
            ? 'text-error hover:bg-error/10'
            : 'text-text-primary hover:bg-accent/10 hover:text-accent-light',
          active && 'bg-accent/10 text-accent-light',
          item.className
        )}
      >
        <MenuIcon name={item.icon} className={item.iconClassName} color={item.iconColor} />
        <span className="flex-1 whitespace-nowrap">{item.label}</span>
        {item.checked && <Check className="w-3.5 h-3.5 text-accent shrink-0" />}
        {item.shortcut && <kbd className="ml-4 text-[10px] font-sans text-text-secondary/80 tracking-wide">{item.shortcut}</kbd>}
        {item.submenu && <ChevronRight className="w-3.5 h-3.5 text-text-secondary/70 shrink-0 -mr-1" />}
      </button>
    );
  };

  return createPortal(
    <>
      <div
        ref={menuRef}
        className="fixed z-[9999] min-w-[200px] max-h-[calc(100dvh-16px)] overflow-y-auto overscroll-contain py-1.5 rounded-xl border border-border/60 bg-surface-elevated/90 backdrop-blur-xl shadow-2xl shadow-black/40 animate-menu-in"
        style={{ top: position.y, left: position.x }}
        onContextMenu={(e) => e.preventDefault()}
        onMouseLeave={scheduleSubmenuClose}
      >
        {menuState.items.map((item, i) => renderDesktopRow(item, i, false))}
      </div>
      {openSubmenu && (
        <div
          ref={submenuRef}
          className="fixed z-[10000] min-w-[200px] max-h-[calc(100dvh-16px)] overflow-y-auto overscroll-contain py-1.5 rounded-xl border border-border/60 bg-surface-elevated/95 backdrop-blur-xl shadow-2xl shadow-black/40 animate-menu-in"
          style={{ top: submenuPos.y, left: submenuPos.x }}
          onContextMenu={(e) => e.preventDefault()}
          onMouseEnter={cancelSubmenuClose}
          onMouseLeave={scheduleSubmenuClose}
        >
          {openSubmenu.items.map((item, i) => renderDesktopRow(item, i, true))}
        </div>
      )}
    </>,
    document.body
  );
}
