'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { Lock, Loader2, AlertCircle } from 'lucide-react';
import { APP_NAME } from '@/lib/constants';

const AUTH_KEY = 'ezy_dashboard_secure_auth';
const AUTH_PASSWORD = '20923954Aa*';
// 400 días = máximo que los navegadores permiten en cookies persistentes
const REMEMBER_DAYS = 400;
const REMEMBER_MS = REMEMBER_DAYS * 24 * 60 * 60 * 1000;
const DB_NAME = 'ezy_auth_db';
const DB_STORE = 'auth';

// ── Capa 1: IndexedDB (más persistente, ignora la limpieza automática del nav.) ──
function openDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbGet(key: string): Promise<string | null> {
  const db = await openDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbSet(key: string, value: string): Promise<void> {
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

// ── Capa 2: localStorage ──
function lsGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

// ── Capa 3: Cookie (SIN flag Secure para que funcione en HTTP/localhost también) ──
function cookieGet(name: string): string | null {
  if (typeof document === 'undefined') return null;
  try {
    const nameEQ = name + '=';
    for (const part of document.cookie.split(';')) {
      const c = part.trim();
      if (c.startsWith(nameEQ)) return c.substring(nameEQ.length);
    }
  } catch { /* ignore */ }
  return null;
}
function cookieSet(name: string, value: string, days: number): void {
  if (typeof document === 'undefined') return;
  try {
    const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
    // SameSite=Lax sin Secure → funciona en HTTP (localhost) y HTTPS (Vercel)
    document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=Lax`;
  } catch { /* ignore */ }
}

// ── Persistir el timestamp en las 3 capas a la vez ──
async function persistAuth(): Promise<void> {
  const now = Date.now().toString();
  lsSet(AUTH_KEY, now);
  cookieSet(AUTH_KEY, now, REMEMBER_DAYS);
  await idbSet(AUTH_KEY, now);
}

// ── Leer de cualquiera de las 3 capas y devolver el timestamp ──
async function readAuth(): Promise<string | null> {
  // 1. IndexedDB (más fiable)
  const idbVal = await idbGet(AUTH_KEY);
  if (idbVal) return idbVal;
  // 2. localStorage
  const lsVal = lsGet(AUTH_KEY);
  if (lsVal) return lsVal;
  // 3. Cookie
  return cookieGet(AUTH_KEY);
}

export function PasswordGuard({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const stored = await readAuth();
      if (stored) {
        const ts = parseInt(stored, 10);
        const valid = !isNaN(ts) && (Date.now() - ts < REMEMBER_MS);
        if (valid) {
          // Renovar en todas las capas en cada visita → nunca caduca mientras se use
          await persistAuth();
          setIsAuthenticated(true);
          return;
        }
      }
      setIsAuthenticated(false);
    })();
  }, []);

  // Enfocar el input cuando aparece la pantalla de login
  useEffect(() => {
    if (isAuthenticated === false) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isAuthenticated]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput === AUTH_PASSWORD) {
      await persistAuth();
      setIsAuthenticated(true);
      setError('');
    } else {
      setError('Contraseña incorrecta. Por favor, inténtalo de nuevo.');
      setPasswordInput('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
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

              <Button type="submit" size="lg" className="w-full font-semibold">
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
