'use client';

import { useState, useEffect } from 'react';
import { Campaign, CampaignColor, Project } from '@/types';
import { Button } from '@/components/ui/Button';
import { Loader2, Plus, Target, Trash2, Folder, MoreVertical, Music, Disc3, X, Check, ChevronRight } from 'lucide-react';
import { customAlert, customConfirm } from '@/lib/dialog';
import { useContextMenu } from '@/lib/contexts/ContextMenuContext';
import { cn } from '@/lib/utils';

interface ArtistCampaignsTabProps {
  artistId: string;
  projects: Project[];
  onOpenMatrix?: (matrixId?: string) => void;
}

const COLOR_OPTIONS: { value: CampaignColor; label: string; bg: string; border: string; text: string; glow: string }[] = [
  { value: 'purple', label: 'Morado', bg: 'bg-purple-500/20', border: 'border-purple-500/50', text: 'text-purple-400', glow: 'shadow-purple-500/20' },
  { value: 'blue',   label: 'Azul',   bg: 'bg-blue-500/20',   border: 'border-blue-500/50',   text: 'text-blue-400',   glow: 'shadow-blue-500/20' },
  { value: 'green',  label: 'Verde',  bg: 'bg-emerald-500/20',border: 'border-emerald-500/50',text: 'text-emerald-400',glow: 'shadow-emerald-500/20' },
  { value: 'orange', label: 'Naranja',bg: 'bg-orange-500/20', border: 'border-orange-500/50', text: 'text-orange-400', glow: 'shadow-orange-500/20' },
  { value: 'pink',   label: 'Rosa',   bg: 'bg-pink-500/20',   border: 'border-pink-500/50',   text: 'text-pink-400',   glow: 'shadow-pink-500/20' },
  { value: 'red',    label: 'Rojo',   bg: 'bg-red-500/20',    border: 'border-red-500/50',    text: 'text-red-400',    glow: 'shadow-red-500/20' },
  { value: 'cyan',   label: 'Cian',   bg: 'bg-cyan-500/20',   border: 'border-cyan-500/50',   text: 'text-cyan-400',   glow: 'shadow-cyan-500/20' },
  { value: 'yellow', label: 'Amarillo',bg:'bg-yellow-500/20', border: 'border-yellow-500/50', text: 'text-yellow-400', glow: 'shadow-yellow-500/20' },
];

const EMOJI_OPTIONS = ['🎯','💿','🔥','⚡','🎸','🎹','🎤','🎵','🎶','🚀','💎','🌟','🎭','🎬','📀'];

function getColorConfig(color?: CampaignColor) {
  return COLOR_OPTIONS.find(c => c.value === color) || COLOR_OPTIONS[0];
}

