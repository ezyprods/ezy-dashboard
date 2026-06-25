'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/Button";
import { Plus, UploadCloud, AlertCircle, Music, Calendar, ChevronRight } from "lucide-react";
import { NewArtistModal } from "@/components/artists/NewArtistModal";
import { QuickUploadModal } from "@/components/dashboard/QuickUploadModal";
import { NewProjectModal } from "@/components/projects/NewProjectModal";
import { CalendarWidget } from "@/components/dashboard/CalendarWidget";
import { GlobalMatricesWidget } from "@/components/dashboard/GlobalMatricesWidget";
import { GlobalPendingTasks } from "@/components/dashboard/GlobalPendingTasks";
import { useRouter } from 'next/navigation';
import type { Artist } from '@/types';
import { useContextMenu } from '@/lib/contexts/ContextMenuContext';
import { customAlert } from '@/lib/dialog';

export default function DashboardPage() {
  const [isNewArtistModalOpen, setIsNewArtistModalOpen] = useState(false);
  const [isQuickUploadOpen, setIsQuickUploadOpen] = useState(false);
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const router = useRouter();
  const { showMenu } = useContextMenu();

  const [pulseData, setPulseData] = useState<{ artists: Artist[]; globalStats: any }>({ artists: [], globalStats: null });
  const [artists, setArtists] = useState<Artist[]>([]);
  const [matrices, setMatrices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMatricesLoading, setIsMatricesLoading] = useState(true);

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

    fetch('/api/dashboard/matrices')
      .then(res => res.json())
      .then(data => {
        setMatrices(data.matrices || []);
        setIsMatricesLoading(false);
      })
      .catch(err => {
        console.error('Error fetching global matrices', err);
        setIsMatricesLoading(false);
      });
  }, []);

  const activeProjectsCount = matrices.length;
  const alertMsg = pulseData.globalStats?.priorityAlerts?.[0] || 'El estudio esta al dia. No hay tareas urgentes.';

  return (
    <div className="flex-1 w-full h-full min-h-0 flex flex-col gap-4 animate-fade-in overflow-x-hidden lg:overflow-hidden">
      <NewArtistModal isOpen={isNewArtistModalOpen} onClose={() => setIsNewArtistModalOpen(false)} />
      <QuickUploadModal isOpen={isQuickUploadOpen} onClose={() => setIsQuickUploadOpen(false)} artists={artists} />
      <NewProjectModal isOpen={isNewProjectOpen} onClose={() => setIsNewProjectOpen(false)} artists={artists} />

      {/* ROW 1: Compact Header */}
      <div className="shrink-0 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="min-w-0">
            <h1 className="text-2xl font-black text-text-primary tracking-tight leading-none">
              Centro de Comando
            </h1>
            <p className="text-xs text-text-secondary mt-1 flex items-center gap-1.5">
              {alertMsg.includes('Revision') && <AlertCircle className="w-3.5 h-3.5 text-warning shrink-0" />}
              {alertMsg}
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2 shrink-0">
            <div className="flex flex-col items-center px-3 py-1.5 bg-surface-elevated rounded-xl border border-border/60 shadow-sm">
              <span className="text-base font-black text-text-primary leading-none">{activeProjectsCount}</span>
              <span className="text-[9px] text-text-secondary uppercase font-bold tracking-widest mt-0.5">Proyectos</span>
            </div>
            <div className="flex flex-col items-center px-3 py-1.5 bg-surface-elevated rounded-xl border border-border/60 shadow-sm">
              <span className="text-base font-black text-accent leading-none">{artists.length}</span>
              <span className="text-[9px] text-text-secondary uppercase font-bold tracking-widest mt-0.5">Artistas</span>
            </div>
          </div>
        </div>
        <Button
          onClick={() => setIsNewArtistModalOpen(true)}
          className="gap-2 shrink-0 shadow-[0_0_20px_rgba(var(--accent),0.25)] hover:shadow-[0_0_30px_rgba(var(--accent),0.45)] transition-all"
        >
          <Plus className="w-4 h-4" /> Nuevo Artista
        </Button>
      </div>

      {/* ROW 2: Bento Top */}
      <div className="shrink-0 grid grid-cols-1 lg:grid-cols-3 gap-4 lg:h-[min(24vh,220px)] min-h-[180px]">

        {/* Col 1: Quick Actions */}
        <div className="flex flex-col gap-2 h-full">
          <div
            onClick={() => setIsNewProjectOpen(true)}
            className="flex-1 relative overflow-hidden glass rounded-xl border border-border/60 hover:border-accent/50 cursor-pointer group transition-all flex items-center gap-3 px-4 shadow-sm hover:shadow-md hover:bg-surface-elevated/50"
          >
            <div className="absolute top-0 right-0 w-20 h-20 bg-accent/10 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none group-hover:scale-150 transition-transform duration-500" />
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/20 text-accent flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner relative z-10 shrink-0">
              <Music className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0 relative z-10">
              <h3 className="font-bold text-text-primary text-sm">Nuevo Proyecto</h3>
              <p className="text-[11px] text-text-secondary font-medium">Crear en cualquier artista</p>
            </div>
            <ChevronRight className="w-4 h-4 text-text-secondary opacity-0 group-hover:opacity-100 group-hover:translate-x-0 -translate-x-2 transition-all relative z-10 shrink-0" />
          </div>

          <div
            onClick={() => setIsQuickUploadOpen(true)}
            className="flex-1 relative overflow-hidden glass rounded-xl border border-border/60 hover:border-blue-500/50 cursor-pointer group transition-all flex items-center gap-3 px-4 shadow-sm hover:shadow-md hover:bg-surface-elevated/50"
          >
            <div className="absolute top-0 right-0 w-20 h-20 bg-blue-500/10 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none group-hover:scale-150 transition-transform duration-500" />
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-500/5 border border-blue-500/20 text-blue-500 flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner relative z-10 shrink-0">
              <UploadCloud className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0 relative z-10">
              <h3 className="font-bold text-text-primary text-sm">Subida Rapida</h3>
              <p className="text-[11px] text-text-secondary font-medium">Sube a su carpeta Drive</p>
            </div>
            <ChevronRight className="w-4 h-4 text-text-secondary opacity-0 group-hover:opacity-100 group-hover:translate-x-0 -translate-x-2 transition-all relative z-10 shrink-0" />
          </div>

          <div
            onClick={() => router.push('/calendar')}
            className="flex-1 relative overflow-hidden glass rounded-xl border border-border/60 hover:border-emerald-500/50 cursor-pointer group transition-all flex items-center gap-3 px-4 shadow-sm hover:shadow-md hover:bg-surface-elevated/50"
          >
            <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/10 rounded-full blur-2xl -mr-6 -mt-6 pointer-events-none group-hover:scale-150 transition-transform duration-500" />
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-500/20 text-emerald-500 flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner relative z-10 shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0 relative z-10">
              <h3 className="font-bold text-text-primary text-sm">Calendario</h3>
              <p className="text-[11px] text-text-secondary font-medium">Ver tu agenda inteligente</p>
            </div>
            <ChevronRight className="w-4 h-4 text-text-secondary opacity-0 group-hover:opacity-100 group-hover:translate-x-0 -translate-x-2 transition-all relative z-10 shrink-0" />
          </div>
        </div>

        {/* Col 2: Matrices Activas */}
        <div className="h-full min-h-0 overflow-hidden">
            <GlobalMatricesWidget matrices={matrices} isLoading={isMatricesLoading} />
        </div>

        {/* Col 3: Proximos Eventos */}
        <div className="relative h-full min-h-0 overflow-hidden">
          <div className="absolute -inset-0.5 bg-gradient-to-b from-blue-500/20 to-transparent rounded-[20px] blur opacity-30 pointer-events-none" />
          <div className="relative bg-surface/80 backdrop-blur-xl border border-border/60 rounded-[20px] overflow-hidden shadow-lg h-full flex flex-col group hover:border-blue-500/30 transition-colors">
            <div className="px-4 py-2.5 border-b border-border/50 bg-gradient-to-b from-surface-elevated/50 to-surface/50 flex items-center gap-2 shrink-0">
              <div className="p-1 rounded-md bg-blue-500/10 text-blue-500">
                <Calendar className="w-3.5 h-3.5" />
              </div>
              <h3 className="font-bold text-sm text-text-primary tracking-tight">Proximos eventos</h3>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              <CalendarWidget />
            </div>
          </div>
        </div>
      </div>

      {/* ROW 3: Kanban */}
      <div className="flex-1 min-h-[500px] lg:min-h-0 lg:overflow-hidden">
        <GlobalPendingTasks />
      </div>
    </div>
  );
}
