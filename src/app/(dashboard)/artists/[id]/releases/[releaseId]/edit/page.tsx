'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import {
  ArrowLeft, Save, Plus, GripVertical, Image as ImageIcon,
  Loader2, Music, Trash2, Play, ExternalLink, Copy, CheckCircle2,
  Shield, ShieldOff, Globe, Eye, Settings2
} from 'lucide-react';
import type { Release, ReleaseTrack } from '@/types';
import { TrackPickerModal } from '@/components/releases/TrackPickerModal';
import { customAlert, customConfirm } from '@/lib/dialog';

export default function ReleaseEditorPage() {
  const params = useParams();
  const router = useRouter();
  const artistId = params?.id as string;
  const releaseId = params?.releaseId as string;

  const [release, setRelease] = useState<Release | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

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
    } catch {
      customAlert('Error al cargar el lanzamiento');
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
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch {
      customAlert('Error al guardar');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTogglePublic = async () => {
    if (!release) return;
    const newVal = !release.isPublic;
    try {
      const res = await fetch(`/api/releases/${releaseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic: newVal })
      });
      if (!res.ok) throw new Error();
      setRelease(prev => prev ? { ...prev, isPublic: newVal } : null);
      customAlert(newVal
        ? '✓ Preview pública — visible en el portal del artista'
        : 'Preview marcada como privada'
      );
    } catch {
      customAlert('Error al cambiar privacidad');
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/previews/${releaseId}`);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const handleAddTrack = async (fileId: string, fileName: string) => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/releases/${releaseId}/tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalFileId: fileId, title: fileName.replace(/\.[^/.]+$/, '') })
      });
      if (!res.ok) throw new Error('Error copying track');
      const data = await res.json();
      setRelease(prev => prev ? { ...prev, tracks: [...prev.tracks, data] } : null);
    } catch {
      customAlert('Error añadiendo la canción. Asegúrate de tener permisos.');
    } finally {
      setIsSaving(false);
      setIsPickerOpen(false);
    }
  };

  const updateTrackTitle = (trackId: string, newTitle: string) => {
    setRelease(prev => {
      if (!prev) return prev;
      return { ...prev, tracks: prev.tracks.map(t => t.id === trackId ? { ...t, title: newTitle } : t) };
    });
  };

  const removeTrack = async (trackId: string) => {
    if (!await customConfirm('¿Eliminar esta canción del lanzamiento?')) return;
    setRelease(prev => {
      if (!prev) return prev;
      return { ...prev, tracks: prev.tracks.filter(t => t.id !== trackId) };
    });
  };

  const reorderTracks = (fromIndex: number, toIndex: number) => {
    setRelease(prev => {
      if (!prev) return prev;
      const newTracks = [...prev.tracks];
      const [moved] = newTracks.splice(fromIndex, 1);
      newTracks.splice(toIndex, 0, moved);
      return { ...prev, tracks: newTracks };
    });
  };

  if (isLoading) return (
    <div className="flex justify-center py-20">
      <Loader2 className="w-8 h-8 animate-spin text-accent" />
    </div>
  );

  if (!release) return (
    <div className="text-center py-20 text-text-secondary">Lanzamiento no encontrado</div>
  );

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      {isPickerOpen && (
        <TrackPickerModal
          artistId={artistId}
          onClose={() => setIsPickerOpen(false)}
          onSelect={handleAddTrack}
        />
      )}

      {/* Top bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push(`/artists/${artistId}/previews`)} className="text-text-secondary hover:text-text-primary">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Editar Preview</h1>
            <p className="text-xs text-text-secondary mt-0.5 flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${release.isPublic ? 'bg-success' : 'bg-text-secondary/50'}`} />
              {release.isPublic ? 'Pública · visible en el portal' : 'Privada'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Copy link */}
          <button
            onClick={handleCopyLink}
            className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border font-semibold transition-all ${
              linkCopied
                ? 'bg-success/10 text-success border-success/30'
                : 'bg-surface border-border text-text-secondary hover:text-text-primary hover:border-border/80'
            }`}
          >
            {linkCopied ? <><CheckCircle2 className="w-3.5 h-3.5" /> Copiado</> : <><Copy className="w-3.5 h-3.5" /> Copiar enlace</>}
          </button>

          {/* Preview button */}
          <button
            onClick={() => window.open(`/previews/${releaseId}`, '_blank')}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors font-semibold"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Ver Preview
          </button>

          {/* Public toggle */}
          <button
            onClick={handleTogglePublic}
            className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border font-semibold transition-all ${
              release.isPublic
                ? 'bg-success/10 text-success border-success/25 hover:bg-success/20'
                : 'bg-surface border-border text-text-secondary hover:text-text-primary'
            }`}
          >
            {release.isPublic ? <><Shield className="w-3.5 h-3.5" /> Pública</> : <><ShieldOff className="w-3.5 h-3.5" /> Privada</>}
          </button>

          {/* Save */}
          <Button onClick={handleSave} disabled={isSaving} className={saveSuccess ? '!bg-success hover:!bg-success' : ''}>
            {isSaving
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : saveSuccess
              ? <CheckCircle2 className="w-4 h-4 mr-2" />
              : <Save className="w-4 h-4 mr-2" />
            }
            {saveSuccess ? 'Guardado' : 'Guardar'}
          </Button>
        </div>
      </div>

      {/* Public integration notice */}
      {release.isPublic && (
        <div className="glass rounded-xl border border-success/20 bg-success/5 p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-success/15 flex items-center justify-center shrink-0">
            <Globe className="w-4 h-4 text-success" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-text-primary">Esta preview está pública</p>
            <p className="text-xs text-text-secondary mt-0.5">
              Aparece en el módulo "Previews / Lanzamientos" del portal del artista. El artista puede escucharla desde su portal.
            </p>
          </div>
          <a
            href={`/previews/${releaseId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-success font-semibold flex items-center gap-1 hover:underline shrink-0"
          >
            Ver <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: metadata & cover */}
        <div className="space-y-5">
          {/* Basic info */}
          <div className="glass rounded-xl p-5 border border-border space-y-4">
            <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider">Información</h3>
            <div>
              <label className="block text-sm font-medium mb-1.5">Título del Lanzamiento</label>
              <input
                type="text"
                value={release.title}
                onChange={e => setRelease({ ...release, title: e.target.value })}
                className="w-full bg-surface border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-accent transition-colors"
              />
            </div>
          </div>

          {/* Cover art */}
          <div className="glass rounded-xl p-5 border border-border space-y-3">
            <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider">Portada (Cover Art)</h3>
            <div className="aspect-square bg-surface border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-accent/50 transition-colors relative overflow-hidden group">
              {release.coverArtId ? (
                <>
                  <img src={`/api/audio/${release.coverArtId}`} alt="Cover" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-xs text-white font-semibold">Cambiar portada</span>
                  </div>
                </>
              ) : (
                <>
                  <ImageIcon className="w-10 h-10 text-text-secondary mb-2 opacity-50" />
                  <span className="text-sm text-text-secondary font-medium">Subir Portada</span>
                  <span className="text-xs text-text-secondary/60 mt-1">JPG, PNG, WEBP</span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                className="absolute inset-0 opacity-0 cursor-pointer"
                title="Cambiar portada"
                onChange={async e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const formData = new FormData();
                  formData.append('file', file);
                  formData.append('parentId', artistId);
                  try {
                    setIsSaving(true);
                    const res = await fetch('/api/files/upload', { method: 'POST', body: formData });
                    if (!res.ok) throw new Error('Error subiendo imagen');
                    const data = await res.json();
                    setRelease(prev => prev ? { ...prev, coverArtId: data.fileId } : null);
                  } catch {
                    customAlert('Error al subir la portada');
                  } finally {
                    setIsSaving(false);
                  }
                }}
              />
            </div>
          </div>

          {/* Quick stats */}
          <div className="glass rounded-xl p-5 border border-border space-y-3">
            <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider">Resumen</h3>
            <div className="space-y-2.5">
              <div className="flex justify-between items-center text-sm">
                <span className="text-text-secondary flex items-center gap-1.5">
                  <Music className="w-3.5 h-3.5" /> Canciones
                </span>
                <span className="font-bold text-text-primary">{release.tracks.length}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-text-secondary flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5" /> Acceso
                </span>
                <span className={`font-bold ${release.isPublic ? 'text-success' : 'text-text-secondary'}`}>
                  {release.isPublic ? 'Público' : 'Privado'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right column: tracklist */}
        <div className="lg:col-span-2 space-y-4">
          <div className="glass rounded-xl p-5 border border-border">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider">Tracklist</h3>
                <p className="text-xs text-text-secondary mt-1">Arrastra para reordenar. El nombre se edita en línea.</p>
              </div>
              <Button size="sm" onClick={() => setIsPickerOpen(true)} disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Plus className="w-4 h-4 mr-1.5" />}
                Añadir Canción
              </Button>
            </div>

            {release.tracks.length === 0 ? (
              <div className="text-center py-14 border border-dashed border-border rounded-xl">
                <div className="w-14 h-14 rounded-2xl bg-surface flex items-center justify-center mx-auto mb-4">
                  <Music className="w-7 h-7 text-text-secondary opacity-40" />
                </div>
                <p className="text-text-secondary mb-3">Aún no hay canciones en este lanzamiento.</p>
                <Button variant="outline" onClick={() => setIsPickerOpen(true)}>
                  <Plus className="w-4 h-4 mr-1.5" /> Añadir ahora
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {release.tracks.map((track, index) => (
                  <div
                    key={track.id}
                    draggable
                    onDragStart={e => {
                      e.dataTransfer.setData('text/plain', index.toString());
                      e.dataTransfer.effectAllowed = 'move';
                      (e.currentTarget as HTMLElement).style.opacity = '0.5';
                    }}
                    onDragEnd={e => {
                      (e.currentTarget as HTMLElement).style.opacity = '1';
                      document.querySelectorAll('.drag-over-track').forEach(el => {
                        el.classList.remove('drag-over-track', 'border-accent', 'bg-accent/5');
                      });
                    }}
                    onDragOver={e => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      e.currentTarget.classList.add('drag-over-track', 'border-accent', 'bg-accent/5');
                    }}
                    onDragLeave={e => {
                      e.currentTarget.classList.remove('drag-over-track', 'border-accent', 'bg-accent/5');
                    }}
                    onDrop={e => {
                      e.preventDefault();
                      e.currentTarget.classList.remove('drag-over-track', 'border-accent', 'bg-accent/5');
                      const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
                      if (!isNaN(fromIndex) && fromIndex !== index) {
                        reorderTracks(fromIndex, index);
                      }
                    }}
                    className="flex items-center gap-3 bg-surface-elevated/60 border border-border rounded-xl p-3 group transition-all hover:border-border/80 hover:bg-surface-elevated cursor-default"
                  >
                    <div className="cursor-grab active:cursor-grabbing text-text-secondary/40 hover:text-text-secondary px-1 transition-colors">
                      <GripVertical className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-bold w-6 text-center text-text-secondary tabular-nums">{index + 1}</span>
                    <div className="w-8 h-8 rounded-lg bg-surface border border-border flex items-center justify-center shrink-0">
                      <Music className="w-3.5 h-3.5 text-text-secondary opacity-50" />
                    </div>
                    <input
                      type="text"
                      value={track.title}
                      onChange={e => updateTrackTitle(track.id, e.target.value)}
                      className="flex-1 bg-transparent border-none focus:outline-none text-sm font-semibold text-text-primary focus:ring-1 focus:ring-accent/40 rounded px-2 py-1"
                    />
                    <button
                      onClick={() => removeTrack(track.id)}
                      className="p-1.5 text-text-secondary hover:text-error rounded-lg hover:bg-error/10 transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* URL card */}
          <div className="glass rounded-xl border border-border p-4">
            <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-3">Enlace de Preview</h3>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-surface border border-border rounded-lg px-3 py-2">
                <span className="text-xs text-text-secondary font-mono">
                  {typeof window !== 'undefined' ? window.location.origin : ''}/previews/{releaseId}
                </span>
              </div>
              <button
                onClick={handleCopyLink}
                className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border font-semibold transition-all shrink-0 ${
                  linkCopied
                    ? 'bg-success/10 text-success border-success/25'
                    : 'bg-surface border-border text-text-secondary hover:text-text-primary'
                }`}
              >
                {linkCopied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {linkCopied ? 'Copiado' : 'Copiar'}
              </button>
              <a
                href={`/previews/${releaseId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-accent text-white font-semibold hover:bg-accent/90 transition-colors shrink-0"
              >
                <Play className="w-3.5 h-3.5" /> Abrir
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