export function ArtistCampaignsTab({ artistId, projects, onOpenMatrix }: ArtistCampaignsTabProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    type: 'singles' as 'album' | 'singles',
    driveFolderIds: [] as string[],
    description: '',
    color: 'purple' as CampaignColor,
    emoji: '🎯',
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
        driveFolderIds: [...campaign.driveFolderIds],
        description: campaign.description || '',
        color: campaign.color || 'purple',
        emoji: campaign.emoji || '🎯',
      });
    } else {
      setEditingCampaign(null);
      setFormData({ name: '', type: 'singles', driveFolderIds: [], description: '', color: 'purple', emoji: '🎯' });
    }
    setIsModalOpen(true);
  };

  const handleSaveModal = async () => {
    if (!formData.name.trim()) { customAlert('El nombre de la campaña es obligatorio'); return; }
    let newCampaigns = [...campaigns];
    if (editingCampaign) {
      newCampaigns = newCampaigns.map(c => c.id === editingCampaign.id ? { ...c, ...formData } : c);
    } else {
      newCampaigns.push({ id: crypto.randomUUID(), ...formData, createdAt: new Date().toISOString() });
    }
    await saveCampaigns(newCampaigns);
    setIsModalOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (!await customConfirm('¿Eliminar esta campaña? (Esto NO borra las carpetas de Drive, solo la agrupación)')) return;
    await saveCampaigns(campaigns.filter(c => c.id !== id));
  };

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-text-primary">Campañas</h3>
          <p className="text-xs text-text-secondary mt-1 max-w-xl">
            Agrupa proyectos de Drive en una vista virtual para gestionarlos juntos en una Matriz, sin reorganizar nada en Drive.
          </p>
        </div>
        <Button onClick={() => handleOpenModal()}>
          <Plus className="w-4 h-4 mr-2" /> Nueva Campaña
        </Button>
      </div>

      {/* Empty State */}
      {campaigns.length === 0 ? (
        <div className="glass rounded-2xl p-16 text-center border border-dashed border-border flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center">
            <Target className="w-8 h-8 text-accent opacity-60" />
          </div>
          <div>
            <p className="font-semibold text-text-primary">No hay campañas creadas</p>
            <p className="text-sm text-text-secondary mt-1">Crea una campaña para agrupar singles o álbumes</p>
          </div>
          <Button onClick={() => handleOpenModal()}>Crear primera campaña</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {campaigns.map(campaign => {
            const col = getColorConfig(campaign.color);
            const linkedProjects = campaign.driveFolderIds
              .map(id => projects.find(p => p.id === id))
              .filter(Boolean) as Project[];
            const isExpanded = expandedId === campaign.id;

            return (
              <div
                key={campaign.id}
                className={cn(
                  "relative overflow-hidden rounded-2xl border transition-all duration-300 flex flex-col group",
                  "bg-surface-elevated hover:shadow-xl",
                  col.border,
                  isExpanded ? `shadow-lg ${col.glow}` : 'hover:border-opacity-80'
                )}
              >
                {/* Top color strip */}
                <div className={cn("h-1 w-full", col.bg.replace('/20', '').replace('bg-', 'bg-'))} 
                     style={{ background: `linear-gradient(90deg, var(--tw-gradient-stops))` }} />
                
                {/* Card Body */}
                <div className="p-5 flex-1">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 border", col.bg, col.border)}>
                        {campaign.emoji || '🎯'}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-base text-text-primary truncate">{campaign.name}</h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={cn("text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded", col.bg, col.text)}>
                            {campaign.type === 'album' ? '💿 Álbum' : '🎵 Singles'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      className="p-1.5 text-text-secondary hover:text-text-primary rounded-md opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        showMenu(e.clientX, e.clientY, [
                          { label: 'Editar Campaña', icon: 'Edit3', action: () => handleOpenModal(campaign) },
                          { label: 'Eliminar Campaña', icon: 'Trash2', action: () => handleDelete(campaign.id) },
                        ]);
                      }}
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>

                  {campaign.description && (
                    <p className="text-xs text-text-secondary mb-3 line-clamp-2">{campaign.description}</p>
                  )}

                  {/* Projects preview */}
                  <div className="pt-3 border-t border-border/50">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : campaign.id)}
                      className="flex items-center justify-between w-full text-xs text-text-secondary hover:text-text-primary transition-colors mb-2"
                    >
                      <span className="flex items-center gap-1.5">
                        <Folder className="w-3.5 h-3.5" />
                        <span className="font-medium">{linkedProjects.length} proyectos vinculados</span>
                      </span>
                      <ChevronRight className={cn("w-3.5 h-3.5 transition-transform", isExpanded && "rotate-90")} />
                    </button>

                    {/* Collapsed: chips */}
                    {!isExpanded && (
                      <div className="flex flex-wrap gap-1.5">
                        {linkedProjects.slice(0, 3).map(p => (
                          <span key={p.id} className={cn("text-[10px] px-2 py-0.5 rounded-md font-medium border", col.bg, col.border, col.text)} title={p.title}>
                            {p.title.length > 16 ? p.title.slice(0, 14) + '…' : p.title}
                          </span>
                        ))}
                        {linkedProjects.length > 3 && (
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-surface border border-border text-text-secondary">
                            +{linkedProjects.length - 3}
                          </span>
                        )}
                        {linkedProjects.length === 0 && (
                          <span className="text-[10px] text-text-secondary italic">Sin proyectos aún</span>
                        )}
                      </div>
                    )}

                    {/* Expanded: full list */}
                    {isExpanded && (
                      <div className="space-y-1.5 mt-1 animate-fade-in">
                        {linkedProjects.length === 0 ? (
                          <p className="text-xs text-text-secondary italic">Sin proyectos aún. Edita la campaña para añadirlos.</p>
                        ) : (
                          linkedProjects.map(p => (
                            <div key={p.id} className={cn("flex items-center gap-2 p-2 rounded-lg text-xs border", col.bg, col.border)}>
                              <Music className={cn("w-3.5 h-3.5 shrink-0", col.text)} />
                              <span className="font-medium text-text-primary truncate">{p.title}</span>
                            </div>
                          ))
                        )}
                        <button
                          onClick={() => handleOpenModal(campaign)}
                          className={cn("w-full text-xs py-1.5 rounded-lg border border-dashed transition-colors mt-1 font-medium", col.border, col.text, `hover:${col.bg}`)}
                        >
                          + Editar proyectos
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer actions */}
                <div className={cn("px-5 py-3 border-t flex items-center justify-between", col.border)}>
                  <span className="text-[10px] text-text-secondary font-mono">
                    {campaign.createdAt ? new Date(campaign.createdAt).toLocaleDateString('es-ES') : 'Sin fecha'}
                  </span>
                  <button
                    onClick={() => handleOpenModal(campaign)}
                    className={cn("text-xs font-semibold transition-colors flex items-center gap-1", col.text)}
                  >
                    Editar <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setIsModalOpen(false)}>
          <div className="bg-surface-elevated w-full max-w-xl rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden max-h-[90vh]" onClick={e => e.stopPropagation()}>
            
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-border">
              <div className="flex items-center gap-3">
                <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center text-lg border", getColorConfig(formData.color).bg, getColorConfig(formData.color).border)}>
                  {formData.emoji}
                </div>
                <h2 className="text-lg font-bold">{editingCampaign ? 'Editar Campaña' : 'Nueva Campaña'}</h2>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-1.5 text-text-secondary hover:text-text-primary rounded-lg hover:bg-surface transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto custom-scrollbar flex-1 space-y-5">
              
              {/* Name + Type row */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Nombre *</label>
                  <input
                    autoFocus
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
                    placeholder="Ej: Singles 2026"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Tipo</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors"
                  >
                    <option value="singles">🎵 Singles</option>
                    <option value="album">💿 Álbum</option>
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Descripción <span className="font-normal normal-case">(opcional)</span></label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent transition-colors resize-none"
                  placeholder="Notas sobre esta campaña..."
                />
              </div>

              {/* Color picker */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Color</label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_OPTIONS.map(c => (
                    <button
                      key={c.value}
                      onClick={() => setFormData({ ...formData, color: c.value })}
                      title={c.label}
                      className={cn(
                        "w-8 h-8 rounded-lg border-2 transition-all flex items-center justify-center",
                        c.bg, c.border,
                        formData.color === c.value ? 'ring-2 ring-offset-2 ring-offset-surface-elevated ring-accent scale-110' : 'opacity-60 hover:opacity-100'
                      )}
                    >
                      {formData.color === c.value && <Check className={cn("w-4 h-4", c.text)} />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Emoji picker */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Emoji</label>
                <div className="flex flex-wrap gap-2">
                  {EMOJI_OPTIONS.map(e => (
                    <button
                      key={e}
                      onClick={() => setFormData({ ...formData, emoji: e })}
                      className={cn(
                        "w-9 h-9 rounded-lg text-lg flex items-center justify-center border transition-all",
                        formData.emoji === e
                          ? 'bg-accent/20 border-accent ring-2 ring-accent/30 scale-110'
                          : 'bg-surface border-border hover:border-accent/50'
                      )}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>

              {/* Projects */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">Proyectos agrupados</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[220px] overflow-y-auto custom-scrollbar p-1">
                  {projects.map(project => {
                    const isSelected = formData.driveFolderIds.includes(project.id);
                    return (
                      <div
                        key={project.id}
                        onClick={() => setFormData({
                          ...formData,
                          driveFolderIds: isSelected
                            ? formData.driveFolderIds.filter(id => id !== project.id)
                            : [...formData.driveFolderIds, project.id]
                        })}
                        className={cn(
                          "flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all text-sm",
                          isSelected
                            ? `${getColorConfig(formData.color).bg} ${getColorConfig(formData.color).border}`
                            : 'border-border bg-surface hover:border-border/80'
                        )}
                      >
                        <div className={cn(
                          "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                          isSelected ? `bg-accent border-accent` : 'border-border'
                        )}>
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <Folder className={cn("w-4 h-4 shrink-0", isSelected ? getColorConfig(formData.color).text : 'text-text-secondary')} />
                        <span className="truncate flex-1 font-medium">{project.title}</span>
                      </div>
                    );
                  })}
                  {projects.length === 0 && (
                    <div className="col-span-full text-center text-xs text-text-secondary py-6 border border-dashed border-border rounded-xl">
                      No hay proyectos en este artista. Crea proyectos primero.
                    </div>
                  )}
                </div>
                {formData.driveFolderIds.length > 0 && (
                  <p className={cn("text-xs mt-2 font-medium", getColorConfig(formData.color).text)}>
                    ✓ {formData.driveFolderIds.length} proyecto{formData.driveFolderIds.length !== 1 ? 's' : ''} seleccionado{formData.driveFolderIds.length !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between gap-3 p-5 border-t border-border bg-surface/50">
              <span className="text-xs text-text-secondary">
                {formData.driveFolderIds.length} proyecto{formData.driveFolderIds.length !== 1 ? 's' : ''} vinculado{formData.driveFolderIds.length !== 1 ? 's' : ''}
              </span>
              <div className="flex gap-3">
                <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                <Button onClick={handleSaveModal} disabled={isSaving}>
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {editingCampaign ? 'Guardar Cambios' : 'Crear Campaña'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
