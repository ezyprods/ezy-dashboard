'use client';

import { useState, useEffect } from 'react';
import { Campaign, Project } from '@/types';
import { Button } from '@/components/ui/Button';
import { Loader2, Plus, Target, Edit3, Trash2, Folder, MoreVertical } from 'lucide-react';
import { customAlert, customConfirm } from '@/lib/dialog';
import { useContextMenu } from '@/lib/contexts/ContextMenuContext';
import { cn } from '@/lib/utils';

interface ArtistCampaignsTabProps {
  artistId: string;
  projects: Project[];
}

export function ArtistCampaignsTab({ artistId, projects }: ArtistCampaignsTabProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    type: 'singles' as 'album' | 'singles',
    driveFolderIds: [] as string[]
  });

  const { showMenu } = useContextMenu();

  useEffect(() => {
    fetchCampaigns();
  }, [artistId]);

  const fetchCampaigns = async () => {
    try {
      const res = await fetch(`/api/artists/${artistId}/campaigns`);
      if (!res.ok) throw new Error('Error al cargar campañas');
      const data = await res.json();
      setCampaigns(data.campaigns || []);
    } catch (err: any) {
      customAlert(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const saveCampaigns = async (newCampaigns: Campaign[]) => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/artists/${artistId}/campaigns`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaigns: newCampaigns })
      });
      if (!res.ok) throw new Error('Error al guardar campañas');
      setCampaigns(newCampaigns);
    } catch (err: any) {
      customAlert(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenModal = (campaign?: Campaign) => {
    if (campaign) {
      setEditingCampaign(campaign);
      setFormData({
        name: campaign.name,
        type: campaign.type,
        driveFolderIds: [...campaign.driveFolderIds]
      });
    } else {
      setEditingCampaign(null);
      setFormData({
        name: '',
        type: 'singles',
        driveFolderIds: []
      });
    }
    setIsModalOpen(true);
  };

  const handleSaveModal = async () => {
    if (!formData.name.trim()) {
      customAlert('El nombre de la campaña es obligatorio');
      return;
    }
    
    let newCampaigns = [...campaigns];
    
    if (editingCampaign) {
      newCampaigns = newCampaigns.map(c => 
        c.id === editingCampaign.id 
          ? { ...c, ...formData }
          : c
      );
    } else {
      newCampaigns.push({
        id: crypto.randomUUID(),
        ...formData
      });
    }
    
    await saveCampaigns(newCampaigns);
    setIsModalOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (!await customConfirm('¿Eliminar esta campaña? (Esto NO borra las carpetas de Drive, solo la agrupación)')) return;
    const newCampaigns = campaigns.filter(c => c.id !== id);
    await saveCampaigns(newCampaigns);
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>;
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold">Campañas</h3>
          <p className="text-xs text-text-secondary mt-1 max-w-xl">
            Las campañas te permiten agrupar varios proyectos (por ejemplo, 4 singles separados) en una única vista virtual para gestionarlos juntos en una Matriz, sin tener que mover las carpetas reales en Google Drive.
          </p>
        </div>
        <Button onClick={() => handleOpenModal()}>
          <Plus className="w-4 h-4 mr-2" /> Nueva Campaña
        </Button>
      </div>

      {campaigns.length === 0 ? (
        <div className="glass rounded-xl p-12 text-center text-text-secondary border border-dashed border-border">
          <Target className="w-12 h-12 mb-4 mx-auto opacity-50 text-accent" />
          <p>No hay campañas creadas para este artista.</p>
          <Button variant="link" onClick={() => handleOpenModal()}>Crear la primera campaña</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map(campaign => (
            <div 
              key={campaign.id}
              className="bg-surface-elevated rounded-xl border border-border p-4 hover:border-accent/50 transition-colors flex flex-col relative group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded bg-accent/10 flex items-center justify-center shrink-0">
                    <Target className="w-4 h-4 text-accent" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-sm truncate">{campaign.name}</h4>
                    <span className="text-[10px] text-text-secondary uppercase tracking-wider">{campaign.type}</span>
                  </div>
                </div>
                <button 
                  className="p-1.5 text-text-secondary hover:text-text-primary rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    showMenu(e.clientX, e.clientY, [
                      { label: 'Editar Campaña', icon: 'Edit3', action: () => handleOpenModal(campaign) },
                      { label: 'Eliminar Campaña', icon: 'Trash2', action: () => handleDelete(campaign.id) }
                    ]);
                  }}
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-auto pt-3 border-t border-border/50">
                <p className="text-xs text-text-secondary mb-2 flex items-center gap-1.5">
                  <Folder className="w-3.5 h-3.5" /> 
                  {campaign.driveFolderIds.length} Proyectos Vinculados
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {campaign.driveFolderIds.slice(0, 3).map(id => {
                    const p = projects.find(p => p.id === id);
                    return (
                      <span key={id} className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border/40 truncate max-w-[120px]" title={p?.title || id}>
                        {p?.title || 'Desconocido'}
                      </span>
                    );
                  })}
                  {campaign.driveFolderIds.length > 3 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border/40 text-text-secondary">
                      +{campaign.driveFolderIds.length - 3}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-surface-elevated w-full max-w-xl rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-lg font-bold">{editingCampaign ? 'Editar Campaña' : 'Nueva Campaña'}</h2>
            </div>
            
            <div className="p-5 overflow-y-auto custom-scrollbar flex-1 space-y-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Nombre de la campaña</label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
                  placeholder="Ej: Singles 2026"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Tipo</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({...formData, type: e.target.value as any})}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
                >
                  <option value="singles">Singles</option>
                  <option value="album">Álbum</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-2">Proyectos agrupados</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[250px] overflow-y-auto custom-scrollbar p-1">
                  {projects.map(project => {
                    const isSelected = formData.driveFolderIds.includes(project.id);
                    return (
                      <div 
                        key={project.id}
                        onClick={() => {
                          if (isSelected) {
                            setFormData({...formData, driveFolderIds: formData.driveFolderIds.filter(id => id !== project.id)});
                          } else {
                            setFormData({...formData, driveFolderIds: [...formData.driveFolderIds, project.id]});
                          }
                        }}
                        className={cn(
                          "flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors text-sm",
                          isSelected ? "border-accent bg-accent/10" : "border-border bg-surface hover:border-accent/50"
                        )}
                      >
                        <input 
                          type="checkbox" 
                          checked={isSelected} 
                          readOnly 
                          className="accent-accent"
                        />
                        <Folder className={cn("w-4 h-4", isSelected ? "text-accent" : "text-text-secondary")} />
                        <span className="truncate flex-1">{project.title}</span>
                      </div>
                    );
                  })}
                  {projects.length === 0 && (
                    <div className="col-span-full text-center text-xs text-text-secondary py-4">
                      No hay proyectos en este artista. Crea proyectos primero.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-5 border-t border-border bg-surface/50">
              <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleSaveModal} disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {editingCampaign ? 'Guardar Cambios' : 'Crear Campaña'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
