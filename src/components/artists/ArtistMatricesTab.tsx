'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, Plus, Table2, Trash2, Calendar, FileText, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ProductionGridBoard } from '@/components/projects/ProductionGrid';
import { customAlert, customConfirm, customPrompt } from '@/lib/dialog';


export function ArtistMatricesTab({ artistId, artistName }: { artistId: string; artistName?: string }) {
  const searchParams = useSearchParams();
  const [matrices, setMatrices] = useState<any[]>([]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeMatrixId, setActiveMatrixId] = useState<string | null>(searchParams.get('matrixId'));

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newMatrixName, setNewMatrixName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsModalOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    fetchMatrices();
  }, [artistId]);

  const fetchMatrices = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/artists/${artistId}/matrices`);
      if (res.ok) {
        const data = await res.json();
        setMatrices(data.matrices || []);
      } else {
        const err = await res.json();
        console.error('fetchMatrices error:', err);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const createMatrix = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMatrixName.trim()) {
      customAlert('Por favor, escribe un nombre para la matriz');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/artists/${artistId}/matrices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newMatrixName.trim() })
      });
      if (res.ok) {
        const result = await res.json();
        setNewMatrixName('');
        setIsModalOpen(false);
        fetchMatrices();
        customAlert('Matriz creada con éxito');
        if (result.matrix) {
          setActiveMatrixId(result.matrix.id);
        }
      } else {
        const err = await res.json();
        customAlert(`Error al crear matriz: ${err.error} - ${err.details}`);
      }
    } catch (e: any) {
      console.error(e);
      customAlert(`Error: ${e.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteMatrix = async (matrixId: string) => {
    if (!await customConfirm('¿Seguro que quieres eliminar esta matriz por completo?')) return;
    try {
      const res = await fetch(`/api/artists/${artistId}/matrices/${matrixId}`, { method: 'DELETE' });
      if (res.ok) {
        if (activeMatrixId === matrixId) setActiveMatrixId(null);
        fetchMatrices();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const togglePortalSharing = async (matrixId: string, shared: boolean) => {
    try {
      const res = await fetch(`/api/artists/${artistId}/matrices/${matrixId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sharedInPortal: shared })
      });
      if (res.ok) {
        fetchMatrices();
      } else {
        customAlert('Error al actualizar el estado de compartir');
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-accent" /></div>;
  }

  if (activeMatrixId) {
    const matrix = matrices.find(m => m.id === activeMatrixId);
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={() => setActiveMatrixId(null)} className="text-text-secondary hover:text-text-primary">
            Volver a Matrices
          </Button>
          <ChevronRight className="w-4 h-4 text-text-secondary" />
          <h2 className="font-bold text-text-primary text-xl">{matrix?.name || 'Matriz'}</h2>
        </div>
        
        <div className="glass rounded-xl p-6 border border-border">
          <ProductionGridBoard 
            artistId={artistId} 
            matrixId={activeMatrixId} 
            matrixName={matrix?.name} 
            artistName={artistName}
          />
        </div>
      </div>
    );
  }

  // Separate active and completed matrices
  const activeMatrices = [];
  const completedMatrices = [];
  
  for (const m of matrices) {
    const grid = m.productionGrid;
    let isActive = false;
    
    if (grid && Array.isArray(grid.rows) && Array.isArray(grid.columns) && grid.rows.length > 0 && grid.columns.length > 0) {
      for (const row of grid.rows) {
        for (const col of grid.columns) {
           const cell = row.cells?.[col.id];
           if (!cell || cell.status !== 'done') {
             isActive = true;
             break;
           }
        }
        if (isActive) break;
      }
    } else {
      isActive = true;
    }
    
    if (isActive) {
      activeMatrices.push(m);
    } else {
      completedMatrices.push(m);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-text-primary">Matrices de Producción</h3>
          <p className="text-sm text-text-secondary">Trackea tus proyectos, canciones y fases.</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}><Plus className="w-4 h-4 mr-2" /> Nueva Matriz</Button>
      </div>

      {activeMatrices.length === 0 && completedMatrices.length === 0 ? (
        <div className="glass rounded-xl p-12 text-center text-text-secondary border border-dashed border-border">
          <Table2 className="w-12 h-12 mx-auto mb-4 opacity-50 text-accent" />
          <p>No tienes matrices creadas para este artista.</p>
        </div>
      ) : activeMatrices.length === 0 ? (
        <div className="glass rounded-xl p-12 text-center text-text-secondary border border-dashed border-border">
          <p>No tienes matrices activas en este momento.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeMatrices.map(m => (
            <div key={m.id} className="glass rounded-xl p-5 border border-border hover:border-accent/50 transition-all group relative">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <Table2 className="w-5 h-5 text-accent" />
                  <h4 className="font-bold text-lg text-text-primary">{m.name}</h4>
                </div>
                <button onClick={() => deleteMatrix(m.id)} className="p-1.5 text-text-secondary hover:text-error rounded hover:bg-error/10 opacity-0 group-hover:opacity-100 transition-all">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              
              <div className="flex items-center gap-4 text-xs text-text-secondary mb-6">
                <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Sinc. Google Calendar</span>
                <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Fases Personalizables</span>
              </div>

              <div className="flex items-center justify-between text-xs text-text-secondary border-t border-border/30 pt-3 mt-3 mb-4">
                <span className="font-medium">Compartir en Portal</span>
                <input 
                  type="checkbox" 
                  checked={m.sharedInPortal || false} 
                  onChange={async (e) => {
                    const checked = e.target.checked;
                    await togglePortalSharing(m.id, checked);
                  }}
                  className="w-4 h-4 accent-accent cursor-pointer rounded"
                />
              </div>

              <Button className="w-full" variant="secondary" onClick={() => setActiveMatrixId(m.id)}>
                Abrir Matriz
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Completed Matrices Section */}
      {completedMatrices.length > 0 && (
        <div className="mt-12">
          <button 
            onClick={() => setShowCompleted(!showCompleted)}
            className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors mb-4 w-full"
          >
            <ChevronRight className={`w-5 h-5 transition-transform ${showCompleted ? 'rotate-90' : ''}`} />
            <h4 className="text-lg font-bold">Matrices Completadas ({completedMatrices.length})</h4>
            <div className="h-px bg-border flex-1 ml-4" />
          </button>
          
          {showCompleted && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in slide-in-from-top-4 duration-300">
              {completedMatrices.map((m: any) => (
                <div 
                  key={m.id} 
                  className="glass rounded-xl p-5 border border-border/50 hover:border-accent/30 transition-all group relative flex flex-col justify-between opacity-70 hover:opacity-100 bg-surface/50"
                >
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <Table2 className="w-5 h-5 text-success shrink-0" />
                        <h4 className="font-bold text-lg text-text-primary truncate line-through decoration-text-secondary/50">{m.name}</h4>
                      </div>
                      <button 
                        onClick={() => deleteMatrix(m.id)} 
                        className="p-1.5 text-text-secondary hover:text-error rounded hover:bg-error/10 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                        title="Eliminar Matriz"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 mt-4">
                    <div className="flex items-center gap-4 text-[10px] text-text-secondary">
                      <span className="text-success font-medium">Completada</span>
                    </div>
                    
                    <Button 
                      className="w-full text-xs h-8" 
                      variant="outline" 
                      onClick={() => setActiveMatrixId(m.id)}
                    >
                      Ver Matriz
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal Nueva Matriz */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setIsModalOpen(false)}
        >
          <div 
            className="glass w-full max-w-md rounded-xl border border-border p-6 shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-text-primary mb-4 flex items-center gap-2">
              <Table2 className="w-5 h-5 text-accent" />
              Crear Nueva Matriz
            </h2>
            
            <form onSubmit={createMatrix} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
                  Nombre de la Matriz
                </label>
                <input 
                  autoFocus
                  type="text" 
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                  placeholder="Ej: Álbum 2026, Single de Verano..."
                  value={newMatrixName}
                  onChange={(e) => setNewMatrixName(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Table2 className="w-4 h-4 mr-2" />}
                  Crear Matriz
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
