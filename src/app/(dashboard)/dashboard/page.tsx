'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/Button";
import { Plus, UploadCloud, AlertCircle, Loader2, Music, Play, TrendingUp, Calendar, LayoutDashboard, ChevronRight, Users } from "lucide-react";
import { NewArtistModal } from "@/components/artists/NewArtistModal";
import { QuickUploadModal } from "@/components/dashboard/QuickUploadModal";
import { NewProjectModal } from "@/components/projects/NewProjectModal";
import { CalendarWidget } from "@/components/dashboard/CalendarWidget";
import { GlobalMatricesWidget } from "@/components/dashboard/GlobalMatricesWidget";
import { GlobalPendingTasks } from "@/components/dashboard/GlobalPendingTasks";
import { useRouter } from 'next/navigation';
import type { Artist } from '@/types';
import { useContextMenu } from '@/lib/contexts/ContextMenuContext';
import { customAlert, customConfirm } from '@/lib/dialog';

export default function DashboardPage() {
  const [isNewArtistModalOpen, setIsNewArtistModalOpen] = useState(false);
  const [isQuickUploadOpen, setIsQuickUploadOpen] = useState(false);
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const router = useRouter();
  const { showMenu } = useContextMenu();
  
  const [pulseData, setPulseData] = useState<{ artists: Artist[], globalStats: any }>({ artists: [], globalStats: null });
  const [artists, setArtists] = useState<Artist[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard/pulse')
      .then(res => res.json())
      .then(data => {
        if (data.needsAuth) {
          customAlert('Tu sesión de Google Drive ha expirado por seguridad. Redirigiendo para reconectar...');
          setTimeout(() => {
            window.location.href = '/api/auth/google';
          }, 2000);
          return;
        }
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
    <div className="h-full flex flex-col gap-6 animate-fade-in pb-4 overflow-hidden">
      <NewArtistModal 
        isOpen={isNewArtistModalOpen} 
        onClose={() => setIsNewArtistModalOpen(false)} 
      />
      <QuickUploadModal
        isOpen={isQuickUploadOpen}
        onClose={() => setIsQuickUploadOpen(false)}
        artists={artists}
      />
      <NewProjectModal
        isOpen={isNewProjectOpen}
        onClose={() => setIsNewProjectOpen(false)}
        artists={artists}
      />


      {/* Action Center (Header) */}
      <div className="shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-6">
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

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-8 overflow-hidden">
        {/* Left Column (Main Content) */}
        <div className="lg:col-span-2 flex flex-col gap-6 min-h-0">
          
          {/* Quick Actions */}
          <div className="shrink-0 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div onClick={() => setIsNewProjectOpen(true)} className="glass p-5 rounded-2xl border border-border hover:border-accent/50 transition-all duration-300 cursor-pointer group">
              <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Music className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-text-primary">Nuevo Proyecto</h3>
              <p className="text-sm text-text-secondary mt-1">Crear en cualquier artista</p>
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

          {/* Global Tasks Command Center in place of the old Artists Directory */}
          <div className="flex-1 min-h-0 flex flex-col">
            <GlobalPendingTasks />
          </div>
        </div>

        {/* Right Column (Widgets) */}
        <div className="flex flex-col gap-6 min-h-0 h-full">
          <div className="flex-1 min-h-0 flex flex-col">
            <GlobalMatricesWidget />
          </div>

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
