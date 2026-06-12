'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Lock, Loader2, AlertCircle } from 'lucide-react';
import { APP_NAME } from '@/lib/constants';

const AUTH_KEY = 'ezy_dashboard_secure_auth';
const AUTH_PASSWORD = '20923954Aa*';
const REMEMBER_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days

export function PasswordGuard({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const authTime = localStorage.getItem(AUTH_KEY);
    if (authTime) {
      const parsedTime = parseInt(authTime, 10);
      const isExpired = Date.now() - parsedTime > REMEMBER_DURATION;
      
      if (!isExpired) {
        setIsAuthenticated(true);
        return;
      }
    }
    setIsAuthenticated(false);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === AUTH_PASSWORD) {
      localStorage.setItem(AUTH_KEY, Date.now().toString());
      setIsAuthenticated(true);
      setError('');
    } else {
      setError('Contraseña incorrecta. Por favor, inténtalo de nuevo.');
    }
  };

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-background flex justify-center items-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
        {/* Glowing background shapes */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent/15 rounded-full blur-[120px] pointer-events-none" />
        
        <div className="glass w-full max-w-md rounded-2xl p-8 shadow-2xl relative z-10 border border-border/50 animate-slide-in">
          <div className="flex flex-col items-center text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-accent to-accent-secondary flex items-center justify-center shadow-lg shadow-accent/20 glow">
              <Lock className="w-8 h-8 text-white" />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-text-primary">Acceso Protegido</h1>
              <p className="text-xs text-text-secondary">
                Este estudio es privado. Por favor, introduce la contraseña para acceder a {APP_NAME}.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="w-full space-y-4">
              <div className="space-y-1">
                <input
                  type="password"
                  className="w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent text-center tracking-widest"
                  placeholder="Introduce la contraseña"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-xs text-error bg-error/10 border border-error/20 p-2.5 rounded-lg">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button type="submit" size="lg" className="w-full font-semibold">
                Desbloquear Estudio
              </Button>
            </form>
            
            <p className="text-[10px] text-text-secondary">
              Se recordará este dispositivo durante los próximos 30 días para tu comodidad.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
