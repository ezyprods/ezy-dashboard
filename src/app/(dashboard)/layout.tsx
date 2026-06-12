'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { ContextMenuProvider } from '@/lib/contexts/ContextMenuContext';
import { GlobalContextMenu } from '@/components/ui/ContextMenu';
import { PasswordGuard } from '@/components/layout/PasswordGuard';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <ContextMenuProvider>
      <PasswordGuard>
        <div className="flex h-screen overflow-hidden bg-background">
          <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
          <div className="flex flex-col flex-1 w-full overflow-hidden">
            <Topbar onMenuClick={() => setIsSidebarOpen(true)} />
            <main className="flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth">
              {children}
            </main>
          </div>
        </div>
        <GlobalContextMenu />
      </PasswordGuard>
    </ContextMenuProvider>
  );
}
