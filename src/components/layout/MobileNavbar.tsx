'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, Grid, Calendar, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Artistas', href: '/artists', icon: Users },
  { name: 'Matrices', href: '/matrices', icon: Grid },
  { name: 'Calendario', href: '/calendar', icon: Calendar },
  { name: 'Herramientas', href: '/tools', icon: Wrench },
];

export function MobileNavbar() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-surface-elevated/95 backdrop-blur-xl border-t border-border pb-[env(safe-area-inset-bottom)] animate-slide-up shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">
      <div className="flex items-center justify-around h-[64px] px-1 py-1">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center w-full h-full gap-0.5 transition-all active:scale-95 select-none",
                isActive ? "text-accent" : "text-text-secondary"
              )}
            >
              <div className={cn(
                "p-1 rounded-xl transition-all duration-200",
                isActive ? "bg-accent/15 scale-105 text-accent" : "bg-transparent text-text-secondary"
              )}>
                <Icon className={cn("w-5 h-5", isActive && "fill-accent/20")} strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span className={cn(
                "text-[10.5px] tracking-tight leading-tight transition-all duration-200 text-center truncate max-w-full px-0.5",
                isActive ? "font-bold text-accent opacity-100" : "font-medium text-text-secondary opacity-80"
              )}>
                {item.name}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
