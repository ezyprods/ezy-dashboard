'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, Grid, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Artistas', href: '/artists', icon: Users },
  { name: 'Matrices', href: '/matrices', icon: Grid },
  { name: 'Calendario', href: '/calendar', icon: Calendar },
];

export function MobileNavbar() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface-elevated/95 backdrop-blur-xl border-t border-border pb-[env(safe-area-inset-bottom)] animate-slide-up shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">
      <div className="flex items-center justify-around h-[68px] px-2">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center w-full h-full gap-1 transition-all active:scale-90",
                isActive ? "text-accent" : "text-text-secondary"
              )}
            >
              <div className={cn(
                "p-1.5 rounded-2xl transition-all duration-300",
                isActive ? "bg-accent/15 scale-110" : "bg-transparent scale-100"
              )}>
                <Icon className={cn("w-6 h-6", isActive && "fill-accent/20")} strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span className={cn(
                "text-[10px] tracking-wide transition-all duration-300",
                isActive ? "font-bold opacity-100" : "font-medium opacity-80"
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
