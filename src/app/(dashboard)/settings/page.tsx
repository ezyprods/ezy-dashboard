'use client';

import { useState, useEffect } from 'react';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { 
  Settings, Palette, Shield, Moon, Sun, Monitor, 
  HardDrive, RefreshCw, AlertTriangle, MonitorSmartphone
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { customAlert, customConfirm } from '@/lib/dialog';

export default function SettingsPage() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  
  const [driveConnected, setDriveConnected] = useState<boolean | null>(null);
  const [isCheckingDrive, setIsCheckingDrive] = useState(true);
  const [studioName, setStudioName] = useState('EZY Dashboard');
  const [isSavingName, setIsSavingName] = useState(false);

  useEffect(() => {
    // Cargar ajustes locales
    const savedName = localStorage.getItem('ezy_studio_name');
    if (savedName) setStudioName(savedName);
    
    // Verificar estado de Google Drive
    checkDriveStatus();
  }, []);

  const checkDriveStatus = async () => {
    setIsCheckingDrive(true);
    try {
      const res = await fetch('/api/auth/status');
      if (res.ok) {
        setDriveConnected(true);
      } else {
        setDriveConnected(false);
      }
    } catch (e) {
      setDriveConnected(false);
    } finally {
      setIsCheckingDrive(false);
    }
  };

  const handleSaveStudioName = async () => {
    setIsSavingName(true);
    localStorage.setItem('ezy_studio_name', studioName);
    // Notificar al resto de la app
    window.dispatchEvent(new Event('ezy_studio_name_change'));
    await new Promise(r => setTimeout(r, 500));
    setIsSavingName(false);
    customAlert("Nombre del estudio actualizado con éxito.");
  };

  const handleClearCache = async () => {
    if (await customConfirm('¿Estás seguro de que quieres limpiar la caché local? Esto cerrará tu sesión temporal y borrará preferencias locales, pero no afectará a los archivos de Google Drive.')) {
      localStorage.clear();
      window.location.reload();
    }
  };

  const handleDriveReconnect = () => {
    window.location.href = '/api/auth/google-token?type=both';
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 animate-fade-in pb-20">
      
      {/* Cabecera */}
      <div className="flex items-center gap-4 mb-10">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-surface-elevated to-surface border border-border flex items-center justify-center shadow-lg relative overflow-hidden group">
          <div className="absolute inset-0 bg-accent/20 opacity-0 group-hover:opacity-100 transition-opacity" />
          <Settings className="w-7 h-7 text-accent" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-text-primary tracking-tight">Configuración</h1>
          <p className="text-text-secondary">Personaliza tu espacio de trabajo y gestiona integraciones.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Columna Izquierda */}
        <div className="space-y-8">
          
          {/* Tarjeta de Apariencia */}
          <div className="glass rounded-2xl p-6 border border-border">
            <div className="flex items-center gap-3 mb-6">
              <Palette className="w-5 h-5 text-accent-light" />
              <h2 className="text-xl font-semibold">Apariencia</h2>
            </div>
            
            <div className="grid grid-cols-3 gap-3">
              <button 
                onClick={() => setTheme('light')}
                className={`p-4 rounded-xl border flex flex-col items-center gap-3 transition-all duration-300 ${
                  theme === 'light' 
                  ? 'border-accent bg-accent/10 shadow-[0_0_15px_rgba(108,92,231,0.2)]' 
                  : 'border-border bg-surface hover:border-text-secondary/50'
                }`}
              >
                <Sun className={`w-6 h-6 ${theme === 'light' ? 'text-accent' : 'text-text-secondary'}`} />
                <span className={`text-sm font-medium ${theme === 'light' ? 'text-text-primary' : 'text-text-secondary'}`}>Claro</span>
              </button>
              
              <button 
                onClick={() => setTheme('dark')}
                className={`p-4 rounded-xl border flex flex-col items-center gap-3 transition-all duration-300 ${
                  theme === 'dark' 
                  ? 'border-accent bg-accent/10 shadow-[0_0_15px_rgba(108,92,231,0.2)]' 
                  : 'border-border bg-surface hover:border-text-secondary/50'
                }`}
              >
                <Moon className={`w-6 h-6 ${theme === 'dark' ? 'text-accent' : 'text-text-secondary'}`} />
                <span className={`text-sm font-medium ${theme === 'dark' ? 'text-text-primary' : 'text-text-secondary'}`}>Oscuro</span>
              </button>
              
              <button 
                onClick={() => setTheme('system')}
                className={`p-4 rounded-xl border flex flex-col items-center gap-3 transition-all duration-300 ${
                  theme === 'system' 
                  ? 'border-accent bg-accent/10 shadow-[0_0_15px_rgba(108,92,231,0.2)]' 
                  : 'border-border bg-surface hover:border-text-secondary/50'
                }`}
              >
                <MonitorSmartphone className={`w-6 h-6 ${theme === 'system' ? 'text-accent' : 'text-text-secondary'}`} />
                <span className={`text-sm font-medium ${theme === 'system' ? 'text-text-primary' : 'text-text-secondary'}`}>Sistema</span>
              </button>
            </div>
          </div>

          {/* Tarjeta de Preferencias del Estudio */}
          <div className="glass rounded-2xl p-6 border border-border">
            <div className="flex items-center gap-3 mb-6">
              <Monitor className="w-5 h-5 text-emerald-400" />
              <h2 className="text-xl font-semibold">Preferencias del Estudio</h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Nombre del Estudio / Dashboard
                </label>
                <div className="flex gap-3">
                  <input 
                    type="text" 
                    value={studioName}
                    onChange={(e) => setStudioName(e.target.value)}
                    placeholder="Ej. Mi Estudio"
                    className="flex-1 bg-surface border border-border rounded-lg px-4 py-2 text-text-primary focus:outline-none focus:border-accent transition-colors"
                  />
                  <Button onClick={handleSaveStudioName} disabled={isSavingName}>
                    {isSavingName ? 'Guardando...' : 'Guardar'}
                  </Button>
                </div>
                <p className="text-xs text-text-secondary mt-2">
                  Este nombre se mostrará en la barra lateral superior.
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* Columna Derecha */}
        <div className="space-y-8">
          
          {/* Tarjeta de Google Drive */}
          <div className="glass rounded-2xl p-6 border border-border">
            <div className="flex items-center gap-3 mb-6">
              <HardDrive className="w-5 h-5 text-blue-400" />
              <h2 className="text-xl font-semibold">Almacenamiento (Google Drive)</h2>
            </div>
            
            <div className="bg-surface rounded-xl p-5 border border-border mb-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-text-primary mb-1">Estado de Conexión</h3>
                  {isCheckingDrive ? (
                    <div className="flex items-center gap-2 text-text-secondary text-sm">
                      <RefreshCw className="w-4 h-4 animate-spin" /> Verificando...
                    </div>
                  ) : driveConnected ? (
                    <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Conectado y Sincronizando
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-error text-sm font-medium">
                      <AlertTriangle className="w-4 h-4" /> Desconectado / Expirado
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Button 
                onClick={handleDriveReconnect}
                variant="outline"
                className="w-full justify-start text-left bg-surface hover:bg-surface-elevated"
              >
                <RefreshCw className="w-4 h-4 mr-3 text-blue-400" /> 
                {driveConnected ? 'Actualizar Permisos de Drive' : 'Conectar con Google Drive'}
              </Button>
            </div>
          </div>

          {/* Tarjeta de Mantenimiento Avanzado */}
          <div className="glass rounded-2xl p-6 border border-border">
            <div className="flex items-center gap-3 mb-6">
              <Shield className="w-5 h-5 text-error" />
              <h2 className="text-xl font-semibold">Mantenimiento Avanzado</h2>
            </div>
            
            <p className="text-sm text-text-secondary mb-6">
              Opciones de restablecimiento en caso de que la aplicación presente problemas de renderizado o carga.
            </p>

            <Button 
              onClick={handleClearCache}
              variant="outline"
              className="w-full justify-start text-left border-error/30 hover:border-error/60 hover:bg-error/10 transition-colors text-error"
            >
              <AlertTriangle className="w-4 h-4 mr-3" /> Limpiar Caché y Reiniciar App
            </Button>
          </div>

        </div>
      </div>
    </div>
  );
}
