'use client';

import { useState } from 'react';
import { Settings, Palette, Database, Shield, HardDrive, User, Bell } from 'lucide-react';
import { AppearanceTab } from '@/components/settings/AppearanceTab';
import { DriveTab } from '@/components/settings/DriveTab';
import { SecurityTab } from '@/components/settings/SecurityTab';
import { CacheTab } from '@/components/settings/CacheTab';
import { ProfileTab } from '@/components/settings/ProfileTab';
import { NotificationsTab } from '@/components/settings/NotificationsTab';

type TabType = 'profile' | 'appearance' | 'notifications' | 'drive' | 'cache' | 'security';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('profile');

  const tabs = [
    { id: 'profile', label: 'Perfil del Estudio', icon: User },
    { id: 'appearance', label: 'Apariencia', icon: Palette },
    { id: 'notifications', label: 'Alertas y Sonido', icon: Bell },
    { id: 'drive', label: 'Google Drive', icon: Database },
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
      case 'cache':
        return <CacheTab />;
      case 'security':
        return <SecurityTab />;
      default:
        return null;
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-surface-elevated to-surface border border-border flex items-center justify-center shadow-lg">
          <Settings className="w-6 h-6 text-accent" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-text-primary tracking-tight">Configuración</h1>
          <p className="text-text-secondary">
            Personaliza el panel de control y administra tus integraciones.
          </p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Navigation Sidebar */}
        <aside className="w-full md:w-64 shrink-0">
          <nav className="flex md:flex-col gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide md:glass md:p-3 md:rounded-2xl md:border md:border-border/50">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TabType)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-sm font-medium whitespace-nowrap group ${
                    isActive
                      ? 'bg-accent/10 text-accent border border-accent/20 shadow-sm'
                      : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary border border-transparent'
                  }`}
                >
                  <Icon className={`w-5 h-5 transition-transform duration-300 ${isActive ? 'text-accent scale-110' : 'text-text-secondary group-hover:scale-110'}`} />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Tab Content Area */}
        <main className="flex-1 min-w-0">
          <div className="glass p-6 sm:p-8 rounded-3xl border border-border/50 shadow-xl relative overflow-hidden">
            {/* Ambient Background Glow */}
            <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-accent/5 rounded-full blur-3xl pointer-events-none" />
            
            <div className="relative z-10">
              {renderTab()}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
