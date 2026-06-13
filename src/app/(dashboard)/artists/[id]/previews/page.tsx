'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import {
  ArrowLeft, Plus, Disc, Loader2, Play, Settings2,
  Shield, ShieldOff, Copy, CheckCircle2, ExternalLink,
  Music, Eye, Trash2, Globe, Calendar, ListMusic, RefreshCw
} from 'lucide-react';
import type { Release } from '@/types';
import { customAlert, customConfirm, customPrompt } from '@/lib/dialog';

export default function ArtistPreviewsPage() {
  const params = useParams();
  const router = useRouter();
  const artistId = params?.id as string;

  const [releases, setReleases] = useState<Release[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetchReleases();
  }, [artistId]);

  const fetchReleases = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/artists/${artistId}/releases`);
      if (!res.ok) throw new Error('Error loading releases');
      const data = await res.json();
      setReleases(data.releases || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateRelease = async () => {
    const title = await customPrompt('Nombre de la nueva Preview (Ej: EP Verano, Single Debut):');
    if (!title) return;

    setIsCreating(true);
    try {
      const res = await fetch(`/api/artists/${artistId}/releases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
      });
      if (!res.ok) throw new Error('Error creating release');
      const data = await res.json();
      const releaseId = data.id || data.release?.id;
      if (releaseId) {
        router.push(`/artists/${artistId}/releases/${releaseId}/edit`);
      } else {
        throw new Error('No release ID returned');
      }
    } catch (err) {
      console.error(err);
      customAlert('Error creando el preview');
    } finally {
      setIsCreating(false);
    }
  };

  const togglePublic = async (releaseId: string, currentIsPublic: boolean) => {
    try {
      const res = await fetch(`/api/releases/${releaseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublic: !currentIsPublic })
      });
      if (!res.ok) throw new Error('Error toggling');
      setReleases(prev => prev.map(r => r.id === releaseId ? { ...r, isPublic: !currentIsPublic } : r));
      customAlert(!currentIsPublic ? '✓ Preview ahora pública — visible en el portal del artista' : 'Preview marcada como privada');
    } catch {
      customAlert('Error al cambiar la privacidad');
    }
  };

  const handleDelete = async (releaseId: string, title: string) => {
    if (!await customConfirm(`¿Eliminar el preview "${title}"? Esta acción no se puede deshacer.`)) return;
    try {
      const res = await fetch(`/api/releases/${releaseId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error deleting');
      setReleases(prev => prev.filter(r => r.id !== releaseId));
      customAlert('Preview eliminado');
    } catch {
      customAlert('Error al eliminar el preview');
    }
  };

  const copyPreviewLink = (releaseId: string) => {
    const url = `${window.location.origin}/previews/${releaseId}`;
    navigator.clipboard.writeText(url);
    setCopiedId(releaseId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const publicCount = releases.filter(r => r.isPublic).length;

  return (
    <div className="space-y-6 animate-fade-in pb-20 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push(`/artists/${artistId}`)} className="text-text-secondary hover:text-text-primary">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Gestor de Previews</h1>
            <p className="text-sm text-text-secondary mt-0.5">
              Pre-escuchas exclusivas para compartir con el artista y su equipo.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={fetchReleases} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Button onClick={handleCreateRelease} disabled={isCreating}>
            {isCreating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Nueva Preview
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      {releases.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="glass rounded-xl border border-border p-4 text-center">
            <p className="text-2xl font-black text-text-primary">{releases.length}</p>
            <p className="text-xs text-text-secondary mt-0.5 flex items-center justify-center gap-1">
              <ListMusic className="w-3 h-3" /> Total Previews
            </p>
          </div>
          <div className="glass rounded-xl border border-border p-4 text-center">
            <p className="text-2xl font-black text-success">{publicCount}</p>
            <p className="text-xs text-text-secondary mt-0.5 flex items-center justify-center gap-1">
              <Globe className="w-3 h-3" /> Públicas
            </p>
          </div>
          <div className="glass rounded-xl border border-border p-4 text-center">
            <p className="text-2xl font-black text-text-secondary">{releases.length - publicCount}</p>
            <p className="text-xs text-text-secondary mt-0.5 flex items-center justify-center gap-1">
              <ShieldOff className="w-3 h-3" /> Privadas
            </p>
          </div>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      ) : releases.length === 0 ? (
        <div className="glass rounded-2xl p-16 text-center text-text-secondary border border-dashed border-border mt-4">
          <div className="w-20 h-20 rounded-2xl bg-accent/8 border border-accent/15 flex items-center justify-center mx-auto mb-6">
            <Disc className="w-10 h-10 text-accent/50" />
          </div>
          <h2 className="text-xl font-bold text-text-primary mb-2">Sin previews todavía</h2>
          <p className="mb-6 max-w-md mx-auto text-sm">
            Crea pre-escuchas exclusivas para compartir con los artistas. Puedes hacer las públicas o mantenerlas privadas.
          </p>
          <Button onClick={handleCreateRelease} disabled={isCreating}>
            <Plus className="w-4 h-4 mr-2" /> Crear mi primera Preview
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {releases.map(release => (
            <div
              key={release.id}
              className="bg-surface-elevated rounded-2xl border border-border group relative overflow-hidden card-hover flex flex-col"
            >
              {/* Cover */}
              <div
                className="w-full aspect-square bg-surface border-b border-border flex items-center justify-center overflow-hidden cursor-pointer relative"
                onClick={() => window.open(`/previews/${release.id}`, '_blank')}
              >
                {release.coverArtId ? (
                  <img
                    src={`/api/audio/${release.coverArtId}`}
                    alt={release.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-3 text-text-secondary opacity-40">
                    <Disc className="w-14 h-14" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider">Sin portada</span>
                  </div>
                )}

                {/* Public badge */}
                <div className={`absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold ${
                  release.isPublic
                    ? 'bg-success/20 text-success border border-success/30 backdrop-blur-sm'
                    : 'bg-surface/80 text-text-secondary border border-border/50 backdrop-blur-sm'
                }`}>
                  {release.isPublic ? <Globe className="w-3 h-3" /> : <ShieldOff className="w-3 h-3" />}
                  {release.isPublic ? 'Pública' : 'Privada'}
                </div>

                {/* Play overlay */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
                  <div className="w-14 h-14 bg-accent text-white rounded-full flex items-center justify-center shadow-lg shadow-accent/40 transform scale-90 group-hover:scale-100 transition-transform">
                    <Play className="w-6 h-6 ml-1 fill-current" />
                  </div>
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 p-4">
                <h4 className="font-bold text-text-primary text-sm line-clamp-1 mb-1 group-hover:text-accent transition-colors">
                  {release.title}
                </h4>
                <p className="text-xs text-text-secondary flex items-center gap-1">
                  <Music className="w-3 h-3" />
                  {release.tracks?.length || 0} canciones
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 px-4 pb-4 pt-0">
                {/* Toggle public */}
                <button
                  onClick={() => togglePublic(release.id, !!release.isPublic)}
                  title={release.isPublic ? 'Hacer privada' : 'Publicar en portal del artista'}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex-1 justify-center ${
                    release.isPublic
                      ? 'bg-success/10 text-success hover:bg-success/20 border border-success/20'
                      : 'bg-surface border border-border text-text-secondary hover:text-text-primary hover:border-border/80'
                  }`}
                >
                  {release.isPublic ? <><Shield className="w-3.5 h-3.5" /> Pública</> : <><ShieldOff className="w-3.5 h-3.5" /> Privada</>}
                </button>

                {/* Copy link */}
                <button
                  onClick={() => copyPreviewLink(release.id)}
                  title="Copiar enlace de preview"
                  className={`p-2 rounded-lg text-xs transition-all border ${
                    copiedId === release.id
                      ? 'bg-success/10 text-success border-success/20'
                      : 'bg-surface border-border text-text-secondary hover:text-text-primary hover:border-border/80'
                  }`}
                >
                  {copiedId === release.id ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>

                {/* Edit */}
                <button
                  onClick={() => router.push(`/artists/${artistId}/releases/${release.id}/edit`)}
                  title="Editar"
                  className="p-2 rounded-lg bg-surface border border-border text-text-secondary hover:text-accent hover:border-accent/30 transition-all"
                >
                  <Settings2 className="w-4 h-4" />
                </button>

                {/* Delete */}
                <button
                  onClick={() => handleDelete(release.id, release.title)}
                  title="Eliminar"
                  className="p-2 rounded-lg bg-surface border border-border text-text-secondary hover:text-error hover:border-error/30 hover:bg-error/5 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Integration note */}
      {releases.length > 0 && (
        <div className="glass rounded-xl border border-accent/20 p-4 bg-accent/5">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/15 flex items-center justify-center shrink-0 mt-0.5">
              <Globe className="w-4 h-4 text-accent" />
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary mb-0.5">Integración con el Portal del Artista</p>
              <p className="text-xs text-text-secondary leading-relaxed">
                Las previews marcadas como <strong className="text-success">públicas</strong> aparecen automáticamente en el módulo
                "Previews / Lanzamientos" del portal del artista. Actívalo desde la pestaña <strong className="text-accent">Portal</strong>.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
