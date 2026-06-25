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
            
            <div className="mt-4 p-4 bg-surface-elevated rounded-xl text-sm text-text-secondary">
              Para cambiar la contraseña, debes acceder al código fuente:
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>Abre el archivo <code className="text-accent bg-accent/10 px-1 py-0.5 rounded">src/components/layout/PasswordGuard.tsx</code></li>
                <li>Modifica la constante <code className="text-accent bg-accent/10 px-1 py-0.5 rounded">AUTH_PASSWORD</code></li>
                <li>Guarda los cambios y realiza un despliegue (Deploy)</li>
              </ul>
            </div>
          </div>

          <div className="glass p-6 rounded-2xl border border-border flex flex-col justify-between">
            <div>
              <div className="flex items-start gap-4 mb-4">
                <div className="p-3 bg-error/10 rounded-xl border border-error/20">
                  <LogOut className="w-6 h-6 text-error" />
                </div>
                <div>
                  <h3 className="font-medium text-text-primary">Revocar Acceso</h3>
                  <p className="text-sm text-text-secondary mt-1">
                    Cierra la sesión en este navegador. Se te volverá a pedir la contraseña global del estudio la próxima vez que intentes entrar.
                  </p>
                </div>
              </div>
            </div>
            
            <button
              onClick={handleLogout}
              className="w-full py-3 mt-4 rounded-xl font-medium bg-surface hover:bg-error/10 text-error border border-error/20 hover:border-error/50 transition-colors flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Cerrar Sesión en este dispositivo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
