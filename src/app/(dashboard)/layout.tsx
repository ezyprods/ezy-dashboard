'use client';

import { useRef, useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { ContextMenuProvider } from '@/lib/contexts/ContextMenuContext';
import { GlobalContextMenu } from '@/components/ui/ContextMenu';
import { PasswordGuard } from '@/components/layout/PasswordGuard';
import { GlobalDragDropProvider } from '@/lib/contexts/GlobalDragDropContext';
import { GlobalDropZone } from '@/components/layout/GlobalDropZone';
import { GlobalActionModals } from '@/components/layout/GlobalActionModals';
import { MobileNavbar } from '@/components/layout/MobileNavbar';
import { AppDataProvider } from '@/lib/contexts/AppDataContext';
import { useAudio } from '@/lib/contexts/AudioContext';
import { cn } from '@/lib/utils';

/**
 * A right-swipe should only open the drawer when it happens on the page itself — not while the
 * finger is scrolling a horizontal list (kanban, tabs, grids), dragging a slider, or interacting
 * with something floating above the page (modals, sheets, the audio player).
 */
function canStartDrawerSwipe(target: EventTarget | null): boolean {
  let el = target instanceof Element ? target : null;
  while (el && el !== document.body) {
    if (el.matches('input, textarea, select, [contenteditable="true"], [data-no-swipe]')) return false;
    const style = getComputedStyle(el);
    if (style.position === 'fixed') return false;
    const scrollsX = /(auto|scroll)/.test(style.overflowX) && el.scrollWidth > el.clientWidth + 1;
    if (scrollsX && el.scrollLeft > 0) return false;
    el = el.parentElement;
  }
  return true;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { currentTrack } = useAudio();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.targetTouches[0];
    // Start from the left portion of the screen, but not the very edge: iOS Safari reserves the
    // first ~20px for its own "back" swipe gesture.
    if (e.touches.length !== 1 || touch.clientX < 16 || touch.clientX > 150 || !canStartDrawerSwipe(e.target)) {
      touchStartRef.current = null;
      return;
    }
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;

    // Predominantly horizontal swipe right with at least 60px displacement
    if (deltaX > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      setIsSidebarOpen(true);
    }
  };

  return (
    <ContextMenuProvider>
      <PasswordGuard>
        <AppDataProvider>
          <GlobalDragDropProvider>
            <div
              className="flex h-[100dvh] overflow-hidden bg-background overscroll-x-none"
              style={{ overscrollBehaviorX: 'none' }}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={() => { touchStartRef.current = null; }}
            >
              <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
              <div className="flex flex-col flex-1 w-full overflow-hidden min-h-0">
                <Topbar onMenuClick={() => setIsSidebarOpen(true)} />
                <main
                  id="app-main"
                  className={cn(
                    "flex-1 flex flex-col min-h-0 overflow-y-auto p-4 md:p-6 scroll-smooth transition-[padding] duration-300",
                    "pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] md:pl-6 md:pr-6",
                    // Mobile: leave room for the bottom tab bar (64px) and, when present, the mini player (62px)
                    currentTrack
                      ? "pb-[calc(8.5rem+env(safe-area-inset-bottom,0px))] md:pb-32"
                      : "pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:pb-16"
                  )}
                >
                  {children}
                </main>
              </div>
            </div>
            <MobileNavbar />
            <GlobalDropZone />
            <GlobalActionModals />
            <GlobalContextMenu />
          </GlobalDragDropProvider>
        </AppDataProvider>
      </PasswordGuard>
    </ContextMenuProvider>
  );
}
