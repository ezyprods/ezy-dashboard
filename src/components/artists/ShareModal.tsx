'use client';

import { useState, useEffect } from 'react';
import { Loader2, Users, Link as LinkIcon, Shield, Globe, User, X, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { customAlert } from '@/lib/dialog';
import { DrivePermission } from '@/types/file';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileId: string;
  fileName: string;
  webContentLink?: string;
  webViewLink?: string;
}

export function ShareModal({ isOpen, onClose, fileId, fileName, webViewLink, webContentLink }: ShareModalProps) {
  const [permissions, setPermissions] = useState<DrivePermission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('reader'); // reader, commenter, writer

  useEffect(() => {
    if (isOpen && fileId) {
      fetchPermissions();
    }
  }, [isOpen, fileId]);

  const fetchPermissions = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/files/${fileId}/share`);
      const data = await res.json();
      if (res.ok) {
        setPermissions(data.permissions || []);
      } else {
        throw new Error(data.error);
      }
    } catch (e: any) {
      customAlert('Error al cargar permisos: ' + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddPermission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;

    setIsUpdating(true);
    try {
      const res = await fetch(`/api/files/${fileId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole, type: 'user', emailAddress: newEmail.trim() })
      });
      if (!res.ok) throw new Error('Error al añadir acceso');
      
      setNewEmail('');
      await fetchPermissions();
    } catch (e: any) {
      customAlert(e.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemovePermission = async (permissionId: string) => {
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/files/${fileId}/share?permissionId=${permissionId}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Error al revocar acceso');
      
      await fetchPermissions();
    } catch (e: any) {
      customAlert(e.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSetAnyone = async (role: string) => {
    setIsUpdating(true);
    try {
      // Si el rol es none, buscamos si hay permiso de "anyone" y lo borramos
      if (role === 'none') {
        const anyonePerm = permissions.find(p => p.type === 'anyone');
        if (anyonePerm) {
          await fetch(`/api/files/${fileId}/share?permissionId=${anyonePerm.id}`, { method: 'DELETE' });
        }
      } else {
        // Sino, creamos/actualizamos el permiso de anyone
        await fetch(`/api/files/${fileId}/share`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role, type: 'anyone' })
        });
      }
      await fetchPermissions();
    } catch (e: any) {
      customAlert(e.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCopyLink = () => {
    if (webViewLink) {
      navigator.clipboard.writeText(webViewLink);
      customAlert('Enlace copiado al portapapeles');
    }
  };

  if (!isOpen) return null;

  const anyonePermission = permissions.find(p => p.type === 'anyone');
  const userPermissions = permissions.filter(p => p.type === 'user');

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-surface-elevated w-full max-w-lg rounded-2xl border border-border shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
              <Users className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Compartir</h2>
              <p className="text-xs text-text-secondary truncate max-w-[200px]">{fileName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface rounded-full transition-colors">
            <X className="w-5 h-5 text-text-secondary" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 overflow-y-auto space-y-6">
          {/* Add User */}
          <form onSubmit={handleAddPermission} className="flex gap-2">
            <input 
              type="email" 
              placeholder="Añadir personas y grupos (Email)" 
              className="flex-1 bg-surface border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-accent"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              disabled={isUpdating}
            />
            <select 
              className="bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none"
              value={newRole}
              onChange={e => setNewRole(e.target.value)}
              disabled={isUpdating}
            >
              <option value="reader">Lector</option>
              <option value="commenter">Comentador</option>
              <option value="writer">Editor</option>
            </select>
            <Button type="submit" disabled={isUpdating || !newEmail.trim()}>
              {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Añadir'}
            </Button>
          </form>

          {/* User List */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Personas con acceso</h3>
            {isLoading ? (
              <div className="flex justify-center p-4"><Loader2 className="w-5 h-5 animate-spin text-accent" /></div>
            ) : userPermissions.length === 0 ? (
              <p className="text-xs text-text-secondary italic">Nadie añadido todavía.</p>
            ) : (
              <div className="space-y-2">
                {userPermissions.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-2 hover:bg-surface rounded-lg transition-colors group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center overflow-hidden">
                        {p.photoLink ? (
                          <img src={p.photoLink} alt={p.displayName} className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-4 h-4 text-text-secondary" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{p.displayName || 'Usuario'}</p>
                        <p className="text-xs text-text-secondary">{p.emailAddress}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-text-secondary capitalize">{p.role === 'writer' ? 'Editor' : p.role === 'commenter' ? 'Comentador' : 'Lector'}</span>
                      <button 
                        onClick={() => handleRemovePermission(p.id)}
                        disabled={isUpdating}
                        className="p-1.5 text-text-secondary hover:text-error hover:bg-error/10 rounded transition-colors opacity-0 group-hover:opacity-100"
                        title="Quitar acceso"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* General Access */}
          <div className="space-y-3 pt-4 border-t border-border">
            <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Acceso General</h3>
            <div className="flex items-center gap-3 p-3 bg-surface rounded-xl border border-border/50">
              <div className="w-10 h-10 rounded-full bg-surface-elevated flex items-center justify-center shrink-0">
                {anyonePermission ? <Globe className="w-5 h-5 text-success" /> : <Shield className="w-5 h-5 text-text-secondary" />}
              </div>
              <div className="flex-1">
                <select 
                  className="bg-transparent border-none text-sm font-semibold focus:outline-none p-0 cursor-pointer text-text-primary"
                  value={anyonePermission ? anyonePermission.role : 'none'}
                  onChange={e => handleSetAnyone(e.target.value)}
                  disabled={isUpdating}
                >
                  <option value="none">Restringido</option>
                  <option value="reader">Cualquier persona (Lector)</option>
                  <option value="commenter">Cualquier persona (Comentador)</option>
                  <option value="writer">Cualquier persona (Editor)</option>
                </select>
                <p className="text-xs text-text-secondary mt-0.5">
                  {anyonePermission 
                    ? 'Cualquier persona con el enlace puede acceder.' 
                    : 'Solo los usuarios añadidos pueden abrir este enlace.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-border flex items-center justify-between bg-surface-elevated/50 rounded-b-2xl">
          <Button variant="outline" onClick={handleCopyLink} className="gap-2" disabled={!webViewLink}>
            <LinkIcon className="w-4 h-4" />
            Copiar enlace
          </Button>
          <Button onClick={onClose} variant="default">Hecho</Button>
        </div>
      </div>
    </div>
  );
}
