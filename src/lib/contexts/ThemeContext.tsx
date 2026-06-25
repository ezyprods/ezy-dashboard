'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

type Theme = 'dark' | 'light' | 'system';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'dark' | 'light';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>('dark');
  const pathname = usePathname();
  const isPortal = pathname?.startsWith('/portal');

  // Load from local storage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('ezy_theme') as Theme;
    if (savedTheme) {
      setThemeState(savedTheme);
    } else {
      // Check system preference
      const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
      if (prefersLight) {
        setThemeState('system');
      }
    }
  }, []);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem('ezy_theme', newTheme);
  };

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');

    if (isPortal) {
      root.classList.add('light');
      root.style.colorScheme = 'light';
      setResolvedTheme('light');
      return;
    }

    let currentTheme: 'dark' | 'light' = 'dark';

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      currentTheme = systemTheme;
      root.classList.add(systemTheme);
    } else {
      currentTheme = theme;
      root.classList.add(theme);
    }
    
    // Fallback for custom logic if needed
    root.style.colorScheme = currentTheme;
    setResolvedTheme(currentTheme);

  }, [theme, isPortal]);

  // Listen for system changes if set to system
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      const root = window.document.documentElement;
      root.classList.remove('light', 'dark');
      const newSystemTheme = mediaQuery.matches ? 'dark' : 'light';
      root.classList.add(newSystemTheme);
      root.style.colorScheme = newSystemTheme;
      setResolvedTheme(newSystemTheme);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
