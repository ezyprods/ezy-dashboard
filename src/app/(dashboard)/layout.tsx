import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { ContextMenuProvider } from '@/lib/contexts/ContextMenuContext';
import { GlobalContextMenu } from '@/components/ui/ContextMenu';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ContextMenuProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        <div className="flex flex-col flex-1 w-full overflow-hidden">
          <Topbar />
          <main className="flex-1 overflow-y-auto p-6 scroll-smooth">
            {children}
          </main>
        </div>
      </div>
      <GlobalContextMenu />
    </ContextMenuProvider>
  );
}
