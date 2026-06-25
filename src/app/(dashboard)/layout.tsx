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

  return (
    <ContextMenuProvider>
      <PasswordGuard>
        <GlobalDragDropProvider>
          <div className="flex h-screen overflow-hidden bg-background">
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
