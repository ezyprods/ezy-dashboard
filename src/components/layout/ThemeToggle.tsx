'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem('theme') as 'dark' | 'light' | null;
    const initial = stored || 'dark';
    setTheme(initial);
    applyTheme(initial);
  }, []);

  const applyTheme = (t: 'dark' | 'light') => {
    const root = document.documentElement;
    root.classList.remove('dark', 'light');
    root.classList.add(t);
  };

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
    localStorage.setItem('theme', next);
  };

  // Avoid hydration mismatch
  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="relative">
        <Moon className="w-5 h-5" />
      </Button>
    );
  }

  return (
    <Button variant="ghost" size="icon" className="relative" onClick={toggle} title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}>
      {theme === 'dark' ? (
        <Sun className="w-5 h-5 text-text-secondary hover:text-warning transition-colors" />
      ) : (
        <Moon className="w-5 h-5 text-text-secondary hover:text-accent transition-colors" />
      )}
    </Button>
  );
}
