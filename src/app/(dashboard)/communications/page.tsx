import { MessageSquare, Mail, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function CommunicationsPage() {
  return (
    <div className="flex flex-col items-center justify-center h-[80vh] animate-fade-in text-center px-4 relative overflow-hidden">
      {/* Dynamic Background */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent/5 rounded-full blur-[100px] pointer-events-none animate-pulse duration-1000" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-blue-500/5 rounded-full blur-[80px] pointer-events-none animate-pulse delay-700 duration-1000" />

      <div className="relative mb-10 group">
        <div className="absolute inset-0 bg-accent/20 blur-2xl rounded-full scale-[2] opacity-50 group-hover:opacity-100 group-hover:scale-[2.5] transition-all duration-700" />
        <div className="w-28 h-28 rounded-3xl bg-gradient-to-br from-surface-elevated to-surface border border-white/10 flex items-center justify-center relative z-10 shadow-[0_0_50px_rgba(108,92,231,0.2)] group-hover:scale-105 group-hover:rotate-3 transition-transform duration-500">
          <MessageSquare className="w-12 h-12 text-accent" />
        </div>

        {/* Floating elements */}
        <div className="absolute -top-6 -right-12 w-16 h-16 bg-blue-500/10 backdrop-blur-md border border-blue-500/20 rounded-2xl flex items-center justify-center animate-[bounce_4s_infinite] shadow-lg">
          <Mail className="w-6 h-6 text-blue-400" />
        </div>
        <div className="absolute -bottom-4 -left-10 w-14 h-14 bg-green-500/10 backdrop-blur-md border border-green-500/20 rounded-2xl flex items-center justify-center animate-[bounce_5s_infinite_0.5s] shadow-lg">
          <Smartphone className="w-6 h-6 text-green-400" />
        </div>
      </div>
      
      <div className="relative z-10 max-w-2xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 text-accent font-medium text-sm mb-6 border border-accent/20 shadow-sm">
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          En Desarrollo
        </div>
        
        <h1 className="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-text-primary via-text-primary to-text-secondary mb-6 tracking-tight">
          El Centro de Comunicaciones
        </h1>
        
        <p className="text-text-secondary text-lg md:text-xl leading-relaxed mb-12">
          Automatiza tu flujo de trabajo. Configura emails transaccionales para tus clientes y programa recordatorios automáticos por WhatsApp cuando un proyecto requiera su atención.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-lg mx-auto">
          <div className="glass p-5 rounded-2xl flex items-start gap-4 border border-border/50 text-left hover:border-blue-500/30 hover:bg-blue-500/5 transition-all">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h3 className="font-semibold text-text-primary">Emails Automáticos</h3>
              <p className="text-sm text-text-secondary mt-1">Notifica entregas y links de revisión sin salir de EZY.</p>
            </div>
          </div>
          
          <div className="glass p-5 rounded-2xl flex items-start gap-4 border border-border/50 text-left hover:border-green-500/30 hover:bg-green-500/5 transition-all">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <h3 className="font-semibold text-text-primary">Avisos WhatsApp</h3>
              <p className="text-sm text-text-secondary mt-1">Recordatorios directos al móvil de tus clientes.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
