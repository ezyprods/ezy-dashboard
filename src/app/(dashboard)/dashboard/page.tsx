'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/Button";
import { Plus, FolderPlus, UploadCloud, AlertCircle, Loader2, Music, Mic, FileAudio, Folder, Play, TrendingUp, Calendar, LayoutDashboard } from "lucide-react";
import { useArtists } from "@/lib/hooks/useArtists";
import { SERVICE_LABELS } from "@/lib/constants";
import { NewArtistModal } from "@/components/artists/NewArtistModal";
import { CalendarWidget } from "@/components/dashboard/CalendarWidget";
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const { activeArtists, isLoading, error } = useArtists();
  const [isNewArtistModalOpen, setIsNewArtistModalOpen] = useState(false);
  const router = useRouter();

  // Sort artists: those with active projects first
  const sortedArtists = [...activeArtists].sort((a, b) => {
    if (a.activeProject && !b.activeProject) return -1;
    if (!a.activeProject && b.activeProject) return 1;
    return 0;
  });

  const activeProjectsCount = activeArtists.filter(a => a.activeProject).length;

  return (
    <div className="space-y-8 animate-fade-in pb-20">
      <NewArtistModal 
        isOpen={isNewArtistModalOpen} 
        onClose={() => setIsNewArtistModalOpen(false)} 
      />

      {/* Banner Section */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-surface-elevated to-surface border border-border p-8 md:p-10 shadow-2xl group">
        <div className="absolute top-0 right-0 w-96 h-96 bg-accent/20 blur-[100px] rounded-full pointer-events-none group-hover:bg-accent/30 transition-colors duration-700" />
        <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-primary/20 blur-[80px] rounded-full pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 text-accent text-sm font-medium mb-4 border border-accent/20">
              <LayoutDashboard className="w-4 h-4" />
              <span>Resumen de tu estudio</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black text-text-primary tracking-tight mb-2">
              Hola, Productor.
            </h1>
            <p className="text-lg text-text-secondary max-w-xl">
              Tienes <strong className="text-white">{activeProjectsCount} proyectos activos</strong> en este momento y {activeArtists.length} artistas en total.
            </p>
          </div>
          
          <div className="flex gap-3">
            <Button onClick={() => setIsNewArtistModalOpen(true)} className="shadow-lg shadow-accent/20">
              <Plus className="w-5 h-5 mr-2" />
              Nuevo Artista
            </Button>
          </div>
        </div>
      </div>

      {/* Quick Actions Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button onClick={() => setIsNewArtistModalOpen(true)} className="glass p-5 rounded-2xl border border-border text-left hover:border-accent/50 hover:bg-accent/5 transition-all group flex flex-col gap-3">
          <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center group-hover:scale-110 transition-transform">
            <Plus className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h3 className="font-semibold text-text-primary">Añadir Artista</h3>
            <p className="text-xs text-text-secondary mt-0.5">Crear perfil nuevo</p>
          </div>
        </button>

        <button onClick={() => router.push('/artists')} className="glass p-5 rounded-2xl border border-border text-left hover:border-accent/50 hover:bg-accent/5 transition-all group flex flex-col gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
            <FolderPlus className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h3 className="font-semibold text-text-primary">Nuevo Proyecto</h3>
            <p className="text-xs text-text-secondary mt-0.5">Elige un artista primero</p>
          </div>
        </button>

        <button onClick={() => router.push('/artists')} className="glass p-5 rounded-2xl border border-border text-left hover:border-accent/50 hover:bg-accent/5 transition-all group flex flex-col gap-3">
          <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
            <UploadCloud className="w-5 h-5 text-green-500" />
          </div>
          <div>
            <h3 className="font-semibold text-text-primary">Subida Rápida</h3>
            <p className="text-xs text-text-secondary mt-0.5">En el perfil del artista</p>
          </div>
        </button>

        <button onClick={() => router.push('/artists')} className="glass p-5 rounded-2xl border border-border text-left hover:border-accent/50 hover:bg-accent/5 transition-all group flex flex-col gap-3">
          <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
            <Music className="w-5 h-5 text-purple-500" />
          </div>
          <div>
            <h3 className="font-semibold text-text-primary">Lanzamientos</h3>
            <p className="text-xs text-text-secondary mt-0.5">Ve a la pestaña del artista</p>
          </div>
        </button>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column (Artists) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass rounded-2xl p-6 md:p-8 border border-border">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center">
                  <Folder className="w-4 h-4 text-text-secondary" />
                </div>
                <h2 className="text-xl font-bold">Artistas Activos</h2>
              </div>
              <Button variant="ghost" size="sm" className="text-accent" onClick={() => router.push('/artists')}>Ver todos</Button>
            </div>
            
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12 text-text-secondary">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-accent" />
                <p>Cargando artistas desde Drive...</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center border border-error/20 bg-error/5 rounded-2xl">
                <AlertCircle className="w-8 h-8 text-error mb-3" />
                <h3 className="font-semibold text-text-primary mb-1">Error de conexión</h3>
                <p className="text-sm text-text-secondary max-w-md">
                  No se pudo conectar con Google Drive.
                </p>
                <p className="text-xs text-text-secondary mt-2 opacity-70">Detalle: {error}</p>
              </div>
            ) : sortedArtists.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-text-secondary border border-dashed border-border rounded-2xl">
                <p>No tienes artistas activos todavía.</p>
                <Button variant="link" className="mt-2" onClick={() => setIsNewArtistModalOpen(true)}>Crear tu primer artista</Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sortedArtists.map((artist) => {
                  const hasActiveProject = !!artist.activeProject;
                  return (
                    <div 
                      key={artist.id} 
                      onClick={() => router.push(`/artists/${artist.id}`)} 
                      className={`rounded-xl p-4 border transition-all cursor-pointer group flex items-center justify-between ${hasActiveProject ? 'bg-surface-elevated/80 border-border hover:border-accent/50' : 'bg-surface/30 border-transparent hover:border-border'}`}
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="w-12 h-12 rounded-full bg-surface border border-border overflow-hidden flex items-center justify-center shrink-0">
                          {artist.photoUrl ? (
                            <img src={artist.photoUrl} alt={artist.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                          ) : (
                            <span className="font-bold text-lg text-text-secondary">{artist.name.charAt(0)}</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-semibold text-text-primary truncate">{artist.name}</h3>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {hasActiveProject ? (
                              <>
                                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                                <p className="text-xs text-accent truncate">{artist.activeProject}</p>
                              </>
                            ) : (
                              <p className="text-xs text-text-secondary truncate">Sin proyecto activo</p>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {hasActiveProject && (
                        <div className="w-8 h-8 rounded-full bg-surface flex items-center justify-center shrink-0 group-hover:bg-accent group-hover:text-white transition-colors">
                          <Play className="w-3.5 h-3.5 ml-0.5" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column (Widgets) */}
        <div className="space-y-6">
          
          {/* Calendar Widget wrapper with error boundary design */}
          <div className="relative">
            <div className="absolute -inset-0.5 bg-gradient-to-b from-blue-500/20 to-transparent rounded-[20px] blur opacity-50" />
            <div className="relative bg-surface-elevated rounded-[18px] border border-border/50 overflow-hidden shadow-xl">
              <div className="p-4 border-b border-border/50 bg-surface/50 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-400" />
                <h3 className="font-semibold text-sm">Próximos eventos</h3>
              </div>
              <div className="p-2">
                <CalendarWidget />
              </div>
            </div>
          </div>

          {/* Pending Payments */}
          <div className="glass rounded-2xl p-6 border border-border">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-error flex items-center gap-2">
                Pagos pendientes
              </h2>
            </div>
            <div className="flex flex-col items-center justify-center py-6 text-sm text-text-secondary text-center bg-surface/30 rounded-xl border border-dashed border-border">
              <TrendingUp className="w-8 h-8 text-success/50 mb-3" />
              <p className="text-success">Todo al día. No hay pagos pendientes.</p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
