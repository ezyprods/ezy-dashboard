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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => setTheme('light')}
            className={`relative flex flex-col items-center justify-center p-6 rounded-2xl border transition-all duration-300 ${
              theme === 'light'
                ? 'border-accent bg-accent/10 shadow-[0_0_20px_rgba(108,92,231,0.15)]'
                : 'border-border bg-surface hover:border-accent/50 hover:bg-surface-elevated'
            }`}
          >
            <Sun className={`w-8 h-8 mb-4 ${theme === 'light' ? 'text-accent' : 'text-text-secondary'}`} />
            <span className={`font-medium ${theme === 'light' ? 'text-accent' : 'text-text-primary'}`}>Claro</span>
            {theme === 'light' && (
              <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-accent" />
            )}
          </button>

          <button
            onClick={() => setTheme('dark')}
            className={`relative flex flex-col items-center justify-center p-6 rounded-2xl border transition-all duration-300 ${
              theme === 'dark'
                ? 'border-accent bg-accent/10 shadow-[0_0_20px_rgba(108,92,231,0.15)]'
                : 'border-border bg-surface hover:border-accent/50 hover:bg-surface-elevated'
            }`}
          >
            <Moon className={`w-8 h-8 mb-4 ${theme === 'dark' ? 'text-accent' : 'text-text-secondary'}`} />
            <span className={`font-medium ${theme === 'dark' ? 'text-accent' : 'text-text-primary'}`}>Oscuro</span>
            {theme === 'dark' && (
              <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-accent" />
            )}
          </button>

          <button
            onClick={() => setTheme('system')}
            className={`relative flex flex-col items-center justify-center p-6 rounded-2xl border transition-all duration-300 ${
              theme === 'system'
                ? 'border-accent bg-accent/10 shadow-[0_0_20px_rgba(108,92,231,0.15)]'
                : 'border-border bg-surface hover:border-accent/50 hover:bg-surface-elevated'
            }`}
          >
            <Monitor className={`w-8 h-8 mb-4 ${theme === 'system' ? 'text-accent' : 'text-text-secondary'}`} />
            <span className={`font-medium ${theme === 'system' ? 'text-accent' : 'text-text-primary'}`}>Sistema</span>
            {theme === 'system' && (
              <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-accent" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
