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

/** iOS convention: tapping the tab you're already on scrolls its content back to the top. */
function scrollCurrentPageToTop() {
  const main = document.getElementById('app-main');
  if (!main) return;
  const scrollables = [main, ...Array.from(main.querySelectorAll<HTMLElement>('*'))].filter((el) => {
    if (el.scrollTop <= 0 || el.scrollHeight <= el.clientHeight) return false;
    return /(auto|scroll)/.test(getComputedStyle(el).overflowY);
  });
  scrollables.forEach((el) => el.scrollTo({ top: 0, behavior: 'smooth' }));
}

export function MobileNavbar() {
  const pathname = usePathname();

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-surface-elevated/95 backdrop-blur-xl border-t border-border pb-[env(safe-area-inset-bottom)] px-safe shadow-[0_-10px_40px_rgba(0,0,0,0.1)]"
      aria-label="Navegación"
    >
      <div className="flex items-stretch justify-around h-[64px] px-1">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const isExact = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              onClick={(e) => {
                if (isExact) {
                  e.preventDefault();
                  scrollCurrentPageToTop();
                }
              }}
              className={cn(
                "flex flex-col items-center justify-center flex-1 min-w-0 gap-0.5 transition-transform active:scale-95 select-none",
                isActive ? "text-accent" : "text-text-secondary"
              )}
            >
              <div className={cn(
                "px-3 py-1 rounded-xl transition-all duration-200",
                isActive ? "bg-accent/15 text-accent" : "bg-transparent text-text-secondary"
              )}>
                <Icon className={cn("w-[22px] h-[22px]", isActive && "fill-accent/20")} strokeWidth={isActive ? 2.4 : 2} />
              </div>
              <span className={cn(
                "text-[10.5px] tracking-tight leading-tight transition-all duration-200 text-center truncate max-w-full px-0.5",
                isActive ? "font-bold text-accent" : "font-medium text-text-secondary opacity-80"
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
