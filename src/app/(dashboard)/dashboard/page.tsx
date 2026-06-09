'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/Button";
import { Plus, FolderPlus, UploadCloud, AlertCircle, Loader2 } from "lucide-react";
import { useArtists } from "@/lib/hooks/useArtists";
import { SERVICE_LABELS } from "@/lib/constants";
import { NewArtistModal } from "@/components/artists/NewArtistModal";
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const { activeArtists, isLoading, error } = useArtists();
  const [isNewArtistModalOpen, setIsNewArtistModalOpen] = useState(false);
  const router = useRouter();

  return (
    <div className="space-y-6 animate-fade-in">
      <NewArtistModal 
        isOpen={isNewArtistModalOpen} 
        onClose={() => setIsNewArtistModalOpen(false)} 
      />

      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Dashboard</h1>
          <p className="text-text-secondary mt-1">Resumen de tu estudio y proyectos activos.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <Button variant="outline" className="hidden md:flex">
            <FolderPlus className="w-4 h-4 mr-2" />
            Nuevo Proyecto
          </Button>
          <Button variant="outline" className="hidden md:flex">
            <UploadCloud className="w-4 h-4 mr-2" />
            Subir Archivo
          </Button>
          <Button onClick={() => setIsNewArtistModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Artista
          </Button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column (Artists) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass rounded-xl p-6 border border-border">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Artistas Activos</h2>
              <Button variant="ghost" size="sm" className="text-accent">Ver todos</Button>
            </div>
            
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12 text-text-secondary">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-accent" />
                <p>Cargando artistas desde Drive...</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center border border-error/20 bg-error/5 rounded-lg">
                <AlertCircle className="w-8 h-8 text-error mb-3" />
                <h3 className="font-semibold text-text-primary mb-1">Error de conexión</h3>
                <p className="text-sm text-text-secondary max-w-md">
                  No se pudo conectar con Google Drive. Por favor, asegúrate de haber configurado 
                  tus credenciales en el archivo <code className="bg-surface-elevated px-1 py-0.5 rounded text-accent">.env.local</code>.
                </p>
                <p className="text-xs text-text-secondary mt-2 opacity-70">Detalle: {error}</p>
              </div>
            ) : activeArtists.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-text-secondary border border-dashed border-border rounded-lg">
                <p>No tienes artistas activos todavía.</p>
                <Button variant="link" className="mt-2">Crear tu primer artista</Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {activeArtists.map((artist) => (
                  <div key={artist.id} onClick={() => router.push(`/artists/${artist.id}`)} className="bg-surface-elevated rounded-lg p-4 border border-border card-hover cursor-pointer group">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-full bg-surface border border-border overflow-hidden flex items-center justify-center">
                        {artist.photoUrl ? (
                          <img src={artist.photoUrl} alt={artist.name} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                        ) : (
                          <span className="font-bold text-lg text-text-secondary">{artist.name.charAt(0)}</span>
                        )}
                      </div>
                      <div>
                        <h3 className="font-semibold text-text-primary">{artist.name}</h3>
                        <p className="text-sm text-text-secondary">{artist.activeProject || 'Sin proyecto activo'}</p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {artist.services?.slice(0, 2).map((service) => (
                            <span key={service} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent/20 text-accent-light">
                              {SERVICE_LABELS[service] || service}
                            </span>
                          ))}
                          {artist.services?.length > 2 && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-surface text-text-secondary">
                              +{artist.services.length - 2}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column (Sidebars) */}
        <div className="space-y-6">
          
          {/* This Week Panel */}
          <div className="glass rounded-xl p-6 border border-border">
            <h2 className="text-lg font-semibold mb-4">Esta semana</h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3 opacity-50">
                <div className="w-1.5 h-1.5 rounded-full bg-border mt-2" />
                <div>
                  <p className="text-sm font-medium text-text-primary">No hay eventos próximos</p>
                  <p className="text-xs text-text-secondary">Conecta tu calendario para verlos aquí</p>
                </div>
              </div>
            </div>
          </div>

          {/* Pending Payments */}
          <div className="glass rounded-xl p-6 border border-border">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-error">Pagos pendientes</h2>
            </div>
            <div className="flex items-center justify-center p-6 text-sm text-text-secondary text-center">
              Todo al día. No hay pagos pendientes.
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
