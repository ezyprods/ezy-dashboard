'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { ArrowLeft, Save, Plus, GripVertical, Image as ImageIcon, Loader2, Music, Trash2, Play } from 'lucide-react';
import type { Release, ReleaseTrack } from '@/types';
import { useContextMenu } from '@/lib/contexts/ContextMenuContext';
// A modal to pick files from the artist's drive
import { TrackPickerModal } from '@/components/releases/TrackPickerModal';

export default function ReleaseEditorPage() {
  const params = useParams();
  const router = useRouter();
  const artistId = params.id as string;
  const releaseId = params.releaseId as string;

  const [release, setRelease] = useState<Release | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  useEffect(() => {
    fetchRelease();
  }, [releaseId]);

  const fetchRelease = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/releases/${releaseId}`);
      if (!res.ok) throw new Error('Error loading release');
      const data = await res.json();
      setRelease(data.release);
    } catch (err) {
      console.error(err);
      alert('Error al cargar el lanzamiento');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!release) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/releases/${releaseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(release)
      });
      if (!res.ok) throw new Error('Error saving');
      alert('Lanzamiento guardado');
    } catch (err) {
      console.error(err);
      alert('Error al guardar');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddTrack = async (fileId: string, fileName: string) => {
    // This calls the backend to COPY the file and returns the new ReleaseTrack
    setIsSaving(true);
    try {
      const res = await fetch(`/api/releases/${releaseId}/tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalFileId: fileId, title: fileName.replace(/\.[^/.]+$/, '') })
      });
      if (!res.ok) throw new Error('Error copying track');
      const data = await res.json();
      setRelease(prev => prev ? { ...prev, tracks: [...prev.tracks, data.track] } : null);
    } catch (err) {
      console.error(err);
      alert('Error añadiendo la canción. Asegúrate de tener permisos.');
    } finally {
      setIsSaving(false);
      setIsPickerOpen(false);
    }
  };

  const updateTrackTitle = (trackId: string, newTitle: string) => {
    setRelease(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        tracks: prev.tracks.map(t => t.id === trackId ? { ...t, title: newTitle } : t)
      };
    });
  };

  const removeTrack = (trackId: string) => {
    setRelease(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        tracks: prev.tracks.filter(t => t.id !== trackId)
      };
    });
  };

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>;
  if (!release) return <div className="text-center py-20">Lanzamiento no encontrado</div>;

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      {isPickerOpen && (
        <TrackPickerModal 
          artistId={artistId} 
          onClose={() => setIsPickerOpen(false)} 
          onSelect={handleAddTrack} 
        />
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push(`/artists/${artistId}`)} className="text-text-secondary hover:text-text-primary">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-2xl font-bold text-text-primary">Editar Lanzamiento</h1>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => window.open(`/previews/${releaseId}`, '_blank')}>
            <Play className="w-4 h-4 mr-2" /> Preview
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Guardar Cambios
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
        {/* Left Column: Metadata & Cover */}
        <div className="space-y-6">
          <div className="glass rounded-xl p-6 border border-border">
            <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-4">Información</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Título del Lanzamiento</label>
                <input 
                  type="text" 
                  value={release.title}
                  onChange={e => setRelease({ ...release, title: e.target.value })}
                  className="w-full bg-surface border border-border rounded-lg px-4 py-2 focus:outline-none focus:border-accent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Portada (Cover Art)</label>
                <div className="aspect-square bg-surface border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-accent/50 transition-colors relative overflow-hidden">
                  {release.coverArtId ? (
                    <img src={`/api/audio/${release.coverArtId}`} alt="Cover" className="w-full h-full object-cover" />
                  ) : (
                    <>
                      <ImageIcon className="w-8 h-8 text-text-secondary mb-2" />
                      <span className="text-sm text-text-secondary">Subir Portada</span>
                    </>
                  )}
                  <input 
                    type="file" 
                    accept="image/*"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    title="Cambiar portada"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      
                      const formData = new FormData();
                      formData.append('file', file);
                      formData.append('parentId', artistId); // Sube a la carpeta raíz del artista
                      
                      try {
                        setIsSaving(true);
                        const res = await fetch('/api/files/upload', {
                          method: 'POST',
                          body: formData
                        });
                        if (!res.ok) throw new Error('Error subiendo imagen');
                        const data = await res.json();
                        setRelease(prev => prev ? { ...prev, coverArtId: data.fileId } : null);
                      } catch (err) {
                        alert('Error al subir la portada');
                      } finally {
                        setIsSaving(false);
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Tracklist */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass rounded-xl p-6 border border-border">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Tracklist</h3>
              <Button size="sm" onClick={() => setIsPickerOpen(true)}>
                <Plus className="w-4 h-4 mr-2" /> Añadir Canción
              </Button>
            </div>

            {release.tracks.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-border rounded-xl">
                <Music className="w-8 h-8 text-text-secondary opacity-50 mx-auto mb-3" />
                <p className="text-text-secondary">Aún no hay canciones en este lanzamiento.</p>
                <Button variant="link" onClick={() => setIsPickerOpen(true)}>Añadir ahora</Button>
              </div>
            ) : (
              <div className="space-y-2">
                {release.tracks.map((track, index) => (
                  <div 
                    key={track.id} 
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', index.toString());
                      e.dataTransfer.effectAllowed = 'move';
                      e.currentTarget.classList.add('opacity-50');
                    }}
                    onDragEnd={(e) => {
                      e.currentTarget.classList.remove('opacity-50');
                      document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over', 'border-accent'));
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      e.currentTarget.classList.add('drag-over', 'border-accent');
                    }}
                    onDragLeave={(e) => {
                      e.currentTarget.classList.remove('drag-over', 'border-accent');
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove('drag-over', 'border-accent');
                      const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
                      const toIndex = index;
                      if (fromIndex === toIndex || isNaN(fromIndex)) return;
                      
                      setRelease(prev => {
                        if (!prev) return prev;
                        const newTracks = [...prev.tracks];
                        const [moved] = newTracks.splice(fromIndex, 1);
                        newTracks.splice(toIndex, 0, moved);
                        return { ...prev, tracks: newTracks };
                      });
                    }}
                    className="flex items-center gap-3 bg-surface-elevated border border-border rounded-lg p-2 group transition-all"
                  >
                    <div className="cursor-grab active:cursor-grabbing text-text-secondary hover:text-text-primary px-1">
                      <GripVertical className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-medium w-6 text-center text-text-secondary">{index + 1}</span>
                    <input 
                      type="text" 
                      value={track.title}
                      onChange={e => updateTrackTitle(track.id, e.target.value)}
                      className="flex-1 bg-transparent border-none focus:outline-none text-sm font-medium focus:ring-1 focus:ring-accent/50 rounded px-2 py-1"
                    />
                    <Button variant="ghost" size="icon" onClick={() => removeTrack(track.id)} className="opacity-0 group-hover:opacity-100 text-error hover:bg-error/10 transition-opacity">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-text-secondary mt-4">
              Nota: Arrastra las canciones para cambiar el orden. El nombre se cambia de forma virtual, sin alterar el archivo de Drive.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
