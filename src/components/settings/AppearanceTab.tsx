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
                className={`relative flex flex-col items-center justify-center p-8 rounded-2xl border transition-all duration-300 group overflow-hidden ${
                  isSelected
                    ? 'border-accent bg-accent/5'
                    : 'border-border bg-surface hover:border-accent/50 hover:bg-surface-elevated'
                }`}
              >
                {isSelected && (
                  <div className="absolute inset-0 bg-accent/10 animate-pulse pointer-events-none" />
                )}
                
                <div className={`p-4 rounded-full mb-4 transition-transform duration-300 ${isSelected ? 'bg-accent/20 scale-110' : 'bg-surface-elevated group-hover:scale-110'}`}>
                  <Icon className={`w-8 h-8 ${isSelected ? 'text-accent' : 'text-text-secondary'}`} />
                </div>
                
                <span className={`font-semibold text-lg tracking-wide ${isSelected ? 'text-accent' : 'text-text-primary'}`}>
                  {mode.label}
                </span>

                {isSelected && (
                  <div className="absolute top-4 right-4 w-3 h-3 rounded-full bg-accent ring-4 ring-accent/20" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
