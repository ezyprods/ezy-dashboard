'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Users, CreditCard, MessageSquare, Settings, Calendar, ExternalLink, Grid } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Artistas', href: '/artists', icon: Users },
  { name: 'Matrices', href: '/matrices', icon: Grid },
  { name: 'Calendario', href: '/calendar', icon: Calendar },
  { name: 'Pagos', href: '/payments', icon: CreditCard },
  { name: 'Comunicaciones', href: '/communications', icon: MessageSquare },
  { name: 'Configuración', href: '/settings', icon: Settings },
];

export function Sidebar({ isOpen, onClose }: { isOpen?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (isOpen && onClose) {
      onClose();
    }
  }, [pathname]);

  return (
    <>
      {isOpen && (
        <div 
          className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40 md:hidden animate-fade-in"
          onClick={onClose}
        />
      )}
      <aside 
        className={cn(
          "w-64 border-r border-border bg-surface flex flex-col h-screen fixed md:sticky top-0 left-0 z-50 md:z-auto transition-transform duration-300",
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        <div className="h-28 flex items-center px-4 border-b border-border justify-center md:justify-start">
          <Link href="/dashboard" className="flex items-center w-full justify-center mt-2">
            {/* Light Mode Logo */}
            <Image
              src="/logo-black-trimmed.png"
              alt="EZY"
              width={240}
              height={96}
              className="logo-light h-14 w-auto object-contain"
              priority
            />
            {/* Dark Mode Logo (White) */}
            <Image
              src="/logo-trimmed.png"
              alt="EZY"
              width={240}
              height={96}
              className="logo-dark h-14 w-auto object-contain"
              priority
            />
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            const isInsideSubRoute = pathname !== item.href && isActive;
            const Icon = item.icon;
            
            return (
              <button
                key={item.name}
                onClick={() => router.push(item.href)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group relative overflow-hidden text-left",
                  isActive 
                    ? "text-white bg-accent/10" 
                    : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
                )}
                title={isInsideSubRoute ? `Volver a ${item.name}` : item.name}
              >
                {isActive && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-accent rounded-r-full" />
                )}
                <Icon className={cn(
                  "w-5 h-5 transition-colors",
                  isActive ? "text-accent-light" : "text-text-secondary group-hover:text-text-primary"
                )} />
                {item.name}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border mt-auto">
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
            <div className="flex items-center gap-2 text-sm text-success">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span>Sincronizado</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
