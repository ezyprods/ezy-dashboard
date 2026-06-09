'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Send, Loader2, Mail, MessageCircle } from 'lucide-react';

interface CommunicationsTabProps {
  projectId: string;
  projectTitle: string;
  artistId: string;
}

export function CommunicationsTab({ projectId, projectTitle, artistId }: CommunicationsTabProps) {
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailMessage, setEmailMessage] = useState('Hola, he subido nuevas versiones al portal. Échales un vistazo cuando puedas.');
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  // NOTA: Para un entorno real, habría que obtener el email y nombre real del artista
  // Aquí usamos datos de prueba simulados hasta que se integre la BBDD global
  const artistEmail = 'test@example.com'; 
  const artistName = 'Artista';

  const handleSendEmail = async () => {
    setIsSendingEmail(true);
    setStatus(null);
    try {
      const portalUrl = `${window.location.origin}/portal/${artistId}`;
      
      const res = await fetch('/api/communications/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artistEmail,
          artistName,
          projectName: projectTitle,
          message: emailMessage,
          portalUrl,
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Error al enviar');
      
      setStatus({ type: 'success', message: 'Email enviado correctamente' });
      setEmailMessage('');
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setIsSendingEmail(false);
    }
  };

  const generateWhatsAppLink = () => {
    const portalUrl = `${window.location.origin}/portal/${artistId}`;
    const text = `Hola! Hay novedades sobre el proyecto *${projectTitle}*.\nPuedes escucharlo todo en tu portal privado: ${portalUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="glass rounded-xl border border-border p-6">
        <h3 className="text-lg font-bold text-text-primary mb-4 flex items-center gap-2">
          <Mail className="w-5 h-5 text-accent" /> Enviar Email Automatizado
        </h3>
        
        <p className="text-sm text-text-secondary mb-4">
          Envía una notificación profesional al artista con un enlace directo a su portal privado. (Requiere configurar RESEND_API_KEY).
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Mensaje personalizado (opcional)</label>
            <textarea 
              className="w-full bg-surface border border-border rounded-lg p-3 text-sm focus:outline-none focus:border-accent resize-none h-24"
              value={emailMessage}
              onChange={(e) => setEmailMessage(e.target.value)}
              placeholder="Escribe un mensaje para adjuntar al email..."
            />
          </div>

          <Button onClick={handleSendEmail} disabled={isSendingEmail} className="w-full sm:w-auto">
            {isSendingEmail ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Enviar Email
          </Button>

          {status && (
            <div className={`p-3 rounded-lg text-sm mt-4 border ${status.type === 'success' ? 'bg-success/10 border-success/20 text-success' : 'bg-error/10 border-error/20 text-error'}`}>
              {status.message}
            </div>
          )}
        </div>
      </div>

      <div className="glass rounded-xl border border-border p-6">
        <h3 className="text-lg font-bold text-text-primary mb-4 flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-green-500" /> Compartir por WhatsApp
        </h3>
        
        <p className="text-sm text-text-secondary mb-4">
          Genera un enlace predefinido con el acceso al portal del cliente para enviárselo directamente por WhatsApp.
        </p>

        <Button onClick={generateWhatsAppLink} variant="outline" className="w-full sm:w-auto border-green-500/30 text-green-600 hover:bg-green-500/10">
          <MessageCircle className="w-4 h-4 mr-2" />
          Abrir en WhatsApp
        </Button>
      </div>
    </div>
  );
}
