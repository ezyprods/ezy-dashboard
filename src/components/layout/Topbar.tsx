'use client';

import { Search, Bell, Menu } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function Topbar() {
  return (
    <header className="h-16 border-b border-border bg-surface/80 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between px-6">
      <div className="flex items-center flex-1">
        {/* Mobile menu button */}
        <Button variant="ghost" size="icon" className="md:hidden mr-2">
          <Menu className="w-5 h-5" />
        </Button>

        {/* Search bar */}
        <button className="hidden md:flex items-center gap-2 px-4 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-text-secondary hover:border-accent/50 transition-colors w-64 max-w-md group">
          <Search className="w-4 h-4 group-hover:text-accent transition-colors" />
          <span>Buscar (Cmd+K)...</span>
        </button>
      </div>

      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full border border-surface" />
        </Button>
        
        <div className="flex items-center gap-3 border-l border-border pl-4">
          <div className="w-9 h-9 rounded-full bg-surface-elevated border border-border flex items-center justify-center overflow-hidden">
            <span className="text-sm font-medium">P</span>
          </div>
          <div className="hidden md:block">
            <p className="text-sm font-medium text-text-primary">Productor</p>
            <p className="text-xs text-text-secondary">Admin</p>
          </div>
        </div>
      </div>
    </header>
  );
}
