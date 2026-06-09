'use client';

import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/Button';
import { APP_NAME } from '@/lib/constants';

export default function LoginPage() {
  const handleLogin = async () => {
    await authClient.signIn.social({
      provider: "google",
      callbackURL: "/dashboard"
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/4 right-1/4 w-[300px] h-[300px] bg-accent-secondary/20 rounded-full blur-[80px] pointer-events-none" />

      <div className="glass w-full max-w-md rounded-2xl p-8 shadow-2xl relative z-10 border border-border/50 animate-slide-in">
        <div className="flex flex-col items-center text-center space-y-6">
          
          {/* Logo Placeholder */}
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-accent to-accent-secondary flex items-center justify-center shadow-lg shadow-accent/20 glow">
            <span className="text-white font-bold text-3xl">E</span>
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-bold gradient-text">{APP_NAME}</h1>
            <p className="text-text-secondary">
              Gestión profesional de producción musical. Inicia sesión para acceder a tu estudio.
            </p>
          </div>

          <div className="w-full pt-4 space-y-4">
            <Button 
              size="lg" 
              className="w-full text-base font-semibold"
              onClick={handleLogin}
            >
              <svg className="w-5 h-5 mr-2 bg-white rounded-full p-0.5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continuar con Google
            </Button>
            
            <p className="text-xs text-text-secondary">
              Al continuar, aceptas que EZY Dashboard acceda a tu cuenta de Google Drive para gestionar los archivos de tus proyectos.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
