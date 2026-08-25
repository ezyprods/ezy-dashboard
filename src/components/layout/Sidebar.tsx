'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Users, CreditCard, MessageSquare, Settings, Calendar, ExternalLink, Grid, Wrench, Music } from 'lucide-react';
import { cn } from '@/lib/utils';

const mainNavItems = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Artistas', href: '/artists', icon: Users },
  { name: 'Proyectos Personales', href: '/personal-projects', icon: Music },
  { name: 'Matrices', href: '/matrices', icon: Grid },
  { name: 'Calendario', href: '/calendar', icon: Calendar },
  { name: 'Pagos', href: '/payments', icon: CreditCard },
];

const secondaryNavItems = [
  { name: 'Herramientas', href: '/tools', icon: Wrench },
  { name: 'Comunicaciones', href: '/communications', icon: MessageSquare },
  { name: 'Configuración', href: '/settings', icon: Settings },
];

export function Sidebar({ isOpen, onClose }: { isOpen?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen && onClose) {
      onClose();
    }
  }, [pathname]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const isSwipeLeft = touchStartX - touchEndX > 50;
    if (isSwipeLeft && onClose) {
      onClose();
    }
    setTouchStartX(null);
  };

  const renderNavItem = (item: { name: string; href: string; icon: any }) => {
    const isActive = pathname.startsWith(item.href);
    const isInsideSubRoute = pathname !== item.href && isActive;
    const Icon = item.icon;

    return (
      <Link
        key={item.name}
        href={item.href}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-3 md:py-2.5 rounded-lg text-base md:text-sm font-medium transition-all duration-200 group relative overflow-hidden text-left",
          isActive 
            ? "text-accent dark:text-accent-light bg-accent/10 font-bold" 
            : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
        )}
        title={isInsideSubRoute ? `Volver a ${item.name}` : item.name}
      >
        {isActive && (
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-accent rounded-r-full" />
        )}
        <Icon className={cn(
          "w-5 h-5 transition-colors",
          isActive ? "text-accent dark:text-accent-light" : "text-text-secondary group-hover:text-text-primary"
        )} />
        {item.name}
      </Link>
    );
  };

  return (
    <>
      {isOpen && (
        <div 
          className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40 md:hidden animate-fade-in"
          onClick={onClose}
        />
      )}
      <aside 
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className={cn(
          "bg-surface border-r border-border flex flex-col h-[100dvh] fixed md:sticky top-0 left-0 z-50 md:z-auto transition-transform duration-300 w-[85vw] max-w-[320px] md:w-64",
          isOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full md:translate-x-0 md:shadow-none",
        )}
      >
        <div className="h-28 flex flex-col items-center px-4 border-b border-border justify-center shrink-0">
          <Link href="/dashboard" className="flex items-center w-full justify-center group relative -translate-x-2">
            {/* Light Mode Logo */}
            <Image
              src="/logo-black-trimmed.png"
              alt="EZY"
              width={240}
              height={96}
              className="logo-light h-10 w-auto object-contain transition-transform group-hover:scale-105"
              priority
            />
            {/* Dark Mode Logo (White) */}
            <Image
              src="/logo-trimmed.png"
              alt="EZY"
              width={240}
              height={96}
              className="logo-dark h-10 w-auto object-contain transition-transform group-hover:scale-105"
              priority
            />
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto py-5 px-4 space-y-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-text-secondary/70 mb-2 px-3">
              Principal
            </p>
            <div className="space-y-1">
              {mainNavItems.map(renderNavItem)}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-text-secondary/70 mb-2 px-3">
              Herramientas & Configuración
            </p>
            <div className="space-y-1">
              {secondaryNavItems.map(renderNavItem)}
            </div>
          </div>
        </nav>

        <div className="p-4 border-t border-border mt-auto shrink-0">
          <div className="glass rounded-xl p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-text-secondary">Conectado a Google Drive</p>
              <a 
                href="https://drive.google.com/drive/folders/182uxxUjN7KJJDm1vAZ_AEyKvAwwcTPxY?usp=drive_link" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-text-secondary hover:text-accent transition-colors p-1 rounded hover:bg-surface-elevated"
                title="Abrir Google Drive"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
            <div className="flex items-center gap-2 text-sm text-success font-medium">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span>Sincronizado</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
