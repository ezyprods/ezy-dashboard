import { MessageSquare, Mail, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function CommunicationsPage() {
  return (
    <div className="flex flex-col items-center justify-center h-[80vh] animate-fade-in text-center px-4">
      <div className="relative mb-8 group">
        <div className="absolute inset-0 bg-accent/20 blur-3xl rounded-full scale-150 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-surface-elevated to-surface border border-border flex items-center justify-center relative z-10 shadow-xl group-hover:scale-105 transition-transform duration-500">
          <MessageSquare className="w-12 h-12 text-accent" />
        </div>
      </div>
      
      <h1 className="text-3xl font-bold text-text-primary mb-3">Comunicaciones (Próximamente)</h1>
      <p className="text-text-secondary max-w-md mx-auto mb-8 text-lg">
        Aquí podrás enviar actualizaciones a tus clientes, configurar emails automáticos y programar recordatorios de WhatsApp.
      </p>

      <div className="flex flex-wrap justify-center gap-4">
        <div className="glass px-6 py-4 rounded-2xl flex items-center gap-3 border border-border">
          <Mail className="w-5 h-5 text-blue-400" />
          <span className="font-medium text-text-secondary">Emails Automáticos</span>
        </div>
        <div className="glass px-6 py-4 rounded-2xl flex items-center gap-3 border border-border">
          <Smartphone className="w-5 h-5 text-green-400" />
          <span className="font-medium text-text-secondary">Avisos WhatsApp</span>
        </div>
      </div>
    </div>
  );
}
