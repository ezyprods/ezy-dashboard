'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { ContextMenuProvider } from '@/lib/contexts/ContextMenuContext';
import { GlobalContextMenu } from '@/components/ui/ContextMenu';
import { PasswordGuard } from '@/components/layout/PasswordGuard';
import { GlobalDragDropProvider } from '@/lib/contexts/GlobalDragDropContext';
import { GlobalDropZone } from '@/components/layout/GlobalDropZone';
import { MobileNavbar } from '@/components/layout/MobileNavbar';
import { AppDataProvider } from '@/lib/contexts/AppDataContext';
import { useAudio } from '@/lib/contexts/AudioContext';
import { cn } from '@/lib/utils';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { currentTrack } = useAudio();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.targetTouches[0];
    setTouchStart({ x: touch.clientX, y: touch.clientY });
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart) return;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStart.x;
    const deltaY = touch.clientY - touchStart.y;
    
    // Predominantly horizontal swipe right with at least 45px displacement
    const isSwipeRight = deltaX > 45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2;
    // Open if the swipe starts anywhere in the left portion of the screen (within 150px)
    if (isSwipeRight && touchStart.x < 150) {
      setIsSidebarOpen(true);
    }
    setTouchStart(null);
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
            >
              <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
              <div className="flex flex-col flex-1 w-full overflow-hidden min-h-0">
                <Topbar onMenuClick={() => setIsSidebarOpen(true)} />
                <main className={cn(
                  "flex-1 flex flex-col min-h-0 overflow-y-auto p-4 md:p-6 scroll-smooth transition-[padding] duration-300",
                  currentTrack 
                    ? "pb-[calc(8.5rem+env(safe-area-inset-bottom,0px))] md:pb-32" 
                    : "pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:pb-16"
                )}>
                  {children}
                </main>
              </div>
            </div>
            <MobileNavbar />
            <GlobalDropZone />
            <GlobalContextMenu />
          </GlobalDragDropProvider>
        </AppDataProvider>
      </PasswordGuard>
    </ContextMenuProvider>
  );
}
