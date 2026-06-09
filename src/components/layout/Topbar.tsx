'use client';

import { Bell, Menu } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CommandMenu } from '@/components/layout/CommandMenu';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

export function Topbar() {
  return (
    <header className="h-16 border-b border-border bg-surface/80 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between px-6">
      <div className="flex items-center flex-1">
        {/* Mobile menu button */}
        <Button variant="ghost" size="icon" className="md:hidden mr-2">
          <Menu className="w-5 h-5" />
        </Button>

        {/* Global Search */}
        <CommandMenu />
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />

        <div className="relative group">
          <Button variant="ghost" size="icon" className="relative cursor-pointer">
            <Bell className="w-5 h-5" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full border border-surface" />
          </Button>
          <div className="absolute right-0 mt-2 w-64 glass rounded-xl shadow-xl border border-border opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 p-4">
            <h4 className="font-bold text-sm mb-2 text-text-primary">Notificaciones</h4>
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Bell className="w-8 h-8 text-text-secondary opacity-50 mb-2" />
              <p className="text-xs text-text-secondary">No tienes notificaciones nuevas.</p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3 border-l border-border pl-4 ml-2 group relative cursor-pointer">
          <div className="w-9 h-9 rounded-full bg-surface-elevated border border-border flex items-center justify-center overflow-hidden">
            <span className="text-sm font-medium">P</span>
          </div>
          <div className="hidden md:block">
            <p className="text-sm font-medium text-text-primary">Productor</p>
            <p className="text-xs text-text-secondary">Admin</p>
          </div>
          
          {/* Profile Dropdown */}
          <div className="absolute right-0 top-full mt-2 w-48 glass rounded-xl shadow-xl border border-border opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 p-2">
            <button 
              onClick={async () => {
                const { authClient } = await import('@/lib/auth-client');
                await authClient.signOut();
                window.location.reload();
              }}
              className="w-full text-left px-4 py-2 text-sm text-error hover:bg-error/10 rounded-lg transition-colors flex items-center gap-2"
            >
              Cerrar Sesión
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
