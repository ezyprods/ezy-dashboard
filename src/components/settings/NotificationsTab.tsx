'use client';

import { useState, useEffect } from 'react';
import { Bell, Volume2, BellRing } from 'lucide-react';
import { customAlert } from '@/lib/dialog';

export function NotificationsTab() {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [browserAlerts, setBrowserAlerts] = useState(false);

  useEffect(() => {
    // Load from localStorage
    const savedSound = localStorage.getItem('ezy_sound_enabled');
    if (savedSound !== null) setSoundEnabled(savedSound === 'true');

    const savedAlerts = localStorage.getItem('ezy_browser_alerts');
    if (savedAlerts !== null) setBrowserAlerts(savedAlerts === 'true');
  }, []);

  const toggleSound = () => {
    const newVal = !soundEnabled;
    setSoundEnabled(newVal);
    localStorage.setItem('ezy_sound_enabled', newVal.toString());
  };

  const toggleAlerts = () => {
    if (!browserAlerts && 'Notification' in window) {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          setBrowserAlerts(true);
          localStorage.setItem('ezy_browser_alerts', 'true');
          new Notification('EZY Dashboard', { body: 'Las notificaciones están activadas.' });
        } else {
          customAlert('Debes dar permiso en el navegador para activar las alertas.');
        }
      });
    } else {
      setBrowserAlerts(false);
      localStorage.setItem('ezy_browser_alerts', 'false');
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h2 className="text-xl font-semibold text-text-primary mb-2 flex items-center gap-2">
          <Bell className="w-5 h-5 text-accent" />
          Alertas y Sonido
        </h2>
        <p className="text-text-secondary text-sm mb-6">
          Personaliza cómo la plataforma se comunica contigo para que no te pierdas nada importante.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Sounds */}
          <div className="glass p-6 rounded-2xl border border-border flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className={`p-2 rounded-lg ${soundEnabled ? 'bg-accent/10 text-accent' : 'bg-surface text-text-secondary'}`}>
                  <Volume2 className="w-5 h-5" />
                </div>
                <h3 className="font-medium text-text-primary">Efectos de Sonido</h3>
              </div>
              <p className="text-sm text-text-secondary">
                Reproducir sonidos sutiles al completar tareas en matrices o al recibir notificaciones en tiempo real.
              </p>
            </div>
            
            <button 
              onClick={toggleSound}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${soundEnabled ? 'bg-accent' : 'bg-surface-elevated border border-border'}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${soundEnabled ? 'translate-x-2.5' : '-translate-x-2.5'}`} />
            </button>
          </div>

          {/* Browser Alerts */}
          <div className="glass p-6 rounded-2xl border border-border flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className={`p-2 rounded-lg ${browserAlerts ? 'bg-success/10 text-success' : 'bg-surface text-text-secondary'}`}>
                  <BellRing className="w-5 h-5" />
                </div>
                <h3 className="font-medium text-text-primary">Notificaciones de Escritorio</h3>
              </div>
              <p className="text-sm text-text-secondary">
                Recibe alertas directamente en tu navegador (incluso si la pestaña está en segundo plano) para pagos y nuevos clientes.
              </p>
            </div>
            
            <button 
              onClick={toggleAlerts}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${browserAlerts ? 'bg-success' : 'bg-surface-elevated border border-border'}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${browserAlerts ? 'translate-x-2.5' : '-translate-x-2.5'}`} />
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
