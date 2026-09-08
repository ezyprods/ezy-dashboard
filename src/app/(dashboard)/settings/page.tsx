'use client';

import { useState } from 'react';
import { Settings, Palette, Database, Shield, HardDrive, User, Bell, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppearanceTab } from '@/components/settings/AppearanceTab';
import { DriveTab } from '@/components/settings/DriveTab';
import { SecurityTab } from '@/components/settings/SecurityTab';
import { CacheTab } from '@/components/settings/CacheTab';
import { ProfileTab } from '@/components/settings/ProfileTab';
import { NotificationsTab } from '@/components/settings/NotificationsTab';
import { PortalsAccessTab } from '@/components/settings/PortalsAccessTab';

type TabType = 'profile' | 'appearance' | 'notifications' | 'drive' | 'cache' | 'security' | 'portals';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('profile');

  const tabs = [
    { id: 'profile', label: 'Perfil del Estudio', icon: User },
    { id: 'appearance', label: 'Apariencia', icon: Palette },
    { id: 'notifications', label: 'Alertas y Sonido', icon: Bell },
    { id: 'drive', label: 'Google Drive', icon: Database },
    { id: 'portals', label: 'Accesos a Portales', icon: Globe },
    { id: 'cache', label: 'Datos y Caché', icon: HardDrive },
    { id: 'security', label: 'Seguridad', icon: Shield },
  ] as const;

  const renderTab = () => {
    switch (activeTab) {
      case 'profile':
        return <ProfileTab />;
      case 'appearance':
        return <AppearanceTab />;
      case 'notifications':
        return <NotificationsTab />;
      case 'drive':
        return <DriveTab />;
      case 'portals':
        return <PortalsAccessTab />;
      case 'cache':
        return <CacheTab />;
      case 'security':
        return <SecurityTab />;
      default:
        return null;
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto py-8 px-4 sm:px-6 min-w-0 overflow-hidden">
      <div className="flex items-center gap-3 mb-6 md:mb-8">
        <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-gradient-to-br from-surface-elevated to-surface border border-border flex items-center justify-center shadow-lg shrink-0">
          <Settings className="w-5 h-5 md:w-6 md:h-6 text-accent" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-text-primary tracking-tight">Configuración</h1>
          <p className="text-text-secondary text-sm hidden sm:block">
            Personaliza el panel de control y administra tus integraciones.
          </p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 w-full min-w-0 overflow-hidden">
        {/* Navigation Sidebar */}
        <aside className="w-full lg:w-64 shrink-0 min-w-0 overflow-hidden">
          <nav className="flex lg:flex-col gap-2 overflow-x-auto pb-2 lg:pb-0 scrollbar-hide snap-x snap-mandatory lg:snap-none relative w-full">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TabType)}
                  className={cn(
                    "relative flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-300 text-sm font-semibold whitespace-nowrap group snap-start min-h-[48px] shrink-0 lg:shrink lg:w-full overflow-hidden",
                    isActive
                      ? "text-accent bg-accent/5 shadow-sm ring-1 ring-accent/20"
                      : "text-text-secondary hover:bg-surface-elevated/50 hover:text-text-primary"
                  )}
                >
                  {/* Active Indicator Line */}
                  {isActive && (
                    <div className="absolute left-0 right-0 bottom-0 h-1 bg-accent shadow-[0_0_8px_rgba(var(--accent),0.6)] lg:top-0 lg:right-auto lg:bottom-0 lg:w-1" />
                  )}
                  {/* Subtle hover/active glow */}
                  {isActive && (
                    <div className="absolute inset-0 bg-gradient-to-r from-accent/10 to-transparent opacity-50" />
                  )}
                  
                  <Icon className={cn(
                    "w-5 h-5 transition-transform duration-300 relative z-10",
                    isActive ? "scale-110 drop-shadow-md" : "group-hover:scale-110"
                  )} />
                  <span className="relative z-10">{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Tab Content Area */}
        <div role="region" aria-label="Contenido de configuración" className="flex-1 min-w-0 w-full overflow-hidden">
          <div className="bg-surface/80 backdrop-blur-2xl p-5 sm:p-6 lg:p-10 rounded-3xl border border-border/60 shadow-[0_8px_30px_rgb(0,0,0,0.12)] relative overflow-hidden transition-all duration-500 min-h-[500px]">
            {/* Ambient Background Glow */}
            <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-accent/10 rounded-full blur-[100px] pointer-events-none opacity-60" />
            <div className="absolute bottom-[-20%] left-[-10%] w-[300px] h-[300px] bg-purple-500/10 rounded-full blur-[80px] pointer-events-none opacity-40" />
            
            <div className="relative z-10">
              {renderTab()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
