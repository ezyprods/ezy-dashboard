'use client';

import { Bell, Menu } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CommandMenu } from '@/components/layout/CommandMenu';

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
