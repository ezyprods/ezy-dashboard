'use client';

import { useState, useMemo } from 'react';
import { Mail, Smartphone, Send, CheckCircle2, User, Music, ArrowRight, Sparkles, Edit2, X as XIcon, ChevronDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useArtists } from '@/lib/hooks/useArtists';
import { useProjects } from '@/lib/hooks/useProjects';
import { ArtistAvatar } from '@/components/ui/ArtistAvatar';
import { customAlert } from '@/lib/dialog';
import { cn, formatPhoneNumber, getWhatsAppUrl } from '@/lib/utils';

export default function CommunicationsPage() {
  const { activeArtists, isLoading: isLoadingArtists, updateArtist } = useArtists();
  const [selectedArtistId, setSelectedArtistId] = useState<string>('');
  const { projects, isLoading: isLoadingProjects } = useProjects(selectedArtistId);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  
  const [editingContact, setEditingContact] = useState<'email' | 'phone' | null>(null);
  const [tempContactValue, setTempContactValue] = useState('');
  
  const [activeTab, setActiveTab] = useState<'email' | 'whatsapp'>('email');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const [isArtistDropdownOpen, setIsArtistDropdownOpen] = useState(false);
  const [artistSearch, setArtistSearch] = useState('');
  
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');

  const sortedArtists = useMemo(() => {
    return [...activeArtists].sort((a, b) => {
      // Intentamos usar el último acceso local o la fecha de modificación
      let timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      let timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      
      if (typeof window !== 'undefined') {
        const storedA = localStorage.getItem(`accessed_${a.id}`);
        const storedB = localStorage.getItem(`accessed_${b.id}`);
        if (storedA) timeA = Math.max(timeA, parseInt(storedA, 10));
        if (storedB) timeB = Math.max(timeB, parseInt(storedB, 10));
      }
      return timeB - timeA;
    });
  }, [activeArtists]);
  
  const selectedArtist = useMemo(() => activeArtists.find(a => a.id === selectedArtistId), [activeArtists, selectedArtistId]);
  const selectedProject = useMemo(() => projects.find(p => p.id === selectedProjectId), [projects, selectedProjectId]);

  const filteredArtists = useMemo(() => {
    if (!artistSearch) return sortedArtists;
    return sortedArtists.filter(a => a.name.toLowerCase().includes(artistSearch.toLowerCase()));
  }, [sortedArtists, artistSearch]);

  const filteredProjects = useMemo(() => {
    if (!projectSearch) return projects;
    return projects.filter(p => p.title.toLowerCase().includes(projectSearch.toLowerCase()));
  }, [projects, projectSearch]);

  const portalUrl = typeof window !== 'undefined' && selectedArtist ? `${window.location.origin}/portal/${selectedArtist.id}` : '';

  const defaultEmailMessage = "He subido una nueva versión a tu portal. Revísala cuando puedas y me cuentas qué te parece.";

  const defaultWaMessage = selectedArtist && selectedProject 
    ? `Hola ${selectedArtist.name},\n\nHay novedades sobre tu proyecto "${selectedProject.title}".\n\nPuedes escucharlo directamente en tu portal privado:\n${portalUrl}`
    : '';

  const handleSendEmail = async () => {
    if (!selectedArtist || !selectedProject) return;
    if (!selectedArtist.email) {
      customAlert('El artista no tiene un email configurado en su ficha.');
      return;
    }

    setIsSending(true);
    try {
      const res = await fetch('/api/communications/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artistEmail: selectedArtist.email,
          artistName: selectedArtist.name,
          projectName: selectedProject.title,
          message: message || defaultEmailMessage,
          portalUrl
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al enviar email');
      customAlert('¡Email enviado correctamente!');
      setMessage('');
    } catch (e: any) {
      customAlert(e.message);
    } finally {
      setIsSending(false);
    }
  };

  const handleSendWhatsApp = () => {
    if (!selectedArtist || !selectedProject) return;
    if (!selectedArtist.phone) {
      customAlert('El artista no tiene un teléfono configurado en su ficha.');
      return;
    }

    const text = message || defaultWaMessage;
    window.open(getWhatsAppUrl(selectedArtist.phone, text), '_blank');
  };

  const handleSaveContact = async (field: 'email' | 'phone') => {
    if (!selectedArtistId) return;
    try {
      const finalValue = field === 'phone' ? formatPhoneNumber(tempContactValue) : tempContactValue.trim();
      await updateArtist(selectedArtistId, { [field]: finalValue });
      setEditingContact(null);
      customAlert(`Contacto actualizado correctamente.`);
    } catch (e: any) {
      customAlert(`Error: ${e.message}`);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-20">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold text-text-primary tracking-tight">Centro de Comunicaciones</h1>
        </div>
        <div className="flex bg-accent/10 px-4 py-2 rounded-full border border-accent/20 items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" />
          <span className="text-accent text-sm font-medium">Automatizaciones Activas</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* COLUMNA IZQUIERDA: SELECTORES */}
        <div className="space-y-6">
          <div className="glass p-6 rounded-2xl border border-border/50">
            <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-accent" />
              1. Selecciona un Artista
            </h2>
            
            {isLoadingArtists ? (
              <div className="h-12 bg-surface-elevated animate-pulse rounded-xl" />
            ) : (
              <div className="relative">
                <button 
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between rounded-md border border-border/50 bg-surface px-3 py-2 text-sm focus:outline-none transition-all",
                    isArtistDropdownOpen ? "ring-1 ring-accent border-accent" : "hover:bg-surface-elevated"
                  )}
                  onClick={() => setIsArtistDropdownOpen(!isArtistDropdownOpen)}
                >
                  <span className="truncate font-medium text-text-primary">
                    {selectedArtist ? selectedArtist.name : 'Elige un artista...'}
                  </span>
                  <ChevronDown className={cn("h-4 w-4 text-text-secondary transition-transform duration-200", isArtistDropdownOpen && "rotate-180")} />
                </button>
                
                {isArtistDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsArtistDropdownOpen(false)} />
                    <div className="absolute top-full left-0 right-0 mt-1 bg-surface-elevated border border-border/50 rounded-md shadow-lg z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 flex flex-col">
                      <div className="flex items-center border-b border-border/50 px-3">
                        <Search className="mr-2 h-4 w-4 shrink-0 text-text-secondary" />
                        <input 
                          autoFocus
                          value={artistSearch}
                          onChange={e => setArtistSearch(e.target.value)}
                          placeholder="Buscar artista..."
                          className="flex h-10 w-full bg-transparent py-3 text-sm outline-none placeholder:text-text-secondary/50 text-text-primary"
                        />
                      </div>
                      <div className="max-h-60 overflow-y-auto p-1">
                        {filteredArtists.map(artist => (
                          <div 
                            key={artist.id}
                            className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-white text-text-primary"
                            onClick={() => {
                              setSelectedArtistId(artist.id);
                              setSelectedProjectId('');
                              setIsArtistDropdownOpen(false);
                              setArtistSearch('');
                            }}
                          >
                            <span className="truncate">{artist.name}</span>
                          </div>
                        ))}
                        {filteredArtists.length === 0 && (
                          <div className="py-6 text-center text-sm text-text-secondary">
                            No se encontraron artistas.
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {selectedArtist && (
              <div className="mt-4 flex items-center gap-3 p-3 bg-surface-elevated/50 rounded-xl border border-border/30">
                <ArtistAvatar artist={selectedArtist} size="sm" />
                <div className="flex flex-col gap-1 w-full">
                  <span className="text-sm font-medium text-text-primary">{selectedArtist.name}</span>
                  <div className="flex flex-wrap gap-2 text-xs text-text-secondary items-center">
                    
                    {/* EMAIL */}
                    {editingContact === 'email' ? (
                      <div className="flex items-center gap-1 bg-surface border border-border rounded px-1 w-40">
                        <input 
                          autoFocus
                          value={tempContactValue}
                          onChange={(e) => setTempContactValue(e.target.value)}
                          className="bg-transparent text-xs text-text-primary w-full focus:outline-none"
                          placeholder="Email..."
                          onKeyDown={(e) => { if (e.key === 'Enter') handleSaveContact('email'); if (e.key === 'Escape') setEditingContact(null); }}
                        />
                        <button onClick={() => handleSaveContact('email')} className="text-green-400 hover:text-green-300 p-0.5"><CheckCircle2 className="w-3 h-3" /></button>
                        <button onClick={() => setEditingContact(null)} className="text-red-400 hover:text-red-300 p-0.5"><XIcon className="w-3 h-3" /></button>
                      </div>
                    ) : (
                      <span 
                        className={cn("cursor-pointer hover:underline flex items-center gap-1 group", selectedArtist.email ? "text-green-400" : "text-red-400")}
                        onClick={() => { setTempContactValue(selectedArtist.email || ''); setEditingContact('email'); }}
                        title="Clic para editar"
                      >
                        {selectedArtist.email ? `✓ ${selectedArtist.email}` : '✗ Sin Email'}
                        <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </span>
                    )}

                    <span>•</span>

                    {/* PHONE */}
                    {editingContact === 'phone' ? (
                      <div className="flex items-center gap-1 bg-surface border border-border rounded px-1 w-32">
                        <input 
                          autoFocus
                          value={tempContactValue}
                          onChange={(e) => setTempContactValue(e.target.value)}
                          className="bg-transparent text-xs text-text-primary w-full focus:outline-none"
                          placeholder="Teléfono..."
                          onKeyDown={(e) => { if (e.key === 'Enter') handleSaveContact('phone'); if (e.key === 'Escape') setEditingContact(null); }}
                        />
                        <button onClick={() => handleSaveContact('phone')} className="text-green-400 hover:text-green-300 p-0.5"><CheckCircle2 className="w-3 h-3" /></button>
                        <button onClick={() => setEditingContact(null)} className="text-red-400 hover:text-red-300 p-0.5"><XIcon className="w-3 h-3" /></button>
                      </div>
                    ) : (
                      <span 
                        className={cn("cursor-pointer hover:underline flex items-center gap-1 group", selectedArtist.phone ? "text-green-400" : "text-red-400")}
                        onClick={() => { setTempContactValue(selectedArtist.phone || ''); setEditingContact('phone'); }}
                        title="Clic para editar"
                      >
                        {selectedArtist.phone ? `✓ ${selectedArtist.phone}` : '✗ Sin Teléfono'}
                        <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </span>
                    )}

                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="glass p-6 rounded-2xl border border-border/50 relative overflow-hidden">
            {!selectedArtistId && (
              <div className="absolute inset-0 bg-surface/80 backdrop-blur-[2px] z-10 flex items-center justify-center">
                <span className="text-sm font-medium text-text-secondary bg-surface-elevated px-4 py-2 rounded-full border border-border">Selecciona un artista primero</span>
              </div>
            )}
            
            <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
              <Music className="w-5 h-5 text-blue-500" />
              2. Selecciona un Proyecto
            </h2>
            
            {isLoadingProjects ? (
              <div className="h-12 bg-surface-elevated animate-pulse rounded-xl" />
            ) : projects.length === 0 && selectedArtistId ? (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
                Este artista no tiene proyectos activos.
              </div>
            ) : (
              <div className="relative">
                <button 
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between rounded-md border border-border/50 bg-surface px-3 py-2 text-sm focus:outline-none transition-all",
                    isProjectDropdownOpen ? "ring-1 ring-blue-500 border-blue-500" : "hover:bg-surface-elevated"
                  )}
                  onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}
                >
                  <span className="truncate font-medium text-text-primary">
                    {selectedProject ? selectedProject.title : 'Elige el proyecto...'}
                  </span>
                  <ChevronDown className={cn("h-4 w-4 text-text-secondary transition-transform duration-200", isProjectDropdownOpen && "rotate-180")} />
                </button>
                
                {isProjectDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsProjectDropdownOpen(false)} />
                    <div className="absolute top-full left-0 right-0 mt-1 bg-surface-elevated border border-border/50 rounded-md shadow-lg z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 flex flex-col">
                      <div className="flex items-center border-b border-border/50 px-3">
                        <Search className="mr-2 h-4 w-4 shrink-0 text-text-secondary" />
                        <input 
                          autoFocus
                          value={projectSearch}
                          onChange={e => setProjectSearch(e.target.value)}
                          placeholder="Buscar proyecto..."
                          className="flex h-10 w-full bg-transparent py-3 text-sm outline-none placeholder:text-text-secondary/50 text-text-primary"
                        />
                      </div>
                      <div className="max-h-60 overflow-y-auto p-1">
                        {filteredProjects.map(project => (
                          <div 
                            key={project.id}
                            className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-blue-500 hover:text-white text-text-primary"
                            onClick={() => {
                              setSelectedProjectId(project.id);
                              setIsProjectDropdownOpen(false);
                              setProjectSearch('');
                            }}
                          >
                            <span className="truncate">{project.title}</span>
                          </div>
                        ))}
                        {filteredProjects.length === 0 && (
                          <div className="py-6 text-center text-sm text-text-secondary">
                            No se encontraron proyectos.
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* COLUMNA DERECHA: CANALES */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass p-2 rounded-2xl flex gap-2 border border-border/50 relative">
            {!selectedProjectId && (
              <div className="absolute inset-0 bg-surface/80 backdrop-blur-[2px] z-10 rounded-2xl flex items-center justify-center">
                <span className="text-sm font-medium text-text-secondary bg-surface-elevated px-4 py-2 rounded-full border border-border shadow-sm">Completa los pasos 1 y 2</span>
              </div>
            )}
            <button
              onClick={() => setActiveTab('email')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-all duration-300",
                activeTab === 'email' 
                  ? "bg-accent text-white shadow-lg shadow-accent/20" 
                  : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
              )}
            >
              <Mail className="w-5 h-5" />
              Email Institucional
            </button>
            <button
              onClick={() => setActiveTab('whatsapp')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-all duration-300",
                activeTab === 'whatsapp' 
                  ? "bg-green-500 text-white shadow-lg shadow-green-500/20" 
                  : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
              )}
            >
              <Smartphone className="w-5 h-5" />
              Aviso WhatsApp
            </button>
          </div>

          <div className="glass p-6 md:p-8 rounded-2xl border border-border/50 relative">
             {!selectedProjectId && (
              <div className="absolute inset-0 bg-surface/80 backdrop-blur-[2px] z-10 flex items-center justify-center rounded-2xl" />
            )}

            {/* VISTA EMAIL */}
            {activeTab === 'email' && (
              <div className="space-y-6 animate-fade-in">
                <div className="bg-surface-elevated p-4 rounded-xl border border-border/50">
                  <div className="text-sm text-text-secondary mb-1">El artista recibirá un email profesional con este asunto:</div>
                  <div className="font-medium text-text-primary">Actualización: {selectedProject?.title || '[Proyecto]'}</div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-text-secondary">Mensaje Adicional (Opcional)</label>
                  <textarea 
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={defaultEmailMessage}
                    className="w-full h-32 bg-surface-elevated border border-border/50 rounded-xl p-4 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent transition-all resize-none"
                  />
                </div>

                <div className="bg-blue-500/5 p-4 rounded-xl border border-blue-500/20 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-blue-100/70">
                    El email incluirá un diseño elegante con el nombre del artista, tu mensaje y un <strong>botón directo a su Portal Privado</strong> para escuchar las versiones.
                  </p>
                </div>

                <div className="flex justify-end">
                  <Button 
                    onClick={handleSendEmail} 
                    disabled={isSending || !selectedArtist?.email}
                    className="w-full md:w-auto h-12 px-8 text-base shadow-[0_0_20px_rgba(108,92,231,0.3)] hover:shadow-[0_0_30px_rgba(108,92,231,0.5)]"
                  >
                    {isSending ? 'Enviando...' : 'Enviar Email Oficial'}
                    <Send className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            )}

            {/* VISTA WHATSAPP */}
            {activeTab === 'whatsapp' && (
              <div className="space-y-6 animate-fade-in">
                <div className="bg-surface-elevated p-4 rounded-xl border border-border/50 flex flex-col gap-2">
                  <div className="text-sm text-text-secondary">Previsualización del mensaje que se enviará a WhatsApp:</div>
                  <div className="text-text-primary whitespace-pre-wrap font-mono text-sm bg-surface p-3 rounded-lg border border-border/30">
                    {message || defaultWaMessage}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-text-secondary">Edita tu mensaje aquí</label>
                  <textarea 
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={defaultWaMessage}
                    className="w-full h-32 bg-surface-elevated border border-border/50 rounded-xl p-4 text-text-primary focus:outline-none focus:ring-2 focus:ring-green-500 transition-all resize-none"
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <Button 
                    onClick={handleSendWhatsApp} 
                    disabled={!selectedArtist?.phone}
                    className="w-full md:w-auto h-12 px-8 text-base bg-green-500 hover:bg-green-400 text-white shadow-[0_0_20px_rgba(34,197,94,0.3)] hover:shadow-[0_0_30px_rgba(34,197,94,0.5)]"
                  >
                    Abrir WhatsApp
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  );
}
