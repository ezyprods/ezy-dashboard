import { Button } from "@/components/ui/Button";
import { Plus, FolderPlus, UploadCloud } from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="space-y-6 animate-fade-in">
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
          <Button>
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
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Placeholder Card 1 */}
              <div className="bg-surface-elevated rounded-lg p-4 border border-border card-hover cursor-pointer group">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-surface border border-border overflow-hidden">
                    <img src="https://i.pravatar.cc/150?u=1" alt="Artist" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-text-primary">María López</h3>
                    <p className="text-sm text-text-secondary">EP "Sueños"</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#6c5ce7]/20 text-[#a29bfe]">Producción</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Placeholder Card 2 */}
              <div className="bg-surface-elevated rounded-lg p-4 border border-border card-hover cursor-pointer group">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-surface border border-border overflow-hidden">
                    <img src="https://i.pravatar.cc/150?u=2" alt="Artist" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-text-primary">Los Rebeldes</h3>
                    <p className="text-sm text-text-secondary">Single "Fuego"</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#00cec9]/20 text-[#00cec9]">Mix & Master</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (Sidebars) */}
        <div className="space-y-6">
          
          {/* This Week Panel */}
          <div className="glass rounded-xl p-6 border border-border">
            <h2 className="text-lg font-semibold mb-4">Esta semana</h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-error mt-2" />
                <div>
                  <p className="text-sm font-medium text-text-primary">Entrega de Mix (María López)</p>
                  <p className="text-xs text-text-secondary">Mañana, 18:00</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-warning mt-2" />
                <div>
                  <p className="text-sm font-medium text-text-primary">Revisión de arreglos</p>
                  <p className="text-xs text-text-secondary">Viernes, 10:00</p>
                </div>
              </div>
            </div>
          </div>

          {/* Pending Payments */}
          <div className="glass rounded-xl p-6 border border-border">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-error">Pagos pendientes</h2>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-error/10 border border-error/20">
                <span className="text-sm font-medium">Los Rebeldes</span>
                <span className="text-sm font-bold text-error">€450</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
