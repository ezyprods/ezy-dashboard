'use client';

import { useTheme } from '@/lib/contexts/ThemeContext';
import { Moon, Sun, Monitor } from 'lucide-react';
import { APP_NAME } from '@/lib/constants';

export function AppearanceTab() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h2 className="text-xl font-semibold text-text-primary mb-2">Tema y Apariencia</h2>
        <p className="text-text-secondary text-sm mb-6">
          Personaliza el aspecto visual de {APP_NAME} según tus preferencias o el entorno de tu estudio.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          {[
            { id: 'light', label: 'Claro', icon: Sun },
            { id: 'dark', label: 'Oscuro', icon: Moon },
            { id: 'system', label: 'Sistema', icon: Monitor }
          ].map((mode) => {
            const isSelected = theme === mode.id;
            const Icon = mode.icon;
            
            return (
              <button
                key={mode.id}
                onClick={() => setTheme(mode.id as 'light' | 'dark' | 'system')}
                className={`relative flex flex-col items-center justify-center p-8 rounded-2xl border transition-all duration-500 group overflow-hidden ${
                  isSelected
                    ? 'border-accent bg-accent/5 shadow-[0_0_20px_rgba(var(--accent),0.15)] ring-1 ring-accent/30'
                    : 'border-border bg-surface hover:border-accent/40 hover:bg-surface-elevated hover:shadow-lg'
                }`}
              >
                {isSelected && (
                  <div className="absolute inset-0 bg-gradient-to-tr from-accent/20 to-transparent opacity-50 pointer-events-none" />
                )}
                
                <div className={`p-4 rounded-full mb-4 transition-all duration-500 relative z-10 ${isSelected ? 'bg-accent/20 scale-110 shadow-inner' : 'bg-surface-elevated group-hover:scale-110 group-hover:bg-accent/10'}`}>
                  <Icon className={`w-8 h-8 transition-colors duration-500 ${isSelected ? 'text-accent' : 'text-text-secondary group-hover:text-accent/70'}`} />
                </div>
                
                <span className={`font-semibold text-lg tracking-wide relative z-10 transition-colors duration-500 ${isSelected ? 'text-accent drop-shadow-sm' : 'text-text-primary'}`}>
                  {mode.label}
                </span>

                {isSelected && (
                  <div className="absolute top-4 right-4 w-3 h-3 rounded-full bg-accent ring-4 ring-accent/20 animate-pulse" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
