'use client';

import { Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/lib/contexts/ThemeContext';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  const toggle = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative cursor-pointer min-h-[44px] min-w-[44px]"
      onClick={toggle}
      title={resolvedTheme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      aria-label="Cambiar tema"
    >
      {resolvedTheme === 'dark' ? (
        <Sun className="w-5 h-5 text-text-secondary hover:text-warning transition-colors" />
      ) : (
        <Moon className="w-5 h-5 text-text-secondary hover:text-accent transition-colors" />
      )}
    </Button>
  );
}
