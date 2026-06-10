'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/Button";
import { Plus, UploadCloud, AlertCircle, Loader2, Music, Play, TrendingUp, Calendar, LayoutDashboard, ChevronRight, Users } from "lucide-react";
import { NewArtistModal } from "@/components/artists/NewArtistModal";
import { QuickUploadModal } from "@/components/dashboard/QuickUploadModal";
import { CalendarWidget } from "@/components/dashboard/CalendarWidget";
import { useRouter } from 'next/navigation';
import type { Artist } from '@/types';

export default function DashboardPage() {
  const [isNewArtistModalOpen, setIsNewArtistModalOpen] = useState(false);
  const [isQuickUploadOpen, setIsQuickUploadOpen] = useState(false);
  const router = useRouter();
  
  const [pulseData, setPulseData] = useState<{ artists: Artist[], globalStats: any }>({ artists: [], globalStats: null });
  const [artists, setArtists] = useState<Artist[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard/pulse')
      .then(res => res.json())
      .then(data => {
        setPulseData(data);
        setArtists(data.artists || []);
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Failed to load dashboard pulse', err);
        setIsLoading(false);
      });
  }, []);

  const getStatusRingClass = (color?: string) => {
    switch (color) {
      case 'purple': return 'ring-2 ring-accent ring-offset-2 ring-offset-surface';
      case 'orange': return 'ring-2 ring-warning ring-offset-2 ring-offset-surface';
      case 'green': return 'ring-2 ring-success ring-offset-2 ring-offset-surface';
      default: return 'ring-1 ring-border';
    }
  };

  const getStatusText = (pulse?: any) => {
    if (!pulse || pulse.statusColor === 'gray' || !pulse.activeProjects?.length) {
      return <span className="text-text-secondary opacity-70">En pausa</span>;
    }
    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {pulse.activeProjects.map((p: any) => (
          <span key={p.id} className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20 truncate max-w-[120px]">
            {p.type === 'album' ? '💿' : '🎵'} {p.title}
          </span>
        ))}
      </div>
    );
  };
  
  const activeProjectsCount = pulseData.globalStats?.totalActiveProjects || 0;

  return (
    <div className="space-y-8 animate-fade-in pb-20">
      <NewArtistModal 
        isOpen={isNewArtistModalOpen} 
        onClose={() => setIsNewArtistModalOpen(false)} 
      />
      <QuickUploadModal
        isOpen={isQuickUploadOpen}
        onClose={() => setIsQuickUploadOpen(false)}
        artists={artists}
      />

      {/* Action Center (Header) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-text-primary tracking-tight">Centro de Comando</h1>
          <div className="mt-2 space-y-1">
            {pulseData.globalStats?.priorityAlerts?.map((alert: string, i: number) => (
              <p key={i} className={`text-sm flex items-center gap-2 ${i === 0 && alert.includes('Revisión') ? 'text-warning' : 'text-text-secondary'}`}>
                {i === 0 && alert.includes('Revisión') ? <AlertCircle className="w-4 h-4" /> : <ChevronRight className="w-4 h-4 opacity-50" />}
                {alert}
              </p>
            ))}
            {(!pulseData.globalStats?.priorityAlerts || pulseData.globalStats?.priorityAlerts.length === 0) && (
              <p className="text-sm text-text-secondary flex items-center gap-2">
                <ChevronRight className="w-4 h-4 opacity-50" />
                Sincronizando el pulso del estudio...
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => setIsNewArtistModalOpen(true)} className="gap-2 shadow-lg shadow-accent/20">
            <Plus className="w-4 h-4" /> Nuevo Artista
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column (Main Content) */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div onClick={() => router.push('/artists')} className="glass p-5 rounded-2xl border border-border hover:border-accent/50 transition-all duration-300 cursor-pointer group">
              <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Music className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-text-primary">Nuevo Proyecto</h3>
              <p className="text-sm text-text-secondary mt-1">Elige un artista primero</p>
            </div>
            <div onClick={() => setIsQuickUploadOpen(true)} className="glass p-5 rounded-2xl border border-border hover:border-accent/50 transition-all duration-300 cursor-pointer group">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <UploadCloud className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-text-primary">Subida Rápida</h3>
              <p className="text-sm text-text-secondary mt-1">Sube a su carpeta Drive</p>
            </div>
            <div onClick={() => router.push('/calendar')} className="glass p-5 rounded-2xl border border-border hover:border-accent/50 transition-all duration-300 cursor-pointer group">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Calendar className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-text-primary">Calendario</h3>
              <p className="text-sm text-text-secondary mt-1">Ver tu agenda inteligente</p>
            </div>
          </div>

          {/* Active Artists List */}
          <div className="glass rounded-2xl p-6 border border-border">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                <Users className="w-5 h-5 text-accent" />
                Directorio de Artistas
              </h2>
              <button onClick={() => router.push('/artists')} className="text-sm text-accent hover:text-accent-light font-medium transition-colors">
                Ver todos
              </button>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-accent" />
              </div>
            ) : artists.length === 0 ? (
              <div className="text-center py-8 text-text-secondary border border-dashed border-border rounded-xl">
                No tienes artistas aún. Añade tu primer cliente.
              </div>
            ) : (
              <div className="space-y-2">
                {artists.slice(0, 8).map((artist) => {
                  const pulse = artist.pulseStats;
                  const hasActiveProject = pulse?.activeProjects && pulse.activeProjects.length > 0;
                  return (
                    <div 
                      key={artist.id}
                      onClick={() => router.push(`/artists/${artist.id}`)}
                      className="group flex items-center justify-between p-3 rounded-xl hover:bg-surface-elevated transition-all cursor-pointer border border-transparent hover:border-border/50"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full bg-surface flex items-center justify-center text-text-primary font-bold shadow-sm ${getStatusRingClass(pulse?.statusColor)}`}>
                          {artist.name.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-text-primary group-hover:text-accent transition-colors">{artist.name}</h3>
                            {pulse?.pendingPayments ? pulse.pendingPayments > 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-error/10 text-error font-medium">💰 Pagos pdtes.</span>
                            ) : null}
                          </div>
                          <div className="text-xs mt-0.5">
                            {getStatusText(pulse)}
                          </div>
                        </div>
                      </div>
                      
                      {hasActiveProject ? (
                        <div className="flex flex-col items-end gap-1">
                          <Button size="sm" variant="ghost" className="h-8 opacity-0 group-hover:opacity-100 transition-opacity bg-accent/10 text-accent hover:bg-accent hover:text-white">
                            <Play className="w-3 h-3 mr-1.5" /> Continuar
                          </Button>
                          {pulse?.lastSessionDate && (
                            <span className="text-[10px] text-text-secondary">Últ. sesión: {pulse.lastSessionDate}</span>
                          )}
                        </div>
                      ) : (
                        <ChevronRight className="w-4 h-4 text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity" />
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

          <div className="glass rounded-2xl p-6 border border-border">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-error flex items-center gap-2">
                Pagos pendientes
              </h2>
            </div>
            {pulseData.globalStats?.totalPendingPayments > 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-sm text-center bg-error/5 rounded-xl border border-dashed border-error/20">
                <p className="text-error font-bold text-2xl mb-1">{pulseData.globalStats.totalPendingPayments}€</p>
                <p className="text-text-secondary">en cobros atrasados</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-sm text-text-secondary text-center bg-surface/30 rounded-xl border border-dashed border-border">
                <TrendingUp className="w-8 h-8 text-success/50 mb-3" />
                <p className="text-success">Todo al día. No hay pagos pendientes.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
