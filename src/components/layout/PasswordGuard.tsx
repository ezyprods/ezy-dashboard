'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Lock, Loader2, AlertCircle } from 'lucide-react';
import { APP_NAME } from '@/lib/constants';

const AUTH_KEY = 'ezy_dashboard_secure_auth';
const AUTH_PASSWORD = '20923954Aa*';
const REMEMBER_DURATION = 365 * 24 * 60 * 60 * 1000; // 365 days (1 year)

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const nameEQ = name + "=";
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}

function setCookie(name: string, value: string, days: number) {
  if (typeof document === 'undefined') return;
  let expires = "";
  if (days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    expires = "; expires=" + date.toUTCString();
  }
  document.cookie = name + "=" + (value || "") + expires + "; path=/; SameSite=Lax; Secure";
}

export function PasswordGuard({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const localAuth = localStorage.getItem(AUTH_KEY);
    const cookieAuth = getCookie(AUTH_KEY);
    
    let activeAuthTime: string | null = null;
    
    if (localAuth) {
      const parsedTime = parseInt(localAuth, 10);
      const isExpired = Date.now() - parsedTime > REMEMBER_DURATION;
      if (!isExpired) {
        activeAuthTime = localAuth;
      }
    }
    
    // Fallback/restore from cookie if localStorage is empty or expired but cookie has a valid one
    if (!activeAuthTime && cookieAuth) {
      const parsedTime = parseInt(cookieAuth, 10);
      const isExpired = Date.now() - parsedTime > REMEMBER_DURATION;
      if (!isExpired) {
        activeAuthTime = cookieAuth;
      }
    }
    
    if (activeAuthTime) {
      // Keep both in sync to prevent logout if one gets cleared
      localStorage.setItem(AUTH_KEY, activeAuthTime);
      setCookie(AUTH_KEY, activeAuthTime, 365);
      setIsAuthenticated(true);
    } else {
      setIsAuthenticated(false);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === AUTH_PASSWORD) {
      const nowStr = Date.now().toString();
      localStorage.setItem(AUTH_KEY, nowStr);
      setCookie(AUTH_KEY, nowStr, 365);
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
              Se recordará este dispositivo durante 1 año para tu comodidad.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
