'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { Lock, Loader2, AlertCircle } from 'lucide-react';
import { APP_NAME } from '@/lib/constants';

// La contraseña se valida en el servidor (/api/studio/unlock), que responde con una cookie
// httpOnly firmada. El navegador nunca ve la contraseña ni puede falsificar el desbloqueo.

// Restos del antiguo guard (validado en el cliente): ya no dan acceso, solo se limpian
const LEGACY_AUTH_KEY = 'ezy_dashboard_secure_auth';
const LEGACY_DB_NAME = 'ezy_auth_db';

function purgeLegacyAuth(): void {
  try { localStorage.removeItem(LEGACY_AUTH_KEY); } catch { /* ignore */ }
  try { document.cookie = `${LEGACY_AUTH_KEY}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax`; } catch { /* ignore */ }
  try { window.indexedDB?.deleteDatabase(LEGACY_DB_NAME); } catch { /* ignore */ }
}

// ── Cerrar sesión: la cookie es httpOnly, así que solo el servidor puede borrarla ──
export async function clearAuth(): Promise<void> {
  try { await fetch('/api/studio/lock', { method: 'POST' }); } catch { /* ignore */ }
  purgeLegacyAuth();
}

export function PasswordGuard({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    purgeLegacyAuth();
    // El servidor valida la cookie y la renueva en cada visita → nunca caduca mientras se use
    fetch('/api/studio/status', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { unlocked: false }))
      .then((data) => setIsAuthenticated(data.unlocked === true))
      .catch(() => {
        setError('No se pudo comprobar el acceso. Revisa tu conexión.');
        setIsAuthenticated(false);
      });
  }, []);

  // Enfocar el input cuando aparece la pantalla de login
  useEffect(() => {
    if (isAuthenticated === false) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isAuthenticated]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/studio/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput }),
      });
      if (res.ok) {
        setIsAuthenticated(true);
        return;
      }
      if (res.status === 401) {
        setError('Contraseña incorrecta. Por favor, inténtalo de nuevo.');
        setPasswordInput('');
      } else {
        setError('El servidor no pudo verificar la contraseña. Inténtalo más tarde.');
      }
    } catch {
      setError('No se pudo conectar con el servidor. Revisa tu conexión.');
    } finally {
      setIsSubmitting(false);
    }
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // ── Loading ──
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-background flex justify-center items-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  // ── Pantalla de acceso ──
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
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
                  ref={inputRef}
                  type="password"
                  className="w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent text-center tracking-widest"
                  placeholder="Introduce la contraseña"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-xs text-error bg-error/10 border border-error/20 p-2.5 rounded-lg">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button type="submit" size="lg" className="w-full font-semibold" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="animate-spin" />}
                Desbloquear Estudio
              </Button>
            </form>

            <p className="text-[10px] text-text-secondary">
              Se recordará este dispositivo de forma permanente para tu comodidad.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
