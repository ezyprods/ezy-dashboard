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
            <div onClick={() => setIsNewProjectOpen(true)} className="relative overflow-hidden glass p-6 rounded-[20px] border border-border hover:border-accent/50 transition-all duration-500 cursor-pointer group hover:-translate-y-1 hover:shadow-xl hover:shadow-accent/5">
              <div className="absolute top-0 right-0 w-32 h-32 bg-accent/10 blur-3xl rounded-full -mr-16 -mt-16 pointer-events-none transition-transform duration-500 group-hover:scale-150" />
              <div className="relative z-10 flex flex-col h-full justify-between gap-4">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/10 text-accent flex items-center justify-center transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3 shadow-inner">
                    <Music className="w-6 h-6" />
                  </div>
                  <ChevronRight className="w-5 h-5 text-text-secondary opacity-0 -translate-x-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-text-primary">Nuevo Proyecto</h3>
                  <p className="text-sm text-text-secondary mt-0.5">Crear en cualquier artista</p>
                </div>
              </div>
            </div>

            <div onClick={() => setIsQuickUploadOpen(true)} className="relative overflow-hidden glass p-6 rounded-[20px] border border-border hover:border-blue-500/50 transition-all duration-500 cursor-pointer group hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-500/5">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 blur-3xl rounded-full -mr-16 -mt-16 pointer-events-none transition-transform duration-500 group-hover:scale-150" />
              <div className="relative z-10 flex flex-col h-full justify-between gap-4">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-500/5 border border-blue-500/10 text-blue-500 flex items-center justify-center transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3 shadow-inner">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <ChevronRight className="w-5 h-5 text-text-secondary opacity-0 -translate-x-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-text-primary">Subida Rápida</h3>
                  <p className="text-sm text-text-secondary mt-0.5">Sube a su carpeta Drive</p>
                </div>
              </div>
            </div>

            <div onClick={() => router.push('/calendar')} className="relative overflow-hidden glass p-6 rounded-[20px] border border-border hover:border-emerald-500/50 transition-all duration-500 cursor-pointer group hover:-translate-y-1 hover:shadow-xl hover:shadow-emerald-500/5">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 blur-3xl rounded-full -mr-16 -mt-16 pointer-events-none transition-transform duration-500 group-hover:scale-150" />
              <div className="relative z-10 flex flex-col h-full justify-between gap-4">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-500/10 text-emerald-500 flex items-center justify-center transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3 shadow-inner">
                    <Calendar className="w-6 h-6" />
                  </div>
                  <ChevronRight className="w-5 h-5 text-text-secondary opacity-0 -translate-x-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-text-primary">Calendario</h3>
                  <p className="text-sm text-text-secondary mt-0.5">Ver tu agenda inteligente</p>
                </div>
              </div>
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


        </div>
      </div>
    </div>
  );
}
