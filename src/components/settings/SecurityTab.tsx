'use client';

import { Shield, Lock, LogOut } from 'lucide-react';

export function SecurityTab() {
  const handleLogout = () => {
    // Auth is managed by local storage and cookie keys in PasswordGuard
    localStorage.removeItem('ezy_dashboard_secure_auth');
    document.cookie = 'ezy_dashboard_secure_auth=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    window.location.reload();
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h2 className="text-xl font-semibold text-text-primary mb-2 flex items-center gap-2">
          <Shield className="w-5 h-5 text-accent" />
          Seguridad y Acceso
        </h2>
        <p className="text-text-secondary text-sm mb-6">
          Gestiona el acceso a este panel de control y protege la información de tu estudio.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="glass p-6 rounded-2xl border border-border">
            <div className="flex items-start gap-4 mb-4">
              <div className="p-3 bg-surface rounded-xl border border-border">
                <Lock className="w-6 h-6 text-text-secondary" />
              </div>
              <div>
                <h3 className="font-medium text-text-primary">Contraseña Global</h3>
                <p className="text-sm text-text-secondary mt-1">
                  La contraseña del estudio está blindada directamente en el código fuente de la aplicación para ofrecer la máxima seguridad contra ataques.
                </p>
              </div>
            </div>
            
            <div className="mt-4 p-4 bg-surface-elevated rounded-xl text-sm text-text-secondary border border-border/50">
              <p className="mb-3">Para cambiar la contraseña, debes acceder al código fuente:</p>
              <ol className="list-decimal pl-5 space-y-3">
                <li>
                  Abre el archivo:
                  <div className="mt-1">
                    <code className="text-accent bg-accent/10 px-2 py-1 rounded block w-full overflow-x-auto whitespace-nowrap text-xs border border-accent/20">
                      src/components/layout/PasswordGuard.tsx
                    </code>
                  </div>
                </li>
                <li>
                  Modifica la constante:
                  <div className="mt-1">
                    <code className="text-accent bg-accent/10 px-2 py-1 rounded inline-block text-xs border border-accent/20">
                      AUTH_PASSWORD
                    </code>
                  </div>
                </li>
                <li>Guarda los cambios y realiza un despliegue (Deploy)</li>
              </ol>
            </div>
          </div>

          <div className="p-6 rounded-2xl border-2 border-error/20 bg-error/5 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-error/10 blur-3xl rounded-full -mr-10 -mt-10 pointer-events-none" />
            <div className="relative z-10">
              <div className="flex items-start gap-4 mb-4">
                <div className="p-3 bg-error/10 rounded-xl border border-error/30 shadow-sm">
                  <LogOut className="w-6 h-6 text-error" />
                </div>
                <div>
                  <h3 className="font-bold text-error">Revocar Acceso</h3>
                  <p className="text-sm text-error/80 mt-1">
                    Cierra la sesión en este navegador. Se te volverá a pedir la contraseña global del estudio la próxima vez que intentes entrar. Útil si estás en un ordenador público.
                  </p>
                </div>
              </div>
            </div>
            
            <button
              onClick={handleLogout}
              className="w-full py-3 mt-4 rounded-xl font-bold bg-error hover:bg-error/90 text-white shadow-lg shadow-error/20 transition-all flex items-center justify-center gap-2 relative z-10 hover:scale-[1.02]"
            >
              <LogOut className="w-4 h-4" />
              Cerrar Sesión Segura
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
