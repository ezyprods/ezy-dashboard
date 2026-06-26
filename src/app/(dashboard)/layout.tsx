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
import { AudioMetadataWorker } from '@/components/layout/AudioMetadataWorker';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const touchEnd = e.changedTouches[0].clientX;
    const isSwipeRight = touchEnd - touchStart > 50;
    // Only open if the swipe started near the left edge (e.g. within 40px)
    if (isSwipeRight && touchStart < 40) {
      setIsSidebarOpen(true);
    }
    setTouchStart(null);
  };

  return (
    <ContextMenuProvider>
      <PasswordGuard>
        <GlobalDragDropProvider>
          <div 
            className="flex h-screen overflow-hidden bg-background"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
            <div className="flex flex-col flex-1 w-full overflow-hidden min-h-0">
              <Topbar onMenuClick={() => setIsSidebarOpen(true)} />
              <main className="flex-1 flex flex-col min-h-0 overflow-y-auto p-4 md:p-6 pb-[calc(1rem+68px+env(safe-area-inset-bottom,0px))] md:pb-6 scroll-smooth">
                {children}
              </main>
            </div>
          </div>
          <MobileNavbar />
          <AudioMetadataWorker />
          <GlobalDropZone />
          <GlobalContextMenu />
        </GlobalDragDropProvider>
      </PasswordGuard>
    </ContextMenuProvider>
  );
}
