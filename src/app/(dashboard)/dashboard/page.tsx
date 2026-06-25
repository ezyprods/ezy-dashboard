'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/Button";
import { Plus, UploadCloud, AlertCircle, Loader2, Music, Play, Calendar, LayoutDashboard, ChevronRight, Users } from "lucide-react";
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
    fetch(`/api/dashboard/pulse?t=${Date.now()}`)
      .then(res => res.json())
      .then(data => {
        if (data.needsAuth) {
          customAlert('El acceso a Google Drive ha caducado. Te redirigimos para que generes un nuevo token.');
          setTimeout(() => {
            window.location.href = '/api/auth/google-token?type=drive';
          }, 2000);
          setIsLoading(false);
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
      <div className="shrink-0 flex flex-col sm:flex-row sm:items-end justify-between gap-4 glass p-6 rounded-3xl border border-border/60 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[100px] -mr-40 -mt-40 pointer-events-none" />
        
        <div className="relative z-10">
          <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-text-primary to-text-secondary tracking-tight mb-2">
            Centro de Comando
          </h1>
          <div className="space-y-1">
            {pulseData.globalStats?.priorityAlerts?.map((alert: string, i: number) => (
              <p key={i} className={`text-sm font-medium flex items-center gap-2 ${i === 0 && alert.includes('Revisión') ? 'text-warning' : 'text-text-secondary'}`}>
                {i === 0 && alert.includes('Revisión') ? <AlertCircle className="w-4 h-4" /> : <ChevronRight className="w-4 h-4 text-accent/50" />}
                {alert}
              </p>
            ))}
            {(!pulseData.globalStats?.priorityAlerts || pulseData.globalStats?.priorityAlerts.length === 0) && (
              <p className="text-sm font-medium text-text-secondary flex items-center gap-2">
                <ChevronRight className="w-4 h-4 text-accent/50" />
                El estudio está al día. No hay tareas urgentes.
              </p>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-3 relative z-10">
          <div className="flex gap-4 mr-4 px-4 py-2 bg-surface/50 rounded-2xl border border-border/50 backdrop-blur-md hidden md:flex">
            <div className="flex flex-col items-center">
              <span className="text-lg font-bold text-text-primary">{activeProjectsCount}</span>
              <span className="text-[10px] text-text-secondary uppercase font-bold tracking-wider">Proyectos</span>
            </div>
            <div className="w-px bg-border/80" />
            <div className="flex flex-col items-center">
              <span className="text-lg font-bold text-accent">{artists.length}</span>
              <span className="text-[10px] text-text-secondary uppercase font-bold tracking-wider">Artistas</span>
            </div>
          </div>
          <Button onClick={() => setIsNewArtistModalOpen(true)} className="gap-2 shadow-[0_0_20px_rgba(var(--accent),0.3)] hover:shadow-[0_0_30px_rgba(var(--accent),0.5)] transition-all">
            <Plus className="w-5 h-5" /> Nuevo Artista
          </Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-6 min-h-0 overflow-y-auto scrollbar-hide">
        
        {/* Top Grid: Quick Actions & Widgets */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 shrink-0">
          
          {/* Quick Actions Strip */}
          <div className="lg:col-span-1 flex flex-col gap-4">
            <div onClick={() => setIsNewProjectOpen(true)} className="glass p-4 rounded-2xl border border-border hover:border-accent/40 cursor-pointer group hover:bg-surface-elevated transition-all flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-accent/10 text-accent flex items-center justify-center group-hover:scale-105 transition-transform">
                <Music className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-text-primary text-sm">Nuevo Proyecto</h3>
                <p className="text-xs text-text-secondary">Crear en cualquier artista</p>
              </div>
              <ChevronRight className="w-5 h-5 text-text-secondary opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
            </div>

            <div onClick={() => setIsQuickUploadOpen(true)} className="glass p-4 rounded-2xl border border-border hover:border-blue-500/40 cursor-pointer group hover:bg-surface-elevated transition-all flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center group-hover:scale-105 transition-transform">
                <UploadCloud className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-text-primary text-sm">Subida Rápida</h3>
                <p className="text-xs text-text-secondary">Sube a su carpeta Drive</p>
              </div>
              <ChevronRight className="w-5 h-5 text-text-secondary opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
            </div>

            <div onClick={() => router.push('/calendar')} className="glass p-4 rounded-2xl border border-border hover:border-emerald-500/40 cursor-pointer group hover:bg-surface-elevated transition-all flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Calendar className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-text-primary text-sm">Calendario</h3>
                <p className="text-xs text-text-secondary">Ver tu agenda inteligente</p>
              </div>
              <ChevronRight className="w-5 h-5 text-text-secondary opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
            </div>
          </div>

          {/* Widgets Grid */}
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6 h-full">
            <div className="h-[260px] lg:h-full">
               <GlobalMatricesWidget />
            </div>
            
            <div className="relative h-[260px] lg:h-full">
              <div className="absolute -inset-0.5 bg-gradient-to-b from-blue-500/10 to-transparent rounded-[24px] blur opacity-50 pointer-events-none" />
              <div className="relative bg-surface border border-border/60 rounded-[20px] overflow-hidden shadow-lg h-full flex flex-col">
                <div className="p-4 border-b border-border/50 bg-surface-elevated/30 flex items-center gap-2 shrink-0">
                  <Calendar className="w-4 h-4 text-blue-500" />
                  <h3 className="font-bold text-sm text-text-primary uppercase tracking-wider">Próximos eventos</h3>
                </div>
                <div className="p-2 flex-1 overflow-hidden">
                  <CalendarWidget />
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Global Tasks Kanban (Full Width) */}
        <div className="flex-1 min-h-[500px]">
          <GlobalPendingTasks />
        </div>
      </div>
    </div>
  );
}
