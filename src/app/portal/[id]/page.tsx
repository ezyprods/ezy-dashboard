'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, PlayCircle, Music, CheckCircle2, Circle } from 'lucide-react';
import { AudioPlayer } from '@/components/projects/AudioPlayer';

export default function PortalPage() {
  const params = useParams();
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchPortal = async () => {
      try {
        const res = await fetch(`/api/portal/${params.id}`);
        if (!res.ok) throw new Error('Portal no encontrado');
        const json = await res.json();
        setData(json);
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
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!data || data.error) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-white flex justify-center items-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold">Portal no disponible</h1>
          <p className="text-text-secondary">El enlace caducó o no es válido.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-text-primary font-sans">
      {/* Header */}
      <header className="border-b border-white/10 bg-white/5 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex justify-between items-center">
          <div>
            <p className="text-xs text-text-secondary uppercase tracking-wider font-semibold mb-1">
              {data.producerName}
            </p>
            <h1 className="text-xl font-bold">Portal de {data.artist.name}</h1>
          </div>
          <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
            <Music className="w-5 h-5 text-accent-light" />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-12 space-y-12">
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold">Tus Proyectos Activos</h2>
          <p className="text-text-secondary">Escucha las últimas mezclas y revisa el progreso.</p>
        </div>

        {data.projects.length === 0 ? (
          <div className="glass p-12 rounded-2xl border border-white/10 text-center">
            <p className="text-text-secondary">No hay proyectos activos en este momento.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {data.projects.map((project: any) => {
              const completedTasks = project.tasks.filter((t: any) => t.status === 'completed').length;
              const totalTasks = project.tasks.length;
              const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

              return (
                <div key={project.id} className="glass rounded-2xl border border-white/10 overflow-hidden">
                  <div className="p-6 border-b border-white/10 bg-white/5">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-xl font-bold">{project.title}</h3>
                        <p className="text-sm text-text-secondary uppercase tracking-wider mt-1">{project.type}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-accent">{progress}%</div>
                        <p className="text-xs text-text-secondary">Progreso</p>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="w-full h-1.5 bg-white/10 rounded-full mt-6 overflow-hidden">
                      <div className="h-full bg-accent" style={{ width: `${progress}%` }} />
                    </div>
                  </div>

                  <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Escuchas */}
                    <div>
                      <h4 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-4">Últimas Mezclas</h4>
                      {project.bounces.length === 0 ? (
                        <p className="text-sm text-text-secondary italic">Aún no hay audios disponibles.</p>
                      ) : (
                        <div className="space-y-3">
                          {project.bounces.map((bounce: any) => (
                            <AudioPlayer key={bounce.id} fileId={bounce.id} fileName={bounce.name} />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Tareas */}
                    <div>
                      <h4 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-4">Estado del Trabajo</h4>
                      {project.tasks.length === 0 ? (
                        <p className="text-sm text-text-secondary italic">No hay tareas listadas.</p>
                      ) : (
                        <div className="space-y-2">
                          {project.tasks.map((task: any) => (
                            <div key={task.id} className="flex items-start gap-3">
                              <div className="mt-0.5">
                                {task.status === 'completed' ? (
                                  <CheckCircle2 className="w-4 h-4 text-success" />
                                ) : (
                                  <Circle className="w-4 h-4 text-text-secondary opacity-50" />
                                )}
                              </div>
                              <span className={`text-sm ${task.status === 'completed' ? 'text-text-secondary line-through' : 'text-text-primary'}`}>
                                {task.title}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
