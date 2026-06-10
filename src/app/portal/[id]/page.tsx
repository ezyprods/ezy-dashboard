'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, Music, CheckCircle2, Circle, Headphones, CreditCard, DollarSign, Calendar, MessageSquare, AlertCircle, Sparkles } from 'lucide-react';
import { WaveformPlayer } from '@/components/projects/WaveformPlayer';

export default function PortalPage() {
  const params = useParams();
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  useEffect(() => {
    const fetchPortal = async () => {
      try {
        const res = await fetch(`/api/portal/${params.id}`);
        if (!res.ok) throw new Error('Portal no encontrado');
        const json = await res.json();
        setData(json);
        if (json.projects && json.projects.length > 0) {
          setSelectedProjectId(json.projects[0].id);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPortal();
  }, [params.id]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex justify-center items-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-accent mx-auto" />
          <p className="text-xs text-text-secondary font-medium tracking-widest uppercase animate-pulse">Cargando Portal...</p>
        </div>
      </div>
    );
  }

  if (!data || data.error) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex justify-center items-center p-6">
        <div className="glass max-w-md w-full p-8 rounded-2xl border border-error/20 text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-error mx-auto" />
          <h1 className="text-2xl font-bold text-text-primary">Portal no disponible</h1>
          <p className="text-text-secondary text-sm">El enlace no es válido, ha caducado o el artista no está configurado.</p>
        </div>
      </div>
    );
  }

  const activeProject = data.projects.find((p: any) => p.id === selectedProjectId) || data.projects[0];

  const totalTasks = activeProject?.tasks?.length || 0;
  const completedTasks = activeProject?.tasks?.filter((t: any) => t.status === 'completed').length || 0;
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#06060a] text-gray-100 font-sans antialiased pb-20 selection:bg-accent selection:text-white">
      {/* Dynamic glow decoration */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-80 bg-accent/5 blur-[120px] rounded-full pointer-events-none" />

      {/* Header */}
      <header className="border-b border-border bg-[#0a0a0f]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center border border-accent/20 shadow-inner">
              <Sparkles className="w-5 h-5 text-accent-light" />
            </div>
            <div>
              <p className="text-[10px] text-accent font-bold uppercase tracking-widest">{data.producerName || 'EZY Studio'}</p>
              <h1 className="text-lg font-bold text-white tracking-tight">Portal de {data.artist.name}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-text-secondary px-3 py-1.5 rounded-full bg-surface-elevated/40 border border-border">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="font-medium">Conexión Segura</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-5xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">
        
        {/* Left Column: Project Selector & Payments Card */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Projects Selector Panel */}
          <div className="glass rounded-2xl border border-border p-5 space-y-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Tus Proyectos</h3>
            {data.projects.length === 0 ? (
              <p className="text-sm text-text-secondary italic">No hay proyectos activos.</p>
            ) : (
              <div className="space-y-2">
                {data.projects.map((project: any) => {
                  const isActive = project.id === selectedProjectId;
                  return (
                    <button
                      key={project.id}
                      onClick={() => setSelectedProjectId(project.id)}
                      className={`w-full text-left p-3.5 rounded-xl border transition-all duration-200 flex flex-col gap-1.5 ${
                        isActive
                          ? 'border-accent bg-accent/5 text-white shadow-lg shadow-accent/5'
                          : 'border-border bg-surface/30 text-gray-400 hover:border-accent/30 hover:text-white'
                      }`}
                    >
                      <span className="font-bold text-sm truncate">{project.title}</span>
                      <div className="flex justify-between items-center text-[10px] w-full uppercase tracking-wider font-semibold opacity-80">
                        <span>{project.type}</span>
                        <span className={isActive ? 'text-accent-light' : 'text-gray-500'}>
                          {project.status === 'active' ? 'En Progreso' : 'Terminado'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Billing Card (Payments Summary) */}
          {data.payments && (
            <div className="glass rounded-2xl border border-border p-5 space-y-4 bg-gradient-to-br from-[#0c0c14] to-[#08080f]">
              <div className="flex justify-between items-center border-b border-border/50 pb-3">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Resumen Financiero</h3>
                <CreditCard className="w-4 h-4 text-accent-light" />
              </div>
              <div className="space-y-3.5">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-400">Presupuesto Total:</span>
                  <span className="font-bold text-sm text-white">{data.payments.totalBudget}€</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-400">Total Abonado:</span>
                  <span className="font-bold text-sm text-success">{data.payments.totalPaid}€</span>
                </div>
                <div className="flex flex-col gap-1 pt-3 border-t border-border/55">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold text-white">Pendiente de Pago:</span>
                    <span className={`text-xl font-black ${data.payments.pendingPayment > 0 ? 'text-warning' : 'text-success'}`}>
                      {data.payments.pendingPayment}€
                    </span>
                  </div>
                  {data.payments.pendingPayment > 0 && (
                    <p className="text-[10px] text-warning/80 mt-1 flex items-center gap-1 bg-warning/5 border border-warning/15 p-2 rounded">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Listo para facturación y cobro final.</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Active Project Details */}
        <div className="lg:col-span-8 space-y-6">
          {activeProject ? (
            <div className="space-y-6">
              
              {/* Project Title and Progress Header */}
              <div className="glass rounded-2xl border border-border p-6 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] bg-accent/15 text-accent-light font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                      {activeProject.type}
                    </span>
                    <h2 className="text-2xl font-extrabold text-white tracking-tight mt-2">{activeProject.title}</h2>
                  </div>
                  <div className="text-right">
                    <span className="text-3xl font-black text-accent">{progressPercent}%</span>
                    <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mt-0.5">Progreso Total</p>
                  </div>
                </div>

                <div className="w-full h-2 bg-surface border border-border rounded-full overflow-hidden">
                  <div className="h-full bg-accent transition-all duration-500 rounded-full" style={{ width: `${progressPercent}%` }} />
                </div>
              </div>

              {/* Grid: Audios / Tasks */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Audiomix / Bounces Section */}
                <div className="glass rounded-2xl border border-border p-5 flex flex-col gap-4">
                  <div className="flex items-center gap-2 border-b border-border/50 pb-3">
                    <Headphones className="w-4 h-4 text-accent" />
                    <h4 className="font-bold text-sm text-white uppercase tracking-wider">Últimas Mezclas / Audios</h4>
                  </div>
                  
                  {activeProject.bounces && activeProject.bounces.length > 0 ? (
                    <div className="space-y-2 flex-1 overflow-y-auto max-h-[360px] pr-1 scrollbar-thin">
                      {activeProject.bounces.map((bounce: any) => (
                        <WaveformPlayer 
                          key={bounce.id} 
                          fileId={bounce.id} 
                          fileName={bounce.name} 
                          artistName={data.artist.name} 
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center bg-surface-elevated/20 rounded-xl border border-dashed border-border/50">
                      <Music className="w-8 h-8 text-gray-600 mb-2" />
                      <p className="text-xs text-text-secondary italic">Aún no hay audios cargados en la carpeta.</p>
                    </div>
                  )}
                </div>

                {/* Tasks / Checklist Section */}
                <div className="glass rounded-2xl border border-border p-5 flex flex-col gap-4">
                  <div className="flex items-center gap-2 border-b border-border/50 pb-3">
                    <CheckCircle2 className="w-4 h-4 text-accent" />
                    <h4 className="font-bold text-sm text-white uppercase tracking-wider">Estado del Trabajo</h4>
                  </div>

                  {activeProject.tasks && activeProject.tasks.length > 0 ? (
                    <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[360px] pr-1">
                      {activeProject.tasks.map((task: any) => {
                        const isCompleted = task.status === 'completed';
                        return (
                          <div 
                            key={task.id} 
                            className={`flex items-start gap-3 p-2.5 rounded-xl border transition-colors ${
                              isCompleted 
                                ? 'bg-success/5 border-success/10 text-gray-400' 
                                : 'bg-surface-elevated/30 border-border text-gray-200'
                            }`}
                          >
                            <div className="mt-0.5 shrink-0">
                              {isCompleted ? (
                                <CheckCircle2 className="w-4 h-4 text-success" />
                              ) : (
                                <Circle className="w-4 h-4 text-text-secondary opacity-40" />
                              )}
                            </div>
                            <span className={`text-xs font-semibold leading-normal ${isCompleted ? 'line-through opacity-70' : ''}`}>
                              {task.title}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center bg-surface-elevated/20 rounded-xl border border-dashed border-border/50">
                      <CheckCircle2 className="w-8 h-8 text-gray-600 mb-2" />
                      <p className="text-xs text-text-secondary italic">No hay tareas o fases configuradas.</p>
                    </div>
                  )}
                </div>

              </div>

            </div>
          ) : (
            <div className="glass p-12 rounded-2xl border border-border text-center">
              <p className="text-text-secondary">Selecciona un proyecto para ver sus detalles.</p>
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
